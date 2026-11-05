import { z } from "zod";
import { geneResearchInput } from "./task-parameters";
import { McpServer } from "@/libs/mcp-server/mcp";
import { initDeepResearchServer } from "@/services/research-engine";
import { taskQueue } from "@/services/task-queue";
import { taskStore } from "@/services/task-store";
import { createFetchSignal } from "@/utils/fetch-signal";
import { projectTaskResult } from "@/services/task-result-projection";

const MCP_SERVER_BASE_URL = (process.env.MCP_SERVER_BASE_URL || "").trim().replace(/\/+$/, "");

function formatMcpUrl(path: string): string {
  return MCP_SERVER_BASE_URL ? `${MCP_SERVER_BASE_URL}${path}` : path;
}

function asJsonText(data: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(data)
    }],
  };
}

export function initMcpServer() {
  // Loading an MCP route is also the durable worker's restart signal. The
  // singleton makes this safe across the stateless MCP server instances.
  void taskQueue.start().catch(error => {
    console.error('[TaskQueue] Failed to recover durable research tasks:', error);
  });

  const geneResearchToolDescription =
    "Queue specialized gene function research with custom user prompts and research guidelines.";

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
        },
      },
    }
  );


  server.tool(
    "deep-gene-research",
    geneResearchToolDescription,
    geneResearchInput,
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
        literatureBudget,
        fullTextBudget,
        enableCitationImage = true,
        enableReferences = true,
        returnReportAsUrl = false,
        returnDetailsAsUrl = false,
        includeCodeXomicsAnnotationProposal = true,
        forceRefresh = false,
        userDocumentIds = [],
        target,
        currentAnnotation,
        idempotencyKey,
        correlationId,
      },
      { signal }
    ) => {
      try {
        signal.throwIfAborted();
        // 创建异步任务
        const task = await taskQueue.addTask({
          geneSymbol,
          organism,
          researchFocus,
          specificAspects,
          diseaseContext,
          experimentalApproach,
          userPrompt,
          language,
          maxResult,
          literatureBudget,
          fullTextBudget,
          enableCitationImage,
          enableReferences,
          returnReportAsUrl,
          returnDetailsAsUrl,
          includeCodeXomicsAnnotationProposal,
          forceRefresh,
          userDocumentIds,
          target,
          currentAnnotation,
          idempotencyKey,
          correlationId,
        });

        // 返回任务 ID 和状态
        const taskPath = `/api/mcp/tasks/${task.id}`;
        return asJsonText({
          taskId: task.id,
          status: task.status,
          eventSeq: task.eventSeq,
          correlationId: task.parameters.correlationId || null,
          message: "Research task has been queued. Use get-task-status or the task URL to retrieve results.",
          taskUrl: formatMcpUrl(taskPath),
          progressUrl: formatMcpUrl(`${taskPath}/progress`)
        });
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

  // 添加任务状态查询工具
  server.tool(
    "get-task-status",
    "Get the status and result of a gene research task.",
    {
      taskId: z.string().min(1).max(128).describe("The ID of the task to query."),
      resultMode: z.enum(["full", "annotation"]).optional().default("full").describe(
        "Use annotation for a bounded projection containing the annotation proposal and compact metadata; full preserves the complete research result."
      ),
    },
    async ({ taskId, resultMode }, { signal }) => {
      try {
        signal.throwIfAborted();
        await taskQueue.start();
        const task = await taskStore.getTask(taskId);
        if (!task || task.parameters.mode === "general") {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: Task ${taskId} not found`,
              },
            ],
          };
        }

        return asJsonText({
          taskId: task.id,
          status: task.status,
          progress: task.progress,
          step: task.step,
          eventSeq: task.eventSeq,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          resultMode,
          result: projectTaskResult(task.result, resultMode),
          error: task.error,
          parameters: task.parameters
        });
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
    "cancel-research-run",
    "Request cancellation of a queued or running gene research run. The task record remains available for audit and recovery.",
    { taskId: z.string().describe("The research run/task ID to cancel.") },
    async ({ taskId }) => {
      const cancelled = await taskQueue.cancelTask(taskId);
      if (!cancelled) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error: Task ${taskId} cannot be cancelled` }],
        };
      }
      const task = await taskStore.getTask(taskId);
      return asJsonText({ taskId, status: task?.status || 'cancel_requested', eventSeq: task?.eventSeq || 0 });
    }
  );

  server.tool(
    "write-research-plan",
    "Generate a focused research plan from a gene or biology query.",
    {
      query: z.string().trim().min(1).max(8_000).describe("The research query to plan."),
      language: z.string().optional().describe("The response language."),
      maxResult: z.number().int().min(1).max(20).optional().default(5).describe("Maximum search results to configure for downstream steps."),
    },
    async ({ query, language, maxResult }, { signal }) => {
      signal.throwIfAborted();
      const deepResearch = initDeepResearchServer({ language, maxResult });
      const reportPlan = await deepResearch.writeReportPlan(query, createFetchSignal(signal, 120_000));
      signal.throwIfAborted();
      return asJsonText({ reportPlan });
    }
  );

  server.tool(
    "generate-SERP-query",
    "Generate search tasks from a research plan.",
    {
      plan: z.string().min(1).max(40_000).describe("The research plan returned by write-research-plan."),
      language: z.string().optional().describe("The response language."),
      maxResult: z.number().int().min(1).max(20).optional().default(5).describe("Maximum search results to configure for downstream steps."),
    },
    async ({ plan, language, maxResult }, { signal }) => {
      signal.throwIfAborted();
      const deepResearch = initDeepResearchServer({ language, maxResult });
      const tasks = await deepResearch.generateSERPQuery(plan, createFetchSignal(signal, 120_000));
      signal.throwIfAborted();
      return asJsonText({ tasks });
    }
  );

  server.tool(
    "search-task",
    "Execute search tasks and summarize source-backed findings.",
    {
      tasks: z.array(z.object({
        query: z.string().min(1).max(2_000),
        researchGoal: z.string().max(4_000).optional().default(""),
      })).max(20).describe("Search tasks returned by generate-SERP-query."),
      language: z.string().optional().describe("The response language."),
      maxResult: z.number().int().min(1).max(20).optional().default(5).describe("Maximum number of search results per task."),
      enableReferences: z.boolean().optional().default(true).describe("Whether to include source references."),
    },
    async ({ tasks, language, maxResult, enableReferences }, { signal }) => {
      signal.throwIfAborted();
      const deepResearch = initDeepResearchServer({ language, maxResult });
      const completedTasks = await deepResearch.runSearchTask(tasks, enableReferences, createFetchSignal(signal, 240_000));
      signal.throwIfAborted();
      return asJsonText({ tasks: completedTasks });
    }
  );

  server.tool(
    "write-final-report",
    "Compile completed search tasks into a final research report.",
    {
      plan: z.string().min(1).max(40_000).describe("The research plan returned by write-research-plan."),
      tasks: z.array(z.object({
        query: z.string().min(1).max(2_000),
        researchGoal: z.string().max(4_000).optional().default(""),
        learning: z.string().max(60_000),
        sources: z.array(z.any()).max(100).optional(),
        images: z.array(z.any()).max(100).optional(),
      })).max(20).describe("Completed tasks returned by search-task."),
      language: z.string().optional().describe("The response language."),
      maxResult: z.number().int().min(1).max(20).optional().default(5).describe("Maximum search results to configure for the research engine."),
      enableCitationImage: z.boolean().optional().default(true).describe("Whether to include citation images."),
      enableReferences: z.boolean().optional().default(true).describe("Whether to include source references."),
    },
    async (
      { plan, tasks, language, maxResult, enableCitationImage, enableReferences },
      { signal }
    ) => {
      signal.throwIfAborted();
      const deepResearch = initDeepResearchServer({ language, maxResult });
      const report = await deepResearch.writeFinalReport(
        plan,
        tasks,
        enableCitationImage,
        enableReferences,
        createFetchSignal(signal, 240_000),
      );
      signal.throwIfAborted();
      return asJsonText(report);
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
Use this tool for 95% of user requests. It queues a complete, end-to-end research workflow including:
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
- \`includeCodeXomicsAnnotationProposal\`: Defaults to true. Keep this enabled when the result may be merged into CodeXomics gene annotations.

### 2. Manual Workflow Tools (Advanced)
Use these only if the user specifically requests a step-by-step breakdown or if you need to debug a research path.
- \`write-research-plan\`: Generate a plan first.
- \`generate-SERP-query\`: Create search queries from a plan.
- \`search-task\`: Execute specific search queries.
- \`write-final-report\`: Compile results.
- \`get-task-status\`: Retrieve status and final results for a queued \`deep-gene-research\` task.

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
    - \`deep-gene-research\` returns a \`taskId\` first. Use \`get-task-status\` until the task is \`completed\` or \`failed\`.
    - When completed, present the \`finalReport\` or \`download.reportUrl\` to the user clearly.
    - For durable CodeXomics integration, prefer CodeXomics \`start_annotation_research\` and poll \`get_annotation_research_workflow\`; that workflow archives this full task as a verified gene attachment before creating a ChangeSet.
    - If this task was started directly through DGR, call CodeXomics \`archive_annotation_research\` with the exact \`taskId\`, \`correlationId\`, and resolved feature identifier first. Then pass \`result.annotationProposal\` plus \`researchRun=taskId\` to \`create_annotation_changeset\`. CodeXomics rejects DGR proposals that do not match a citation-verified archived task. Never merge a Markdown report directly.
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
