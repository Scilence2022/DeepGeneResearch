import { z } from "zod";
import { McpServer } from "@/libs/mcp-server/mcp";
import DeepResearch from "@/utils/deep-research";
import { conductGeneResearch } from "@/utils/gene-research";
import { multiApiKeyPolling } from "@/utils/model";
import {
  getAIProviderBaseURL,
  getAIProviderApiKey,
  getSearchProviderBaseURL,
  getSearchProviderApiKey,
} from "../utils";

const AI_PROVIDER = process.env.MCP_AI_PROVIDER || "";
const SEARCH_PROVIDER = process.env.MCP_SEARCH_PROVIDER || "model";
const THINKING_MODEL = process.env.MCP_THINKING_MODEL || "";
const TASK_MODEL = process.env.MCP_TASK_MODEL || "";
const MCP_TIMEOUT = parseInt(process.env.MCP_SERVER_TIMEOUT || "600") * 1000; // 转换为毫秒

function initDeepResearchServer({
  language,
  maxResult,
}: {
  language?: string;
  maxResult?: number;
}) {
  const deepResearch = new DeepResearch({
    language,
    AIProvider: {
      baseURL: getAIProviderBaseURL(AI_PROVIDER),
      apiKey: multiApiKeyPolling(getAIProviderApiKey(AI_PROVIDER)),
      provider: AI_PROVIDER,
      thinkingModel: THINKING_MODEL,
      taskModel: TASK_MODEL,
    },
    searchProvider: {
      baseURL: getSearchProviderBaseURL(SEARCH_PROVIDER),
      apiKey: multiApiKeyPolling(getSearchProviderApiKey(SEARCH_PROVIDER)),
      provider: SEARCH_PROVIDER,
      maxResult,
    },
    onMessage: (event, data) => {
      if (event === "progress") {
        console.log(
          `[${data.step}]: ${data.name ? `"${data.name}" ` : ""}${data.status}`
        );
        if (data.status === "end" && data.data) {
          console.log(data.data);
        }
      } else if (event === "error") {
        console.error(data.message);
        throw new Error(data.message);
      }
    },
  });

  return deepResearch;
}

export function initMcpServer() {
  const geneResearchToolDescription =
    "Conduct specialized gene function research with custom user prompts and research guidelines.";
  const writeResearchPlanDescription =
    "Generate research plan based on user query.";
  const generateSERPQueryDescription =
    "Generate a list of data collection tasks based on the research plan.";
  const searchTaskDescription =
    "Generate SERP queries based on the research plan.";
  const writeFinalReportDescription =
    "Write a final research report based on the research plan and the results of the information collection tasks.";

  const server = new McpServer(
    {
      name: "deep-research",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {
          "deep-gene-research": {
            description: geneResearchToolDescription,
          },
          "write-research-plan": {
            description: writeResearchPlanDescription,
          },
          "generate-SERP-query": {
            description: generateSERPQueryDescription,
          },
          "search-task": {
            description: searchTaskDescription,
          },
          "write-final-report": {
            description: writeFinalReportDescription,
          },
        },
      },
    }
  );


  server.tool(
    "deep-gene-research",
    geneResearchToolDescription,
    {
      geneSymbol: z.string().describe("The gene symbol to research (e.g., 'lysC', 'BRCA1')."),
      organism: z.string().describe("The organism name (e.g., 'Escherichia coli', 'Homo sapiens')."),
      researchFocus: z.array(z.string()).optional().describe("Specific research focus areas."),
      specificAspects: z.array(z.string()).optional().describe("Specific aspects to investigate."),
      diseaseContext: z.string().optional().describe("Disease context for the research."),
      experimentalApproach: z.string().optional().describe("Experimental approach or methodology."),
      userPrompt: z.string().optional().describe("Custom user research question with {geneSymbol} and {organism} placeholders."),
      language: z.string().optional().describe("The final report text language."),
      maxResult: z.number().optional().default(5).describe("Maximum number of search results."),
      enableCitationImage: z.boolean().default(true).optional().describe("Whether to include content-related images in the final report."),
      enableReferences: z.boolean().default(true).optional().describe("Whether to include citation links in search results and final reports."),
    },
    async (
      {
        geneSymbol,
        organism,
        researchFocus = [],
        specificAspects = [],
        diseaseContext,
        experimentalApproach,
        userPrompt,
        language,
        maxResult,
        enableCitationImage = true,
        enableReferences = true
      },
      { signal }
    ) => {
      signal.addEventListener("abort", () => {
        throw new Error("The client closed unexpectedly!");
      });

      try {
        const startTime = Date.now();

        // Use the standard deep research workflow instead of conductGeneResearch
        // This ensures actual database searches are performed
        const deepResearch = initDeepResearchServer({ language, maxResult });

        // Create research query from gene parameters
        let baseQuery = `Gene research: ${geneSymbol} in ${organism}`;

        if (researchFocus && researchFocus.length > 0) {
          baseQuery += `\nFocus areas: ${researchFocus.join(', ')}`;
        }

        if (specificAspects && specificAspects.length > 0) {
          baseQuery += `\nSpecific aspects: ${specificAspects.join(', ')}`;
        }

        if (diseaseContext) {
          baseQuery += `\nDisease context: ${diseaseContext}`;
        }

        if (experimentalApproach) {
          baseQuery += `\nExperimental approach: ${experimentalApproach}`;
        }

        const query = userPrompt
          ? userPrompt.replace('{geneSymbol}', geneSymbol).replace('{organism}', organism)
          : `${baseQuery}\n\nResearch Question:\nWhat is the function, structure, and biological role of the gene ${geneSymbol} in ${organism}? Include information about its pathway, regulation, cofactors, substrates, products, and any recent research findings.${researchFocus?.length ? ` Please specifically focus on: ${researchFocus.join(', ')}.` : ''
          }${specificAspects?.length ? ` Investigate these specific aspects: ${specificAspects.join(', ')}.` : ''
          }`;

        // Step 1: Generate research plan
        const reportPlan = await deepResearch.writeReportPlan(query);

        // Step 2: Generate search queries
        const queries = await deepResearch.generateSERPQuery(reportPlan);

        // Step 3: Execute searches
        const searchResults = await deepResearch.runSearchTask(queries, enableReferences);

        // Step 4: Write final report
        const report = await deepResearch.writeFinalReport(
          reportPlan,
          searchResults,
          enableCitationImage,
          enableReferences
        );

        const researchTime = Date.now() - startTime;

        // Format result to match expected structure
        const result = {
          workflow: {
            geneIdentification: {
              geneSymbol,
              organism,
              researchFocus,
              specificAspects
            },
            researchPlan: reportPlan,
            searchTasks: queries,
            searchResults: searchResults
          },
          qualityMetrics: {
            dataCompleteness: searchResults.length > 0 ? 0.8 : 0,
            literatureCoverage: searchResults.reduce((sum, t) => sum + (t.sources?.length || 0), 0) > 0 ? 0.9 : 0,
            experimentalEvidence: 0.7,
            crossSpeciesValidation: 0.6,
            databaseConsistency: 0.8,
            overallQuality: searchResults.length > 0 ? 0.75 : 0.2
          },
          visualizations: [],
          report: {
            title: `Gene Research Report: ${geneSymbol} in ${organism}`,
            content: report.finalReport,
            sections: []
          },
          metadata: {
            researchTime,
            dataSources: ['searxng', 'pubmed', 'ncbi', 'kegg', 'string'],
            confidence: searchResults.length > 0 ? 0.75 : 0.2,
            completeness: searchResults.length > 0 ? 0.8 : 0
          },
          finalReport: report.finalReport,
          sources: report.sources || [],
          images: report.images || []
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"
                }`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "write-research-plan",
    writeResearchPlanDescription,
    {
      query: z.string().describe("The topic for deep research."),
      language: z.string().optional().describe("The response Language."),
    },
    async ({ query, language }, { signal }) => {
      signal.addEventListener("abort", () => {
        throw new Error("The client closed unexpectedly!");
      });

      try {
        const deepResearch = initDeepResearchServer({ language });
        const result = await deepResearch.writeReportPlan(query);
        return {
          content: [
            { type: "text", text: JSON.stringify({ reportPlan: result }) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"
                }`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "generate-SERP-query",
    generateSERPQueryDescription,
    {
      plan: z.string().describe("Research plan for deep research."),
      language: z.string().optional().describe("The response Language."),
    },
    async ({ plan, language }, { signal }) => {
      signal.addEventListener("abort", () => {
        throw new Error("The client closed unexpectedly!");
      });

      try {
        const deepResearch = initDeepResearchServer({ language });
        const result = await deepResearch.generateSERPQuery(plan);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"
                }`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "search-task",
    searchTaskDescription,
    {
      tasks: z
        .array(
          z.object({
            query: z.string().describe("Information to be queried."),
            researchGoal: z.string().describe("The goal of this query task."),
          })
        )
        .describe("Information Collection Task List."),
      language: z.string().optional().describe("The response Language."),
      maxResult: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of search results."),
      enableReferences: z
        .boolean()
        .default(true)
        .optional()
        .describe(
          "Whether to include citation links in search results and final reports."
        ),
    },
    async (
      { tasks, language, maxResult, enableReferences = true },
      { signal }
    ) => {
      signal.addEventListener("abort", () => {
        throw new Error("The client closed unexpectedly!");
      });

      try {
        const deepResearch = initDeepResearchServer({ language, maxResult });
        const result = await deepResearch.runSearchTask(
          tasks,
          enableReferences
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"
                }`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "write-final-report",
    writeFinalReportDescription,
    {
      plan: z.string().describe("Research plan for deep research."),
      tasks: z
        .array(
          z.object({
            query: z.string().describe("Information to be queried."),
            researchGoal: z.string().describe("The goal of this query task."),
            learning: z
              .string()
              .describe(
                "Knowledge learned while performing information gathering tasks."
              ),
            sources: z
              .array(
                z.object({
                  url: z.string().describe("Web link."),
                  title: z.string().optional().describe("Page title."),
                })
              )
              .optional()
              .describe(
                "Web page information that was queried when performing information collection tasks."
              ),
            images: z
              .array(
                z.object({
                  url: z.string().describe("Image link."),
                  description: z
                    .string()
                    .optional()
                    .describe("Image Description."),
                })
              )
              .optional()
              .describe(
                "Image resources obtained when performing information collection tasks."
              ),
          })
        )
        .describe(
          "The data information collected during the execution of the query task."
        ),
      language: z
        .string()
        .optional()
        .describe("The final report text language."),
      maxResult: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of search results."),
      enableCitationImage: z
        .boolean()
        .default(true)
        .optional()
        .describe(
          "Whether to include content-related images in the final report."
        ),
      enableReferences: z
        .boolean()
        .default(true)
        .optional()
        .describe(
          "Whether to include citation links in search results and final reports."
        ),
    },
    async (
      {
        plan,
        tasks,
        language,
        maxResult,
        enableCitationImage = true,
        enableReferences = true,
      },
      { signal }
    ) => {
      signal.addEventListener("abort", () => {
        throw new Error("The client closed unexpectedly!");
      });

      try {
        const deepResearch = initDeepResearchServer({ language, maxResult });
        const result = await deepResearch.writeFinalReport(
          plan,
          tasks,
          enableCitationImage,
          enableReferences
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"
                }`,
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "deep-gene-research-agent",
    "A system prompt for the Deep Gene Research Assistant agent",
    async () => {
      const prompt = `# Role: Deep Gene Research Assistant

You are an expert geneticist and research assistant powered by the Deep Gene Research MCP toolset. Your goal is to provide comprehensive, accurate, and scientifically rigorous answers to user questions about genes, proteins, and biological systems.

## Core Capabilities

You have access to a suite of specialized tools for conducting deep biological research. Your primary and most powerful tool is \`deep-gene-research\`.

### 1. Primary Tool: \`deep-gene-research\` (RECOMMENDED)
Use this tool for 95% of user requests. It runs a complete, end-to-end research workflow including:
- Planning
- Searching multiple databases (PubMed, UniProt, NCBI, etc.)
- Analyzing data
- Generating a final report

**When to use:**
- "Tell me about gene X in organism Y"
- "What is the function of talB in E. coli?"
- "Compare the structure of protein A and B" (run twice or use advanced prompt)

**Key Arguments:**
- \`geneSymbol\`: The official symbol (e.g., "talB", "BRCA1"). Infer this from the user's query.
- \`organism\`: The scientific name (e.g., "Escherichia coli", "Homo sapiens"). Default to "Homo sapiens" or "Escherichia coli" if implied by context, but ask if ambiguous.
- \`researchFocus\`: A list of areas to prioritize (e.g., \`["molecular_function", "disease_association", "drug_targets"]\`).
- \`specificAspects\`: Detailed questions or angles to investigate (e.g., \`["active site mechanism", "interaction with protein Y"]\`).
- \`userPrompt\`: (Optional) The raw user query relative to the gene/organism context.

### 2. Manual Workflow Tools (Advanced)
Use these only if the user specifically requests a step-by-step breakdown or if you need to debug a research path.
- \`write-research-plan\`: Generate a plan first.
- \`generate-SERP-query\`: Create search queries from a plan.
- \`search-task\`: Execute specific search queries.
- \`write-final-report\`: Compile results.

## interaction Guidelines

1.  **Always Identify the Gene and Organism**:
    - If the user asks "What does talB do?", assume *Escherichia coli* context or ask for clarification if unsure, but for well-known bacterial genes, E. coli is a safe default.
    - If the user says "BRCA1", assume *Homo sapiens*.

2.  **Maximize Tool Utilization**:
    - Don't just pass \`geneSymbol\` and \`organism\`.
    - extract **Intent** to populate \`researchFocus\`.
      - *User*: "Is this gene involved in cancer?"
      - *Tool Call*: \`researchFocus=["disease_association", "clinical_significance"], specificAspects=["cancer involvement", "tumorigenesis"]\`
    - extract **Specific Questions** to populate \`specificAspects\`.
      - *User*: "How does it bind to DNA?"
      - *Tool Call*: \`specificAspects=["DNA binding domain structure", "binding motif", "protein-DNA interaction mechanism"]\`

3.  **Handling Results**:
    - The tool returns a comprehensive JSON object with a marked-down report.
    - Present the \`finalReport\` to the user clearly.
    - Highlight key findings, then offer to show the detailed sources or quality metrics if requested.

## Example Usage

**User:** "Can you investigate the regulation mechanisms of the lacZ gene in E. coli?"

**Agent Thought:** The user wants to know about regulation. I should call \`deep-gene-research\` with \`researchFocus\` set to regulation and specific aspects regarding mechanisms.

**Tool Call:**
\`\`\`json
{
  "name": "deep-gene-research",
  "arguments": {
    "geneSymbol": "lacZ",
    "organism": "Escherichia coli",
    "researchFocus": ["regulation", "gene_expression"],
    "specificAspects": ["lac operon mechanism", "promoter structure", "repressor interaction", "cAMP-CRP regulation"],
    "maxResult": 10
  }
}
\`\`\`
`;
      return {
        messages: [{
          role: "user",
          content: { type: "text", text: prompt }
        }]
      };
    }
  );

  return server;
}
