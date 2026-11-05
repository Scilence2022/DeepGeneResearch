import { z } from "zod";
import { SUPPORTED_GENE_ANNOTATION_FEATURE_TYPES } from "@/contracts/gene-annotation-target";

export const geneResearchInput = {
  geneSymbol: z.string().min(1).max(128).describe("The gene symbol to research (e.g., 'lysC', 'BRCA1')."),
  organism: z.string().min(1).max(256).describe("The organism name (e.g., 'Escherichia coli', 'Homo sapiens')."),
  researchFocus: z.array(z.string().min(1).max(128)).max(20).optional().describe("Specific research focus areas."),
  specificAspects: z.array(z.string().min(1).max(256)).max(30).optional().describe("Specific aspects to investigate."),
  diseaseContext: z.string().max(1000).optional().describe("Disease context for the research."),
  experimentalApproach: z.string().max(1000).optional().describe("Experimental approach or methodology."),
  userPrompt: z.string().max(8000).optional().describe("Custom user research question with {geneSymbol} and {organism} placeholders."),
  language: z.string().max(64).optional().describe("The final report text language."),
  maxResult: z.number().int().min(1).max(100).optional().default(5).describe("Maximum number of results per search query."),
  literatureBudget: z.number().int().min(10).max(2000).optional().describe(
    "Total PubMed abstracts retained for synthesis. Defaults to a comprehensive budget; raise toward 2000 for exhaustively studied genes.",
  ),
  fullTextBudget: z.number().int().min(1).max(100).optional().describe(
    "Open-access full texts attempted for verifiable evidence spans. Defaults well above the legacy 8-document cap.",
  ),
  enableCitationImage: z.boolean().default(true).optional().describe("Whether to include content-related images in the final report."),
  enableReferences: z.boolean().default(true).optional().describe("Whether to include citation links in search results and final reports."),
  returnReportAsUrl: z.boolean().default(false).optional().describe("When true, return the Research Report as a downloadable URL instead of inline content."),
  returnDetailsAsUrl: z.boolean().default(false).optional().describe("When true, return the Research Details (workflow, sources, metadata) as a downloadable URL instead of inline content."),
  includeCodeXomicsAnnotationProposal: z.boolean().default(true).optional().describe("When true, include a CodeXomics-ready annotationProposal with conservative updates and evidence references."),
  forceRefresh: z.boolean().default(false).optional().describe("Bypass and invalidate a matching cached research result before running this task."),
  userDocumentIds: z.array(z.string().regex(/^sha256:[a-f0-9]{64}$/i)).max(8).optional().describe(
    "Content-addressed user PDFs uploaded through /api/mcp/documents. These are parsed and read before abstract-only evidence is used.",
  ),
  target: z.object({
    workspaceId: z.string().min(1).max(512),
    genomeId: z.string().min(1).max(512),
    annotationRevision: z.number().int().nonnegative(),
    featureId: z.string().min(1).max(512),
    featureHash: z.string().min(1).max(512),
    annotationId: z.string().max(512).nullable().optional(),
    featureType: z.enum(SUPPORTED_GENE_ANNOTATION_FEATURE_TYPES).describe(
      "Supported gene annotation feature type. CodeXomics prefers CDS when co-located gene and CDS records exist.",
    ),
    chromosome: z.string().min(1).max(512),
    organism: z.string().max(256).nullable().optional(),
    locusTag: z.string().max(256).nullable().optional(),
    geneSymbol: z.string().max(128).nullable().optional(),
    proteinId: z.string().max(256).nullable().optional(),
    coordinates: z.object({ start: z.number(), end: z.number(), strand: z.union([z.string(), z.number()]).nullable().optional() }).optional(),
    assemblyAccession: z.string().max(256).nullable().optional(),
    assemblySha256: z.string().max(128).nullable().optional(),
    taxonId: z.union([z.string(), z.number()]).nullable().optional(),
    proteinSha256: z.string().max(128).nullable().optional(),
  }).optional().describe("Exact immutable target returned by CodeXomics resolve_annotation_target. Required for a proposal that can be committed."),
  currentAnnotation: z.object({
    product: z.string().max(1024).nullable().optional(),
    note: z.array(z.string().min(1).max(8192)).max(32).optional(),
    EC_number: z.array(z.string().min(1).max(64)).max(64).optional(),
    go_terms: z.array(z.string().min(1).max(64)).max(256).optional(),
    ko: z.array(z.string().min(1).max(128)).max(128).optional(),
    pathway: z.array(z.string().min(1).max(256)).max(256).optional(),
    db_xref: z.array(z.string().min(1).max(512)).max(512).optional(),
  }).strict().optional().describe("Bounded current scientific qualifier snapshot derived by CodeXomics from the same resolved annotation revision. Used to suppress no-op updates, including repeated DGR notes, and permit conservative placeholder product refinement."),
  idempotencyKey: z.string().min(1).max(256).optional().describe("Stable key preventing duplicate logical research runs."),
  correlationId: z.string().min(1).max(256).optional().describe("Cross-service trace ID."),
};
export const geneResearchRequest = z.object(geneResearchInput).strict();
