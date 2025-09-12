import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import {
  systemInstruction,
  systemQuestionPrompt,
  reportPlanPrompt,
  serpQueriesPrompt,
  queryResultPrompt,
  citationRulesPrompt,
  searchResultPrompt,
  searchKnowledgeResultPrompt,
  reviewPrompt,
  finalReportCitationImagePrompt,
  finalReportReferencesPrompt,
  finalReportPrompt,
} from "@/constants/prompts";
import {
  geneResearchSystemInstruction,
  geneResearchQuestionPrompt,
  geneReportPlanPrompt,
  geneSerpQueriesPrompt,
  geneSearchResultPrompt,
  geneFinalReportPrompt,
  geneKnowledgeGraphPrompt,
} from "@/constants/gene-research-prompts";

export function getSERPQuerySchema() {
  return z
    .array(
      z
        .object({
          query: z.string().describe("The SERP query."),
          researchGoal: z
            .string()
            .describe(
              "First talk about the goal of the research that this query is meant to accomplish, then go deeper into how to advance the research once the results are found, mention additional research directions. Be as specific as possible, especially for additional research directions. JSON reserved words should be escaped."
            ),
        })
        .required({ query: true, researchGoal: true })
    )
    .describe(`List of SERP queries.`);
}

export function getSERPQueryOutputSchema() {
  const SERPQuerySchema = getSERPQuerySchema();
  return JSON.stringify(zodToJsonSchema(SERPQuerySchema), null, 4);
}

export function getSystemPrompt() {
  return systemInstruction.replace("{now}", new Date().toISOString());
}

export function generateQuestionsPrompt(query: string) {
  return systemQuestionPrompt.replace("{query}", query);
}

export function writeReportPlanPrompt(query: string) {
  return reportPlanPrompt.replace("{query}", query);
}

export function generateSerpQueriesPrompt(plan: string) {
  return serpQueriesPrompt
    .replace("{plan}", plan)
    .replace("{outputSchema}", getSERPQueryOutputSchema());
}

export function processResultPrompt(query: string, researchGoal: string) {
  return queryResultPrompt
    .replace("{query}", query)
    .replace("{researchGoal}", researchGoal);
}

export function processSearchResultPrompt(
  query: string,
  researchGoal: string,
  results: Source[],
  enableReferences: boolean
) {
  const context = results.map(
    (result, idx) =>
      `<content index="${idx + 1}" url="${result.url}">\n${
        result.content
      }\n</content>`
  );
  return (
    searchResultPrompt + (enableReferences ? `\n\n${citationRulesPrompt}` : "")
  )
    .replace("{query}", query)
    .replace("{researchGoal}", researchGoal)
    .replace("{context}", context.join("\n"));
}

export function processSearchKnowledgeResultPrompt(
  query: string,
  researchGoal: string,
  results: Knowledge[]
) {
  const context = results.map(
    (result, idx) =>
      `<content index="${idx + 1}" url="${location.host}">\n${
        result.content
      }\n</content>`
  );
  return searchKnowledgeResultPrompt
    .replace("{query}", query)
    .replace("{researchGoal}", researchGoal)
    .replace("{context}", context.join("\n"));
}

export function reviewSerpQueriesPrompt(
  plan: string,
  learning: string[],
  suggestion: string
) {
  const learnings = learning.map(
    (detail) => `<learning>\n${detail}\n</learning>`
  );
  return reviewPrompt
    .replace("{plan}", plan)
    .replace("{learnings}", learnings.join("\n"))
    .replace("{suggestion}", suggestion)
    .replace("{outputSchema}", getSERPQueryOutputSchema());
}

export function writeFinalReportPrompt(
  plan: string,
  learning: string[],
  source: Source[],
  images: ImageSource[],
  requirement: string,
  enableCitationImage: boolean,
  enableReferences: boolean
) {
  const learnings = learning.map(
    (detail) => `<learning>\n${detail}\n</learning>`
  );
  const sources = source.map(
    (item, idx) =>
      `<source index="${idx + 1}" url="${item.url}">\n${item.title}\n</source>`
  );
  const imageList = images.map(
    (source, idx) => `${idx + 1}. ![${source.description}](${source.url})`
  );
  return (
    finalReportPrompt +
    (enableCitationImage
      ? `\n**Including meaningful images from the previous research in the report is very helpful.**\n\n${finalReportCitationImagePrompt}`
      : "") +
    (enableReferences ? `\n\n${finalReportReferencesPrompt}` : "")
  )
    .replace("{plan}", plan)
    .replace("{learnings}", learnings.join("\n"))
    .replace("{sources}", sources.join("\n"))
    .replace("{images}", imageList.join("\n"))
    .replace("{requirement}", requirement);
}

// Gene research specific prompt functions
export function getGeneResearchSystemPrompt() {
  return geneResearchSystemInstruction.replace("{now}", new Date().toISOString());
}

export function generateGeneResearchQuestionsPrompt(query: string) {
  return geneResearchQuestionPrompt.replace("{query}", query);
}

export function writeGeneReportPlanPrompt(query: string) {
  return geneReportPlanPrompt.replace("{query}", query);
}

export function generateGeneSerpQueriesPrompt(plan: string) {
  return geneSerpQueriesPrompt
    .replace("{plan}", plan)
    .replace("{outputSchema}", getSERPQueryOutputSchema());
}

export function processGeneSearchResultPrompt(
  query: string,
  researchGoal: string,
  results: Source[],
  enableReferences: boolean
) {
  const context = results.map(
    (result, idx) =>
      `<content index="${idx + 1}" url="${result.url}">\n${
        result.content
      }\n</content>`
  );
  return (
    geneSearchResultPrompt + (enableReferences ? `\n\n${citationRulesPrompt}` : "")
  )
    .replace("{query}", query)
    .replace("{researchGoal}", researchGoal)
    .replace("{context}", context.join("\n"));
}

export function writeGeneFinalReportPrompt(
  plan: string,
  learning: string[],
  source: Source[],
  images: ImageSource[],
  requirement: string,
  enableCitationImage: boolean,
  enableReferences: boolean
) {
  const learnings = learning.map(
    (detail) => `<learning>\n${detail}\n</learning>`
  );
  const sources = source.map(
    (item, idx) =>
      `<source index="${idx + 1}" url="${item.url}">\n${item.title}\n</source>`
  );
  const imageList = images.map(
    (source, idx) => `${idx + 1}. ![${source.description}](${source.url})`
  );
  return (
    geneFinalReportPrompt +
    (enableCitationImage
      ? `\n**Including meaningful images from the previous research in the report is very helpful.**\n\n${finalReportCitationImagePrompt}`
      : "") +
    (enableReferences ? `\n\n${finalReportReferencesPrompt}` : "")
  )
    .replace("{plan}", plan)
    .replace("{learnings}", learnings.join("\n"))
    .replace("{sources}", sources.join("\n"))
    .replace("{images}", imageList.join("\n"))
    .replace("{requirement}", requirement);
}

export function generateGeneKnowledgeGraphPrompt() {
  return geneKnowledgeGraphPrompt;
}

// Function to detect if query is gene research related
export function isGeneResearchQuery(query: string): boolean {
  const geneKeywords = [
    'gene', 'protein', 'enzyme', 'mutation', 'expression', 'pathway',
    'molecular', 'biochemical', 'catalytic', 'binding', 'interaction',
    'transcription', 'translation', 'regulation', 'function', 'structure',
    'domain', 'motif', 'active site', 'substrate', 'cofactor', 'kinase',
    'phosphatase', 'receptor', 'ligand', 'hormone', 'metabolism',
    'biosynthesis', 'degradation', 'oxidation', 'reduction', 'isomerization',
    'polymerization', 'dimerization', 'oligomerization', 'folding',
    'unfolding', 'denaturation', 'renaturation', 'allosteric', 'cooperative',
    'feedback', 'inhibition', 'activation', 'modulation', 'phosphorylation',
    'acetylation', 'methylation', 'ubiquitination', 'sumoylation',
    'glycosylation', 'lipidation', 'proteolysis', 'cleavage', 'splicing',
    'alternative splicing', 'exon', 'intron', 'promoter', 'enhancer',
    'silencer', 'transcription factor', 'chromatin', 'histone', 'nucleosome',
    'epigenetic', 'methylation', 'acetylation', 'chromatin remodeling',
    'chromosome', 'genome', 'genomic', 'genetic', 'allele', 'genotype',
    'phenotype', 'trait', 'inheritance', 'dominant', 'recessive', 'codominant',
    'incomplete dominance', 'pleiotropy', 'epistasis', 'penetrance',
    'expressivity', 'heritability', 'linkage', 'recombination', 'crossing over',
    'meiosis', 'mitosis', 'cell cycle', 'apoptosis', 'necrosis', 'autophagy',
    'senescence', 'differentiation', 'development', 'embryogenesis',
    'organogenesis', 'morphogenesis', 'pattern formation', 'cell fate',
    'determination', 'specification', 'commitment', 'plasticity', 'stem cell',
    'progenitor', 'precursor', 'lineage', 'clonal', 'monoclonal', 'polyclonal',
    'tumor', 'cancer', 'oncogene', 'tumor suppressor', 'proto-oncogene',
    'oncoprotein', 'tumor protein', 'carcinogen', 'mutagen', 'teratogen',
    'genotoxic', 'cytotoxic', 'apoptotic', 'anti-apoptotic', 'pro-apoptotic',
    'survival', 'proliferation', 'growth', 'division', 'migration', 'invasion',
    'metastasis', 'angiogenesis', 'vasculogenesis', 'lymphangiogenesis',
    'inflammation', 'immune', 'immunity', 'immunological', 'antigen',
    'antibody', 'immunoglobulin', 'complement', 'cytokine', 'chemokine',
    'interferon', 'interleukin', 'tumor necrosis factor', 'transforming growth factor',
    'epidermal growth factor', 'fibroblast growth factor', 'platelet-derived growth factor',
    'vascular endothelial growth factor', 'insulin-like growth factor',
    'nerve growth factor', 'brain-derived neurotrophic factor', 'neurotrophin',
    'neurotrophic', 'neurogenic', 'neurogenesis', 'synaptogenesis', 'synaptic',
    'synapse', 'neurotransmitter', 'dopamine', 'serotonin', 'norepinephrine',
    'epinephrine', 'acetylcholine', 'gaba', 'glutamate', 'glycine', 'histamine',
    'adenosine', 'atp', 'camp', 'cgmp', 'ip3', 'dag', 'ca2+', 'na+', 'k+',
    'cl-', 'mg2+', 'zn2+', 'fe2+', 'fe3+', 'cu+', 'cu2+', 'mn2+', 'co2+',
    'ni2+', 'mo6+', 'se2-', 's2-', 'so42-', 'po43-', 'co32-', 'hco3-',
    'oh-', 'h+', 'ph', 'buffer', 'acid', 'base', 'alkaline', 'neutral',
    'oxidation', 'reduction', 'redox', 'electron', 'proton', 'neutron',
    'nucleus', 'nuclear', 'cytoplasm', 'cytoplasmic', 'mitochondria',
    'mitochondrial', 'endoplasmic reticulum', 'golgi', 'lysosome', 'peroxisome',
    'ribosome', 'ribosomal', 'nucleolus', 'nucleolar', 'centrosome',
    'centriole', 'microtubule', 'microfilament', 'intermediate filament',
    'cytoskeleton', 'cytoskeletal', 'membrane', 'membranous', 'lipid',
    'phospholipid', 'cholesterol', 'sterol', 'steroid', 'hormone',
    'receptor', 'ligand', 'binding', 'affinity', 'specificity', 'selectivity',
    'competition', 'inhibition', 'activation', 'modulation', 'regulation',
    'control', 'feedback', 'feedforward', 'cascade', 'pathway', 'network',
    'circuit', 'module', 'component', 'element', 'factor', 'agent',
    'molecule', 'compound', 'substance', 'chemical', 'biochemical',
    'metabolic', 'metabolism', 'anabolism', 'catabolism', 'synthesis',
    'biosynthesis', 'degradation', 'breakdown', 'cleavage', 'hydrolysis',
    'condensation', 'polymerization', 'depolymerization', 'assembly',
    'disassembly', 'folding', 'unfolding', 'denaturation', 'renaturation',
    'conformation', 'conformational', 'structure', 'structural', 'architecture',
    'topology', 'geometry', 'stereochemistry', 'chirality', 'enantiomer',
    'diastereomer', 'isomer', 'tautomer', 'conformer', 'rotamer',
    'conformation', 'conformational', 'flexibility', 'rigidity', 'stability',
    'instability', 'dynamics', 'kinetics', 'thermodynamics', 'equilibrium',
    'steady state', 'transient', 'intermediate', 'transition state',
    'activation energy', 'barrier', 'rate', 'velocity', 'acceleration',
    'force', 'energy', 'work', 'power', 'efficiency', 'yield', 'conversion',
    'transformation', 'modification', 'alteration', 'change', 'variation',
    'diversity', 'variability', 'heterogeneity', 'homogeneity', 'uniformity',
    'consistency', 'reproducibility', 'repeatability', 'reliability',
    'accuracy', 'precision', 'sensitivity', 'specificity', 'selectivity',
    'affinity', 'avidity', 'potency', 'efficacy', 'effectiveness',
    'efficiency', 'productivity', 'yield', 'output', 'throughput',
    'capacity', 'capability', 'potential', 'ability', 'function',
    'activity', 'action', 'mechanism', 'mode', 'manner', 'way',
    'method', 'approach', 'strategy', 'tactic', 'technique', 'procedure',
    'protocol', 'process', 'operation', 'manipulation', 'treatment',
    'intervention', 'therapy', 'therapeutic', 'pharmacological', 'pharmacological',
    'drug', 'medication', 'medicine', 'pharmaceutical', 'pharmaceutics',
    'pharmacokinetics', 'pharmacodynamics', 'pharmacogenomics', 'pharmacogenetics',
    'toxicology', 'toxic', 'toxicity', 'poison', 'venom', 'toxin',
    'pathogen', 'pathogenic', 'pathogenicity', 'virulence', 'infectivity',
    'contagious', 'infectious', 'epidemic', 'pandemic', 'endemic',
    'outbreak', 'spread', 'transmission', 'contamination', 'pollution',
    'environment', 'environmental', 'ecology', 'ecosystem', 'habitat',
    'niche', 'population', 'community', 'species', 'genus', 'family',
    'order', 'class', 'phylum', 'kingdom', 'domain', 'taxonomy',
    'phylogeny', 'evolution', 'evolutionary', 'adaptation', 'selection',
    'natural selection', 'artificial selection', 'breeding', 'hybridization',
    'crossbreeding', 'inbreeding', 'outbreeding', 'migration', 'dispersal',
    'colonization', 'invasion', 'extinction', 'speciation', 'divergence',
    'convergence', 'parallel evolution', 'convergent evolution', 'divergent evolution',
    'adaptive radiation', 'punctuated equilibrium', 'gradualism', 'saltation',
    'mutation', 'variation', 'polymorphism', 'allele', 'genotype', 'phenotype',
    'trait', 'character', 'feature', 'property', 'attribute', 'characteristic',
    'quality', 'quantity', 'measurement', 'assessment', 'evaluation',
    'analysis', 'examination', 'investigation', 'study', 'research',
    'experiment', 'observation', 'hypothesis', 'theory', 'law', 'principle',
    'rule', 'regulation', 'guideline', 'standard', 'criterion', 'criteria',
    'requirement', 'specification', 'condition', 'constraint', 'limitation',
    'restriction', 'boundary', 'limit', 'threshold', 'cutoff', 'baseline',
    'reference', 'control', 'standard', 'calibration', 'validation',
    'verification', 'confirmation', 'corroboration', 'support', 'evidence',
    'proof', 'demonstration', 'illustration', 'example', 'case', 'instance',
    'sample', 'specimen', 'model', 'simulation', 'prediction', 'forecast',
    'projection', 'estimation', 'approximation', 'calculation', 'computation',
    'algorithm', 'method', 'technique', 'procedure', 'protocol', 'process',
    'workflow', 'pipeline', 'pipeline', 'pipeline', 'pipeline', 'pipeline'
  ];

  const queryLower = query.toLowerCase();
  return geneKeywords.some(keyword => queryLower.includes(keyword));
}
