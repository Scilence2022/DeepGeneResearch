// Biological Research Database Configuration
// Prioritized list of professional scientific literature and pathway databases

export interface BioDatabaseConfig {
  name: string;
  category: 'core_literature' | 'comprehensive' | 'preprint' | 'pathway' | 'protein' | 'structure';
  priority: number;
  url: string;
  searchEndpoint?: string;
  apiRequired: boolean;
  description: string;
}

// 🧬 Core Literature Databases (Highest Priority)
export const CORE_LITERATURE_DATABASES: BioDatabaseConfig[] = [
  {
    name: 'PubMed',
    category: 'core_literature',
    priority: 1,
    url: 'https://pubmed.ncbi.nlm.nih.gov/',
    searchEndpoint: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
    apiRequired: false,
    description: 'Most authoritative biomedical database maintained by NCBI, includes MEDLINE and life science journals with MeSH vocabulary'
  },
  {
    name: 'Web of Science',
    category: 'core_literature',
    priority: 2,
    url: 'https://www.webofscience.com/',
    searchEndpoint: 'https://api.clarivate.com/apis/wos-starter/',
    apiRequired: true,
    description: 'Core Collection with powerful citation tracking, maintained by Clarivate'
  },
  {
    name: 'Scopus',
    category: 'comprehensive',
    priority: 3,
    url: 'https://www.scopus.com/',
    searchEndpoint: 'https://api.elsevier.com/content/search/scopus',
    apiRequired: true,
    description: 'Broader coverage than WoS, especially for non-English journals and conferences, maintained by Elsevier'
  },
  {
    name: 'Embase',
    category: 'comprehensive',
    priority: 4,
    url: 'https://www.embase.com/',
    searchEndpoint: 'https://api.elsevier.com/content/search/embase',
    apiRequired: true,
    description: 'Specialized in biomedical and pharmaceutical research, comprehensive in drug development and pharmacology'
  }
];

// 🌐 General Academic Search Engines
export const GENERAL_ACADEMIC_DATABASES: BioDatabaseConfig[] = [
  {
    name: 'Google Scholar',
    category: 'comprehensive',
    priority: 5,
    url: 'https://scholar.google.com/',
    apiRequired: false,
    description: 'Free academic search engine, easy to use with cited-by functionality and direct PDF links'
  }
];

// ⚡ Preprint Servers
export const PREPRINT_DATABASES: BioDatabaseConfig[] = [
  {
    name: 'bioRxiv',
    category: 'preprint',
    priority: 6,
    url: 'https://www.biorxiv.org/',
    searchEndpoint: 'https://api.biorxiv.org/',
    apiRequired: false,
    description: 'Main biology preprint server operated by CSHL, covers almost all biology subfields'
  },
  {
    name: 'medRxiv',
    category: 'preprint',
    priority: 7,
    url: 'https://www.medrxiv.org/',
    searchEndpoint: 'https://api.medrxiv.org/',
    apiRequired: false,
    description: 'Medical and clinical research preprint server'
  },
  {
    name: 'arXiv (q-bio)',
    category: 'preprint',
    priority: 8,
    url: 'https://arxiv.org/archive/q-bio',
    searchEndpoint: 'https://export.arxiv.org/api/query',
    apiRequired: false,
    description: 'Quantitative Biology section, important for bioinformatics and computational biology'
  }
];

// 🧬 Specialized Biological Databases
export const PATHWAY_DATABASES: BioDatabaseConfig[] = [
  {
    name: 'KEGG',
    category: 'pathway',
    priority: 9,
    url: 'https://www.genome.jp/kegg/',
    searchEndpoint: 'https://rest.kegg.jp/',
    apiRequired: false,
    description: 'Kyoto Encyclopedia of Genes and Genomes - comprehensive pathway and genome database'
  },
  {
    name: 'EcoCyc',
    category: 'pathway',
    priority: 10,
    url: 'https://ecocyc.org/',
    searchEndpoint: 'https://websvc.biocyc.org/',
    apiRequired: false,
    description: 'E. coli pathway database with detailed metabolic and regulatory networks'
  },
  {
    name: 'Reactome',
    category: 'pathway',
    priority: 11,
    url: 'https://reactome.org/',
    searchEndpoint: 'https://reactome.org/ContentService/',
    apiRequired: false,
    description: 'Curated database of biological pathways and processes'
  }
];

// Database selection strategy
export interface SearchStrategy {
  useLiteratureFirst: boolean;
  includePreprints: boolean;
  includePathways: boolean;
  webSearchAsBackup: boolean;
  maxResultsPerDatabase: number;
}

export const DEFAULT_BIO_SEARCH_STRATEGY: SearchStrategy = {
  useLiteratureFirst: true,
  includePreprints: true,
  includePathways: true,
  webSearchAsBackup: true,
  maxResultsPerDatabase: 10
};

// Get prioritized database list based on query type
export function getPrioritizedDatabases(queryType: 'general' | 'pathway' | 'structure' | 'literature'): BioDatabaseConfig[] {
  const allDatabases = [
    ...CORE_LITERATURE_DATABASES,
    ...GENERAL_ACADEMIC_DATABASES,
    ...PREPRINT_DATABASES,
    ...PATHWAY_DATABASES
  ];

  // Filter and sort by priority
  let filteredDatabases = allDatabases;
  
  if (queryType === 'pathway') {
    // For pathway queries, prioritize KEGG, EcoCyc, Reactome
    filteredDatabases = [
      ...PATHWAY_DATABASES,
      ...CORE_LITERATURE_DATABASES,
      ...PREPRINT_DATABASES
    ];
  } else if (queryType === 'literature') {
    // For literature queries, focus on papers
    filteredDatabases = [
      ...CORE_LITERATURE_DATABASES,
      ...GENERAL_ACADEMIC_DATABASES,
      ...PREPRINT_DATABASES
    ];
  }

  return filteredDatabases.sort((a, b) => a.priority - b.priority);
}

// Check if query should use specialized biological search
export function shouldUseBioSearch(query: string): boolean {
  const bioKeywords = [
    'gene', 'protein', 'pathway', 'enzyme', 'metabolism', 'biosynthesis',
    'molecular', 'biochemical', 'cellular', 'genomic', 'transcription',
    'expression', 'regulation', 'interaction', 'mutation', 'function',
    'KEGG', 'Reactome', 'EcoCyc', 'UniProt', 'PDB', 'NCBI'
  ];
  
  const queryLower = query.toLowerCase();
  return bioKeywords.some(keyword => queryLower.includes(keyword.toLowerCase()));
}

// Detect query type for database prioritization
export function detectQueryType(query: string): 'general' | 'pathway' | 'structure' | 'literature' {
  const queryLower = query.toLowerCase();
  
  if (queryLower.includes('pathway') || queryLower.includes('metabol') || 
      queryLower.includes('kegg') || queryLower.includes('reactome') ||
      queryLower.includes('ecocyc') || queryLower.includes('biosynthesis')) {
    return 'pathway';
  }
  
  if (queryLower.includes('structure') || queryLower.includes('pdb') ||
      queryLower.includes('crystal') || queryLower.includes('3d')) {
    return 'structure';
  }
  
  if (queryLower.includes('literature') || queryLower.includes('review') ||
      queryLower.includes('paper') || queryLower.includes('study')) {
    return 'literature';
  }
  
  return 'general';
}
