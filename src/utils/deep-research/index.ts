import { streamText, generateText } from "ai";
import { type GoogleGenerativeAIProviderMetadata } from "@ai-sdk/google";
import { createAIProvider } from "./provider";
import { createSearchProvider } from "./search";
import {
  getSystemPrompt,
  writeReportPlanPrompt,
  generateSerpQueriesPrompt,
  processResultPrompt,
  processSearchResultPrompt,
  writeFinalReportPrompt,
  getSERPQuerySchema,
  isGeneResearchQuery,
  getGeneResearchSystemPrompt,
  generateGeneSerpQueriesPrompt,
  processGeneSearchResultPrompt,
  writeGeneFinalReportPrompt,
} from "./prompts";
import { outputGuidelinesPrompt } from "@/constants/prompts";
import { isNetworkingModel } from "@/utils/model";
import { ThinkTagStreamProcessor, removeJsonMarkdown } from "@/utils/text";
import { pick, unique, flat, isFunction } from "radash";
import { createGeneResearchEngine } from "@/utils/gene-research";
import { assessGeneTargetRelevance } from "@/utils/gene-research/search-providers";
import { formatGenomeAnnotationNoteSection } from "@/utils/gene-research/codexomics-annotation";
import type { CurrentAnnotationSnapshot } from "@/contracts/annotation-change-set";

export interface DeepResearchOptions {
  AIProvider: {
    baseURL: string;
    apiKey?: string;
    provider: string;
    thinkingModel: string;
    taskModel: string;
  };
  searchProvider: {
    baseURL: string;
    apiKey?: string;
    provider: string;
    maxResult?: number;
    scope?: string;
  };
  language?: string;
  onMessage?: (event: string, data: any) => void;
}

interface FinalReportResult {
  title: string;
  finalReport: string;
  learnings: string[];
  sources: Source[];
  images: ImageSource[];
}

export interface DeepResearchSearchTask {
  query: string;
  researchGoal: string;
}

export interface DeepResearchSearchResult {
  query: string;
  researchGoal: string;
  learning: string;
  sources?: {
    url: string;
    title?: string;
  }[];
  images?: {
    url: string;
    description?: string;
  }[];
}

function addQuoteBeforeAllLine(text: string = "") {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

class DeepResearch {
  protected options: DeepResearchOptions;
  onMessage: (event: string, data: any) => void = () => {};
  constructor(options: DeepResearchOptions) {
    this.options = options;
    if (isFunction(options.onMessage)) {
      this.onMessage = options.onMessage;
    }
  }

  async getThinkingModel() {
    const { AIProvider } = this.options;
    const AIProviderBaseOptions = pick(AIProvider, ["baseURL", "apiKey"]);
    return await createAIProvider({
      provider: AIProvider.provider,
      model: AIProvider.thinkingModel,
      ...AIProviderBaseOptions,
    });
  }

  async getTaskModel() {
    const { AIProvider } = this.options;
    const AIProviderBaseOptions = pick(AIProvider, ["baseURL", "apiKey"]);
    return await createAIProvider({
      provider: AIProvider.provider,
      model: AIProvider.taskModel,
      settings:
        ["google", "google-vertex"].includes(AIProvider.provider) &&
        isNetworkingModel(AIProvider.taskModel)
          ? { useSearchGrounding: true }
          : undefined,
      ...AIProviderBaseOptions,
    });
  }

  getResponseLanguagePrompt() {
    return this.options.language
      ? `**Respond in ${this.options.language}**`
      : `**Respond in the same language as the user's language**`;
  }

  async writeReportPlan(query: string): Promise<string> {
    this.onMessage("progress", { step: "report-plan", status: "start" });
    const thinkTagStreamProcessor = new ThinkTagStreamProcessor();
    const result = streamText({
      model: await this.getThinkingModel(),
      system: getSystemPrompt(),
      prompt: [
        writeReportPlanPrompt(query),
        this.getResponseLanguagePrompt(),
      ].join("\n\n"),
    });
    let content = "";
    this.onMessage("message", { type: "text", text: "<report-plan>\n" });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        thinkTagStreamProcessor.processChunk(
          part.textDelta,
          (data) => {
            content += data;
            this.onMessage("message", { type: "text", text: data });
          },
          (data) => {
            this.onMessage("reasoning", { type: "text", text: data });
          }
        );
      } else if (part.type === "reasoning") {
        this.onMessage("reasoning", { type: "text", text: part.textDelta });
      }
    }
    this.onMessage("message", { type: "text", text: "\n</report-plan>\n\n" });
    this.onMessage("progress", {
      step: "report-plan",
      status: "end",
      data: content,
    });
    return content;
  }

  async generateSERPQuery(
    reportPlan: string
  ): Promise<DeepResearchSearchTask[]> {
    this.onMessage("progress", { step: "serp-query", status: "start" });
    const thinkTagStreamProcessor = new ThinkTagStreamProcessor();
    const { text } = await generateText({
      model: await this.getThinkingModel(),
      system: getSystemPrompt(),
      prompt: [
        generateSerpQueriesPrompt(reportPlan),
        this.getResponseLanguagePrompt(),
      ].join("\n\n"),
    });
    const querySchema = getSERPQuerySchema();
    let content = "";
    thinkTagStreamProcessor.processChunk(text, (data) => {
      content += data;
    });
    const data = JSON.parse(removeJsonMarkdown(content));
    thinkTagStreamProcessor.end();
    const result = querySchema.safeParse(data);
    if (result.success) {
      const tasks: DeepResearchSearchTask[] = data.map(
        (item: { query: string; researchGoal?: string }) => ({
          query: item.query,
          researchGoal: item.researchGoal || "",
        })
      );
      this.onMessage("progress", {
        step: "serp-query",
        status: "end",
        data: tasks,
      });
      return tasks;
    } else {
      throw new Error(result.error.message);
    }
  }

  async runSearchTask(
    tasks: DeepResearchSearchTask[],
    enableReferences = true
  ): Promise<SearchTask[]> {
    this.onMessage("progress", { step: "task-list", status: "start" });
    const thinkTagStreamProcessor = new ThinkTagStreamProcessor();
    const results: SearchTask[] = [];
    for await (const item of tasks) {
      this.onMessage("progress", {
        step: "search-task",
        status: "start",
        name: item.query,
      });
      let content = "";
      let searchResult;
      let sources: Source[] = [];
      let images: ImageSource[] = [];
      const { taskModel } = this.options.AIProvider;
      const { provider = "model", maxResult = 5 } = this.options.searchProvider;
      if (provider === "model") {
        const getTools = async () => {
          // Enable OpenAI's built-in search tool
          if (
            provider === "model" &&
            ["openai", "azure", "openaicompatible"].includes(taskModel) &&
            taskModel.startsWith("gpt-4o")
          ) {
            const { openai } = await import("@ai-sdk/openai");
            return {
              web_search_preview: openai.tools.webSearchPreview({
                // optional configuration:
                searchContextSize: maxResult > 5 ? "high" : "medium",
              }),
            };
          } else {
            return undefined;
          }
        };
        const getProviderOptions = () => {
          // Enable OpenRouter's built-in search tool
          if (provider === "model" && taskModel === "openrouter") {
            return {
              openrouter: {
                plugins: [
                  {
                    id: "web",
                    max_results: maxResult ?? 5,
                  },
                ],
              },
            };
          } else {
            return undefined;
          }
        };

        searchResult = streamText({
          model: await this.getTaskModel(),
          system: getSystemPrompt(),
          prompt: [
            processResultPrompt(item.query, item.researchGoal),
            this.getResponseLanguagePrompt(),
          ].join("\n\n"),
          tools: await getTools(),
          providerOptions: getProviderOptions(),
        });
      } else {
        try {
          const result = await createSearchProvider({
            query: item.query,
            ...this.options.searchProvider,
          });

          sources = result.sources;
          images = result.images;
        } catch (err) {
          const errorMessage = `[${provider}]: ${
            err instanceof Error ? err.message : "Search Failed"
          }`;
          throw new Error(errorMessage);
        }
        searchResult = streamText({
          model: await this.getTaskModel(),
          system: getSystemPrompt(),
          prompt: [
            processSearchResultPrompt(
              item.query,
              item.researchGoal,
              sources,
              sources.length > 0 && enableReferences
            ),
            this.getResponseLanguagePrompt(),
          ].join("\n\n"),
        });
      }

      this.onMessage("message", { type: "text", text: "<search-task>\n" });
      this.onMessage("message", { type: "text", text: `## ${item.query}\n\n` });
      this.onMessage("message", {
        type: "text",
        text: `${addQuoteBeforeAllLine(item.researchGoal)}\n\n`,
      });
      for await (const part of searchResult.fullStream) {
        if (part.type === "text-delta") {
          thinkTagStreamProcessor.processChunk(
            part.textDelta,
            (data) => {
              content += data;
              this.onMessage("message", { type: "text", text: data });
            },
            (data) => {
              this.onMessage("reasoning", { type: "text", text: data });
            }
          );
        } else if (part.type === "reasoning") {
          this.onMessage("reasoning", { type: "text", text: part.textDelta });
        } else if (part.type === "source") {
          sources.push(part.source);
        } else if (part.type === "finish") {
          if (part.providerMetadata?.google) {
            const { groundingMetadata } = part.providerMetadata.google;
            const googleGroundingMetadata =
              groundingMetadata as GoogleGenerativeAIProviderMetadata["groundingMetadata"];
            if (googleGroundingMetadata?.groundingSupports) {
              googleGroundingMetadata.groundingSupports.forEach(
                ({ segment, groundingChunkIndices }) => {
                  if (segment.text && groundingChunkIndices) {
                    const index = groundingChunkIndices.map(
                      (idx: number) => `[${idx + 1}]`
                    );
                    content = content.replaceAll(
                      segment.text,
                      `${segment.text}${index.join("")}`
                    );
                  }
                }
              );
            }
          } else if (part.providerMetadata?.openai) {
            // Fixed the problem that OpenAI cannot generate markdown reference link syntax properly in Chinese context
            content = content.replaceAll("【", "[").replaceAll("】", "]");
          }
        }
      }
      thinkTagStreamProcessor.end();

      if (images.length > 0) {
        const imageContent =
          "\n\n---\n\n" +
          images
            .map(
              (source) =>
                `![${source.description || source.url}](${source.url})`
            )
            .join("\n");
        content += imageContent;
        this.onMessage("message", { type: "text", text: imageContent });
      }

      if (sources.length > 0) {
        const sourceContent =
          "\n\n---\n\n" +
          sources
            .map(
              (item, idx) =>
                `[${idx + 1}]: ${item.url}${
                  item.title ? ` "${item.title.replaceAll('"', " ")}"` : ""
                }`
            )
            .join("\n");
        content += sourceContent;
        this.onMessage("message", { type: "text", text: sourceContent });
      }
      this.onMessage("message", { type: "text", text: "\n</search-task>\n\n" });

      const task: SearchTask = {
        query: item.query,
        researchGoal: item.researchGoal,
        state: "completed",
        learning: content,
        sources,
        images,
      };
      results.push(task);
      this.onMessage("progress", {
        step: "search-task",
        status: "end",
        name: item.query,
        data: task,
      });
    }
    this.onMessage("progress", { step: "task-list", status: "end" });
    return results;
  }

  async writeFinalReport(
    reportPlan: string,
    tasks: DeepResearchSearchResult[],
    enableCitationImage = true,
    enableReferences = true
  ): Promise<FinalReportResult> {
    this.onMessage("progress", { step: "final-report", status: "start" });
    const thinkTagStreamProcessor = new ThinkTagStreamProcessor();
    const learnings = tasks.map((item) => item.learning);
    const sources: Source[] = unique(
      flat(tasks.map((item) => item.sources || [])),
      (item) => item.url
    );
    const images: ImageSource[] = unique(
      flat(tasks.map((item) => item.images || [])),
      (item) => item.url
    );
    const result = streamText({
      model: await this.getThinkingModel(),
      system: [getSystemPrompt(), outputGuidelinesPrompt].join("\n\n"),
      prompt: [
        writeFinalReportPrompt(
          reportPlan,
          learnings,
          sources.map((item) => pick(item, ["title", "url"])),
          images,
          "",
          images.length > 0 && enableCitationImage,
          sources.length > 0 && enableReferences
        ),
        this.getResponseLanguagePrompt(),
      ].join("\n\n"),
    });
    let content = "";
    this.onMessage("message", { type: "text", text: "<final-report>\n" });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        thinkTagStreamProcessor.processChunk(
          part.textDelta,
          (data) => {
            content += data;
            this.onMessage("message", { type: "text", text: data });
          },
          (data) => {
            this.onMessage("reasoning", { type: "text", text: data });
          }
        );
      } else if (part.type === "reasoning") {
        this.onMessage("reasoning", { type: "text", text: part.textDelta });
      } else if (part.type === "source") {
        sources.push(part.source);
      } else if (part.type === "finish") {
        if (sources.length > 0) {
          // Check if we have formatted citations (from gene research)
          const hasFormattedCitations = sources.some(source => source.formattedCitation);
          
          let sourceContent = "\n\n---\n\n";
          
          if (hasFormattedCitations) {
            // Use formatted citations for gene research reports
            sourceContent += "## References\n\n";
            sourceContent += sources
              .map((source, idx) => {
                // Use formatted citation if available, otherwise fall back to default format
                if (source.formattedCitation) {
                  return `[${idx + 1}]: ${source.formattedCitation}`;
                } else {
                  return `[${idx + 1}]: ${source.url}${
                    source.title ? ` "${source.title.replaceAll('"', " ")}"` : ""
                  }`;
                }
              })
              .join("\n");
          } else {
            // Use default format for regular reports
            sourceContent += sources
              .map(
                (item, idx) =>
                  `[${idx + 1}]: ${item.url}${
                    item.title ? ` "${item.title.replaceAll('"', " ")}"` : ""
                  }`
              )
              .join("\n");
          }
          
          content += sourceContent;
        }
      }
    }
    this.onMessage("message", { type: "text", text: "\n</final-report>\n\n" });
    thinkTagStreamProcessor.end();

    const title = content
      .split("\n")[0]
      .replaceAll("#", "")
      .replaceAll("*", "")
      .trim();

    const finalReportResult: FinalReportResult = {
      title,
      finalReport: content,
      learnings,
      sources,
      images,
    };
    this.onMessage("progress", {
      step: "final-report",
      status: "end",
      data: finalReportResult,
    });
    return finalReportResult;
  }

  async start(
    query: string,
    enableCitationImage = true,
    enableReferences = true,
    taskId?: string
  ) {
    try {
      // Check if this is a gene research query
      if (isGeneResearchQuery(query)) {
        return await this.conductGeneResearch(query, taskId, undefined, undefined, enableCitationImage);
      }

      // Update task status if taskId is provided
      if (taskId) {
        this.onMessage("task-status", {
          taskId,
          taskStatus: "in-progress",
          step: "report-plan",
          status: "start"
        });
      }

      const reportPlan = await this.writeReportPlan(query);
      
      if (taskId) {
        this.onMessage("task-status", {
          taskId,
          taskStatus: "in-progress",
          step: "serp-query",
          status: "start"
        });
      }

      const tasks = await this.generateSERPQuery(reportPlan);
      
      if (taskId) {
        this.onMessage("task-status", {
          taskId,
          taskStatus: "in-progress",
          step: "task-list",
          status: "start"
        });
      }

      const results = await this.runSearchTask(tasks, enableReferences);
      
      if (taskId) {
        this.onMessage("task-status", {
          taskId,
          taskStatus: "in-progress",
          step: "final-report",
          status: "start"
        });
      }

      const finalReport = await this.writeFinalReport(
        reportPlan,
        results,
        enableCitationImage,
        enableReferences
      );
      
      if (taskId) {
        this.onMessage("task-status", {
          taskId,
          status: "completed",
          result: finalReport
        });
      }
      
      return finalReport;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      this.onMessage("error", { message: errorMessage });
      
      if (taskId) {
        this.onMessage("task-status", {
          taskId,
          status: "failed",
          error: errorMessage
        });
      }
      
      throw new Error(errorMessage);
    }
  }

  // Gene research specific method
  async conductGeneResearch(
    query: string,
    taskId?: string,
    explicitGeneInfo?: {
      geneSymbol: string;
      organism: string;
      target?: {
        featureType?: string | null;
        locusTag?: string | null;
        proteinId?: string | null;
        taxonId?: string | number | null;
      };
      currentAnnotation?: CurrentAnnotationSnapshot;
      researchFocus?: string[];
      specificAspects?: string[];
      diseaseContext?: string;
      experimentalApproach?: string;
      userPrompt?: string;
      literatureBudget?: number;
      fullTextBudget?: number;
      userDocumentIds?: string[];
    },
    signal?: AbortSignal,
    enableVisualization = true
  ) {
    try {
      signal?.throwIfAborted();
      // Update task status if taskId is provided
      if (taskId) {
        this.onMessage("task-status", {
          taskId,
          taskStatus: "in-progress",
          step: "gene-research",
          status: "start"
        });
      }
      
      this.onMessage("progress", { step: "gene-research", status: "start" });
      
      // Extract gene information from query
      // MCP and CodeXomics provide an already resolved target. Never re-infer
      // its gene or organism from an LLM-facing free-text query.
      const geneInfo = explicitGeneInfo || this.extractGeneInfo(query);

      // The user's research question finally drives retrieval: LLM-generated
      // supplemental queries run alongside the template categories.
      const supplementalQueries = await this.generateGeneSupplementalQueries(
        geneInfo,
        explicitGeneInfo?.userPrompt,
        signal
      );

      // Create gene research engine
      const geneEngine = createGeneResearchEngine({
        geneSymbol: geneInfo.geneSymbol,
        organism: geneInfo.organism,
        target: explicitGeneInfo?.target,
        currentAnnotation: explicitGeneInfo?.currentAnnotation,
        researchFocus: geneInfo.researchFocus,
        specificAspects: geneInfo.specificAspects,
        diseaseContext: geneInfo.diseaseContext,
        experimentalApproach: geneInfo.experimentalApproach,
        userPrompt: explicitGeneInfo?.userPrompt,
        userDocumentIds: explicitGeneInfo?.userDocumentIds,
        literatureBudget: explicitGeneInfo?.literatureBudget,
        fullTextBudget: explicitGeneInfo?.fullTextBudget,
        supplementalQueries,
        targetAudience: 'researchers',
        reportType: 'comprehensive',
        enableAPIIntegration: true,
        enableQualityControl: true,
        enableVisualization,
        maxSearchResults: Math.min(100, Math.max(1, this.options.searchProvider.maxResult ?? 5)),
        searchProviders: ['pubmed', 'uniprot', 'ncbi_gene', 'geo', 'pdb', 'kegg', 'string', 'omim', 'ensembl', 'reactome', 'quickgo', 'interpro', 'intact', 'europepmc_preprints'],
        fallbackSearchProvider: this.options.searchProvider,
        ncbiApiKey: process.env.NCBI_API_KEY || process.env.NCBI_EUTILS_API_KEY,
        language: this.options.language,
        signal,
        onProgress: data => this.onMessage('progress', data),
      });

      this.onMessage("progress", { step: "gene-research", status: "processing" });
      
      // Conduct gene research
      const result = await geneEngine.conductResearch();
      signal?.throwIfAborted();

      this.onMessage("progress", { step: "gene-research", status: "end" });

      // Convert gene research result to standard format. Only references the
      // engine actually verified against the exact target are eligible: the
      // extractor's free-text citation mining can surface arbitrary PMIDs
      // (for example a dermatology paper whose number collides with a
      // GeneID), and those must never enter the research bibliography.
      const verifiedPmids = new Set(
        (result.sources || [])
          .filter((source: any) => String(source?.database || '').toLowerCase() === 'pubmed')
          .filter((source: any) => {
            const relevance = source?.structuredData?.targetRelevance;
            return relevance?.accepted === true;
          })
          .map((source: any) => String(
            source?.structuredData?.literatureReferences?.[0]?.pmid
            || source?.provenance?.recordId
            || '',
          ).trim())
          .filter(Boolean),
      );
      const literatureSources = (result.workflow.literatureReview || [])
        .filter(ref => verifiedPmids.has(String(ref?.pmid || '').trim()))
        .map(ref => {
        // Create a simple formatted citation string
        const formattedCitation = ref.authors && ref.year
          ? `${ref.authors.slice(0, 3).join(', ')}${ref.authors.length > 3 ? ' et al.' : ''}. (${ref.year}). ${ref.title}. ${ref.journal || ''}.`
          : `${ref.title} (${ref.year || 'n.d.'})`;

        return {
          title: ref.title,
          url: `https://pubmed.ncbi.nlm.nih.gov/${ref.pmid}/`,
          content: ref.abstract,
          database: 'pubmed',
          formattedCitation, // Add the formatted citation
          // The workflow literature review is the validated, target-bound
          // bibliography. It must never be dropped by a second relevance
          // pass over the bare title/abstract.
          retainedFromLiteratureReview: true,
        };
      });
      const sourceMatchesRequestedGene = (source: {
        title?: string;
        content?: string;
        url?: string;
        database?: string;
        geneSymbol?: string;
        organism?: string;
        targetMatch?: boolean;
        authoritative?: boolean;
        retainedFromLiteratureReview?: boolean;
        structuredData?: Record<string, any>;
      }) => {
        if (source.targetMatch === true && source.authoritative === true) return true;
        if (source.retainedFromLiteratureReview === true) return true;
        const retainedRelevance = source.structuredData?.targetRelevance;
        if (retainedRelevance) return retainedRelevance.accepted === true;
        return assessGeneTargetRelevance(
          source.title || '',
          source.content || '',
          {
            geneSymbol: geneInfo.geneSymbol,
            organism: geneInfo.organism,
            locusTag: explicitGeneInfo?.target?.locusTag || undefined,
            proteinId: explicitGeneInfo?.target?.proteinId || undefined,
          },
        ).accepted;
      };
      const sources = Array.from(
        new Map(
          [...literatureSources, ...(result.sources || [])]
            .filter(source => sourceMatchesRequestedGene(source))
            .filter(source => source?.url)
            .map(source => [source.url, source])
        ).values()
      );

      // Canonical literature counts. Every consumer (archived summary,
      // proposal manifest, report sections) derives its "papers" number from
      // this block so the displayed count can never diverge from the
      // retained bibliography.
      const literatureDatabase = (source: any) => String(source?.database || '').toLowerCase();
      const literatureMetrics = {
        totalPapers: sources.filter(source =>
          ['pubmed', 'europepmc_preprints', 'user_document'].includes(literatureDatabase(source))
        ).length,
        pubmedPapers: sources.filter(source => literatureDatabase(source) === 'pubmed').length,
        directPapers: sources.filter(source =>
          literatureDatabase(source) === 'pubmed'
          && source?.structuredData?.targetRelevance?.directness === 'direct'
        ).length,
        geneLinkedPapers: sources.filter(source =>
          literatureDatabase(source) === 'pubmed'
          && source?.structuredData?.targetRelevance?.directness === 'gene_linked_context'
        ).length,
        preprintPapers: sources.filter(source => literatureDatabase(source) === 'europepmc_preprints').length,
        userDocumentPapers: sources.filter(source => literatureDatabase(source) === 'user_document').length,
      };

      const images = enableVisualization ? result.visualizations.map(viz => ({
        url: `data:image/svg+xml;base64,${Buffer.from(viz.content).toString('base64')}`,
        description: viz.title
      })) : [];

      const templateReport = result.report.title + '\n\n' + result.report.sections.map((s: any) => s.content).join('\n\n');

      // Map-reduce every retained abstract into learnings, then let the LLM
      // synthesize the report from verified evidence. Both degrade silently
      // to the deterministic template output on failure.
      const llmLearnings = await this.summarizeGeneLiterature(
        result.workflow.literatureReview || [],
        geneInfo,
        explicitGeneInfo?.userPrompt,
        signal
      );
      const literatureCoverage = (result.metadata as any)?.searchDiagnostics?.literatureCoverage;
      const coverageSummary = literatureCoverage
        ? `Literature coverage audit: budget ${literatureCoverage.literatureBudget} abstracts, PubMed total matches ${literatureCoverage.pubmedTotalMatchCount ?? 'unknown'}, retained ${literatureCoverage.retainedAbstractCount} abstracts, Gene-linked bibliography ${literatureCoverage.linkedBibliographyRetrieved}/${literatureCoverage.linkedBibliographyRequested}${literatureCoverage.linkedBibliographyComplete ? ' (complete)' : ' (partial)'}.`
        : '';
      const synthesizedReport = await this.synthesizeGeneReport({
        geneInfo,
        userPrompt: explicitGeneInfo?.userPrompt,
        templateReport,
        learnings: llmLearnings,
        sources,
        coverageSummary,
        signal,
        enableReferences: true,
      });
      let finalReport = synthesizedReport || templateReport;

      // The Genome Annotation Note is a hash-bound, citation-bound artifact.
      // It must reach the archived report verbatim, so a synthesized narrative
      // can never paraphrase, relocate, or drop it.
      const annotationNote = (result as any)?.annotationNote ?? null;
      const researchSummary = (result as any)?.researchSummary ?? null;
      if (annotationNote?.text || researchSummary?.headline) {
        const noteSection = formatGenomeAnnotationNoteSection({
          geneSymbol: geneInfo.geneSymbol,
          organism: geneInfo.organism,
          researchSummary,
          curationNote: annotationNote,
        });
        const alreadyPresent = annotationNote?.text
          ? finalReport.includes(annotationNote.text)
          : finalReport.includes('## Genome Annotation Note');
        if (!alreadyPresent) {
          finalReport = `${finalReport.trimEnd()}\n\n${noteSection}`;
        }
      }

      const researchResult = {
        title: result.report.title,
        finalReport,
        annotationNote,
        researchSummary,
        evidenceRecords: (result as any)?.evidenceRecords ?? null,
        learnings: [
          ...llmLearnings,
          ...result.sources.flatMap((source: any) =>
            Array.isArray(source?.fullTextEvidence)
              ? source.fullTextEvidence.map((finding: any) => finding.excerpt)
              : []
          ),
          ...result.workflow.literatureReview.map(ref => ref.abstract),
        ],
        sources,
        images,
        geneResearch: {
          qualityMetrics: result.qualityMetrics,
          visualizations: enableVisualization ? result.visualizations : [],
          workflow: result.workflow
        },
        metadata: {
          ...result.metadata,
          literatureMetrics,
          llmSynthesis: {
            supplementalQueryCount: supplementalQueries.length,
            literatureLearningBatches: llmLearnings.length,
            synthesizedReport: Boolean(synthesizedReport),
          },
        },
      };
      
      // Update task status if taskId is provided
      if (taskId) {
        this.onMessage("task-status", {
          taskId,
          status: "completed",
          result: researchResult
        });
      }
      
      return researchResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Gene research error";
      
      // Update task status if taskId is provided
      if (taskId) {
        this.onMessage("task-status", {
          taskId,
          status: "failed",
          error: errorMessage
        });
      }
      
      this.onMessage("error", {
        message: errorMessage,
      });
      throw err;
    }
  }

  /**
   * LLM-generated supplemental queries derived from the user's actual
   * research question. Template queries remain the retrieval backbone; these
   * adapt it to what the caller asked. Returns [] on any failure.
   */
  private async generateGeneSupplementalQueries(
    geneInfo: {
      geneSymbol: string;
      organism: string;
      target?: { locusTag?: string | null; proteinId?: string | null };
      researchFocus?: string[];
      specificAspects?: string[];
    },
    userPrompt?: string,
    signal?: AbortSignal
  ): Promise<DeepResearchSearchTask[]> {
    const researchQuestion = userPrompt
      ?.replace("{geneSymbol}", geneInfo.geneSymbol)
      .replace("{organism}", geneInfo.organism)
      .trim();
    if (!researchQuestion) return [];
    try {
      signal?.throwIfAborted();
      this.onMessage("progress", { step: "gene-llm-queries", status: "start" });
      const plan = [
        `Target gene: ${geneInfo.geneSymbol} (${geneInfo.organism})`,
        geneInfo.target?.locusTag ? `Locus tag: ${geneInfo.target.locusTag}` : "",
        geneInfo.target?.proteinId ? `Protein accession: ${geneInfo.target.proteinId}` : "",
        geneInfo.researchFocus?.length ? `Requested focus areas: ${geneInfo.researchFocus.join(", ")}` : "",
        geneInfo.specificAspects?.length ? `Specific aspects: ${geneInfo.specificAspects.join(", ")}` : "",
        `User research question: ${researchQuestion}`,
      ].filter(Boolean).join("\n");
      const { text } = await generateText({
        model: await this.getThinkingModel(),
        system: getGeneResearchSystemPrompt(),
        prompt: [generateGeneSerpQueriesPrompt(plan), this.getResponseLanguagePrompt()].join("\n\n"),
        abortSignal: signal,
      });
      const thinkTagStreamProcessor = new ThinkTagStreamProcessor();
      let content = "";
      thinkTagStreamProcessor.processChunk(text, (data) => {
        content += data;
      });
      thinkTagStreamProcessor.end();
      const parsed = JSON.parse(removeJsonMarkdown(content));
      if (!getSERPQuerySchema().safeParse(parsed).success) return [];
      const tasks: DeepResearchSearchTask[] = parsed
        .map((item: { query: string; researchGoal?: string }) => ({
          query: String(item.query || "").trim(),
          researchGoal: String(item.researchGoal || "").trim(),
        }))
        .filter((item: DeepResearchSearchTask) => item.query.length > 0);
      this.onMessage("progress", {
        step: "gene-llm-queries",
        status: "end",
        data: { count: tasks.length },
      });
      return tasks.slice(0, 8);
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn("Gene supplemental query generation failed; template queries stand alone:", error);
      this.onMessage("progress", {
        step: "gene-llm-queries",
        status: "end",
        data: { count: 0, fallback: true },
      });
      return [];
    }
  }

  /**
   * Map-reduce the retained abstracts into LLM learnings so every paper in
   * the literature budget contributes to synthesis instead of only the
   * handful that survived fixed evidence-span caps. Returns [] on failure;
   * template evidence stands alone.
   */
  private async summarizeGeneLiterature(
    literature: Array<{ title?: string; abstract?: string; pmid?: string }>,
    geneInfo: { geneSymbol: string; organism: string },
    userPrompt?: string,
    signal?: AbortSignal
  ): Promise<string[]> {
    try {
      signal?.throwIfAborted();
      const abstracts = literature.filter(ref => ref?.abstract && String(ref.abstract).trim().length > 40);
      if (abstracts.length === 0) return [];
      const batchSize = 20;
      const batches: typeof abstracts[] = [];
      for (let offset = 0; offset < abstracts.length && batches.length < 12; offset += batchSize) {
        batches.push(abstracts.slice(offset, offset + batchSize));
      }
      this.onMessage("progress", {
        step: "gene-llm-learnings",
        status: "start",
        data: { batches: batches.length, abstracts: abstracts.length },
      });
      const query = `Gene research: ${geneInfo.geneSymbol} in ${geneInfo.organism}`;
      const researchGoal = (userPrompt
        ? userPrompt.replace("{geneSymbol}", geneInfo.geneSymbol).replace("{organism}", geneInfo.organism)
        : `Extract the key experimental findings about ${geneInfo.geneSymbol} in ${geneInfo.organism}, including function, regulation, pathway role, complexes, and phenotypes.`)
        + " Report only statements supported by the provided abstracts, each with its citation index.";
      const learnings: string[] = [];
      for (const [index, batch] of batches.entries()) {
        signal?.throwIfAborted();
        const sources: Source[] = batch
          .map(ref => ({
            title: String(ref.title || ""),
            url: ref.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${ref.pmid}/` : "",
            content: String(ref.abstract || "").slice(0, 1_500),
          }))
          .filter(source => source.url && source.content);
        if (sources.length === 0) continue;
        const { text } = await generateText({
          model: await this.getTaskModel(),
          system: getGeneResearchSystemPrompt(),
          prompt: [processGeneSearchResultPrompt(query, researchGoal, sources, true), this.getResponseLanguagePrompt()].join("\n\n"),
          abortSignal: signal,
        });
        const learning = text.trim();
        if (learning) learnings.push(`[literature batch ${index + 1}/${batches.length}]\n${learning}`);
      }
      this.onMessage("progress", {
        step: "gene-llm-learnings",
        status: "end",
        data: { learnings: learnings.length },
      });
      return learnings;
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn("Gene literature summarization failed; template evidence stands alone:", error);
      this.onMessage("progress", {
        step: "gene-llm-learnings",
        status: "end",
        data: { learnings: 0, fallback: true },
      });
      return [];
    }
  }

  /**
   * LLM synthesis of the final gene report from the deterministic engine's
   * structured evidence plus the batch learnings. Streams like the generic
   * report writer; returns null on any failure so the template report is
   * kept verbatim.
   */
  private async synthesizeGeneReport(options: {
    geneInfo: {
      geneSymbol: string;
      organism: string;
      target?: { locusTag?: string | null; proteinId?: string | null };
      researchFocus?: string[];
      specificAspects?: string[];
    };
    userPrompt?: string;
    templateReport: string;
    learnings: string[];
    sources: Source[];
    coverageSummary?: string;
    signal?: AbortSignal;
    enableReferences: boolean;
  }): Promise<string | null> {
    const { geneInfo, userPrompt, templateReport, learnings, sources, coverageSummary, signal, enableReferences } = options;
    try {
      signal?.throwIfAborted();
      this.onMessage("progress", { step: "gene-llm-report", status: "start" });
      const requirement = userPrompt
        ? userPrompt.replace("{geneSymbol}", geneInfo.geneSymbol).replace("{organism}", geneInfo.organism)
        : "";
      const plan = [
        `Target gene: ${geneInfo.geneSymbol} (${geneInfo.organism})`,
        geneInfo.target?.locusTag ? `Locus tag: ${geneInfo.target.locusTag}` : "",
        geneInfo.target?.proteinId ? `Protein accession: ${geneInfo.target.proteinId}` : "",
        geneInfo.researchFocus?.length ? `Requested focus areas: ${geneInfo.researchFocus.join(", ")}` : "",
        geneInfo.specificAspects?.length ? `Specific aspects: ${geneInfo.specificAspects.join(", ")}` : "",
        coverageSummary || "",
        `Verified structured evidence compiled by the deterministic pipeline (treat as authoritative; reconcile conflicts and weigh uncertainty explicitly):\n\n${templateReport.slice(0, 20_000)}`,
      ].filter(Boolean).join("\n\n");
      const result = streamText({
        model: await this.getThinkingModel(),
        system: [getGeneResearchSystemPrompt(), outputGuidelinesPrompt].join("\n\n"),
        prompt: [
          writeGeneFinalReportPrompt(
            plan,
            learnings,
            sources.map(item => pick(item, ["title", "url"])),
            [],
            requirement,
            false,
            sources.length > 0 && enableReferences
          ),
          this.getResponseLanguagePrompt(),
        ].join("\n\n"),
        abortSignal: signal,
      });
      const thinkTagStreamProcessor = new ThinkTagStreamProcessor();
      let content = "";
      this.onMessage("message", { type: "text", text: "<final-report>\n" });
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          thinkTagStreamProcessor.processChunk(
            part.textDelta,
            (data) => {
              content += data;
              this.onMessage("message", { type: "text", text: data });
            },
            (data) => {
              this.onMessage("reasoning", { type: "text", text: data });
            }
          );
        } else if (part.type === "reasoning") {
          this.onMessage("reasoning", { type: "text", text: part.textDelta });
        }
      }
      this.onMessage("message", { type: "text", text: "\n</final-report>\n\n" });
      thinkTagStreamProcessor.end();
      if (!content.trim()) return null;
      if (sources.length > 0 && enableReferences) {
        const hasFormattedCitations = sources.some(source => source.formattedCitation);
        content += "\n\n---\n\n";
        content += hasFormattedCitations ? "## References\n\n" : "";
        content += sources
          .map((source, idx) => {
            if (source.formattedCitation) {
              return `[${idx + 1}]: ${source.formattedCitation}`;
            }
            return `[${idx + 1}]: ${source.url}${source.title ? ` "${source.title.replaceAll('"', " ")}"` : ""}`;
          })
          .join("\n");
      }
      this.onMessage("progress", { step: "gene-llm-report", status: "end" });
      return content;
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn("Gene report synthesis failed; keeping the template report:", error);
      this.onMessage("progress", { step: "gene-llm-report", status: "end", data: { fallback: true } });
      return null;
    }
  }

  // Extract gene information from query
  extractGeneInfo(query: string): {
    geneSymbol: string;
    organism: string;
    researchFocus?: string[];
    specificAspects?: string[];
    diseaseContext?: string;
    experimentalApproach?: string;
  } {
    // Simple extraction - in production, use more sophisticated NLP
    const geneMatch = query.match(/([A-Z][A-Za-z0-9]+)/);
    const organismMatch = query.match(/(Escherichia coli|Corynebacterium glutamicum|Bacillus subtilis|Homo sapiens|Mus musculus|Rattus norvegicus|Drosophila melanogaster|Caenorhabditis elegans|Saccharomyces cerevisiae|Arabidopsis thaliana|Danio rerio|Xenopus laevis)/i);
    
    const geneSymbol = geneMatch ? geneMatch[1] : 'Unknown';
    const organism = organismMatch ? organismMatch[1] : 'Escherichia coli';
    
    // Extract research focuses (can be multiple)
    const researchFocus: string[] = ['general']; // Always include general
    if (query.toLowerCase().includes('disease') || query.toLowerCase().includes('clinical')) {
      researchFocus.push('disease');
    }
    if (query.toLowerCase().includes('structure') || query.toLowerCase().includes('protein')) {
      researchFocus.push('structure');
    }
    if (query.toLowerCase().includes('expression') || query.toLowerCase().includes('regulation')) {
      researchFocus.push('expression');
    }
    if (query.toLowerCase().includes('interaction') || query.toLowerCase().includes('binding')) {
      researchFocus.push('interaction');
    }
    if (query.toLowerCase().includes('evolution') || query.toLowerCase().includes('phylogeny')) {
      researchFocus.push('evolution');
    }
    if (query.toLowerCase().includes('therapeutic') || query.toLowerCase().includes('drug')) {
      researchFocus.push('therapeutic');
    }
    
    // Extract specific aspects
    const specificAspects: string[] = [];
    if (query.toLowerCase().includes('mutation')) specificAspects.push('mutation');
    if (query.toLowerCase().includes('interaction')) specificAspects.push('interaction');
    if (query.toLowerCase().includes('pathway')) specificAspects.push('pathway');
    if (query.toLowerCase().includes('evolution')) specificAspects.push('evolution');
    
    return {
      geneSymbol,
      organism,
      researchFocus,
      specificAspects: specificAspects.length > 0 ? specificAspects : undefined,
      diseaseContext: query.toLowerCase().includes('disease') ? 'general' : undefined,
      experimentalApproach: query.toLowerCase().includes('experimental') ? 'experimental' : undefined
    };
  }
}

export default DeepResearch;
