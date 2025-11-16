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
  },
  {
    name: 'BioCyc',
    category: 'pathway',
    priority: 12,
    url: 'https://biocyc.org/',
    searchEndpoint: 'https://websvc.biocyc.org/',
    apiRequired: false,
    description: 'Collection of pathway/genome databases for multiple organisms (includes MetaCyc, EcoCyc, HumanCyc, etc.)'
  },
  {
    name: 'MetaCyc',
    category: 'pathway',
    priority: 13,
    url: 'https://metacyc.org/',
    searchEndpoint: 'https://websvc.biocyc.org/',
    apiRequired: false,
    description: 'Database of experimentally elucidated metabolic pathways from all domains of life'
  }
];

// 🧪 Protein and Structure Databases
export const PROTEIN_STRUCTURE_DATABASES: BioDatabaseConfig[] = [
  {
    name: 'UniProt',
    category: 'protein',
    priority: 14,
    url: 'https://www.uniprot.org/',
    searchEndpoint: 'https://rest.uniprot.org/',
    apiRequired: false,
    description: 'Universal Protein Resource - comprehensive protein sequence and functional information'
  },
  {
    name: 'PDB (Protein Data Bank)',
    category: 'structure',
    priority: 15,
    url: 'https://www.rcsb.org/',
    searchEndpoint: 'https://data.rcsb.org/',
    apiRequired: false,
    description: 'Repository of 3D structural data of proteins and nucleic acids'
  },
  {
    name: 'AlphaFold DB',
    category: 'structure',
    priority: 16,
    url: 'https://alphafold.ebi.ac.uk/',
    searchEndpoint: 'https://alphafold.ebi.ac.uk/api/',
    apiRequired: false,
    description: 'AI-predicted protein structures from DeepMind/EMBL-EBI'
  },
  {
    name: 'Pfam',
    category: 'protein',
    priority: 17,
    url: 'https://pfam.xfam.org/',
    searchEndpoint: 'https://pfam.xfam.org/search',
    apiRequired: false,
    description: 'Database of protein families and domains'
  },
  {
    name: 'InterPro',
    category: 'protein',
    priority: 18,
    url: 'https://www.ebi.ac.uk/interpro/',
    searchEndpoint: 'https://www.ebi.ac.uk/interpro/api/',
    apiRequired: false,
    description: 'Integrated resource of protein families, domains and functional sites'
  }
];

// 🧬 Gene and Genome Databases
export const GENE_GENOME_DATABASES: BioDatabaseConfig[] = [
  {
    name: 'NCBI Gene',
    category: 'core_literature',
    priority: 19,
    url: 'https://www.ncbi.nlm.nih.gov/gene/',
    searchEndpoint: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
    apiRequired: false,
    description: 'Gene-specific information from NCBI including nomenclature, location, function'
  },
  {
    name: 'Ensembl',
    category: 'core_literature',
    priority: 20,
    url: 'https://www.ensembl.org/',
    searchEndpoint: 'https://rest.ensembl.org/',
    apiRequired: false,
    description: 'Genome browser for vertebrate genomes with extensive annotations'
  },
  {
    name: 'GenBank',
    category: 'core_literature',
    priority: 21,
    url: 'https://www.ncbi.nlm.nih.gov/genbank/',
    searchEndpoint: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
    apiRequired: false,
    description: 'NIH genetic sequence database, comprehensive collection of all publicly available DNA sequences'
  }
];

// 🔬 Expression and Interaction Databases
export const EXPRESSION_INTERACTION_DATABASES: BioDatabaseConfig[] = [
  {
    name: 'GEO (Gene Expression Omnibus)',
    category: 'core_literature',
    priority: 22,
    url: 'https://www.ncbi.nlm.nih.gov/geo/',
    searchEndpoint: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
    apiRequired: false,
    description: 'Repository of gene expression datasets and high-throughput functional genomic data'
  },
  {
    name: 'STRING',
    category: 'protein',
    priority: 23,
    url: 'https://string-db.org/',
    searchEndpoint: 'https://string-db.org/api/',
    apiRequired: false,
    description: 'Protein-protein interaction networks with functional associations'
  },
  {
    name: 'BioGRID',
    category: 'protein',
    priority: 24,
    url: 'https://thebiogrid.org/',
    searchEndpoint: 'https://webservice.thebiogrid.org/',
    apiRequired: false,
    description: 'Database of genetic and protein interactions for all major model organisms'
  },
  {
    name: 'IntAct',
    category: 'protein',
    priority: 25,
    url: 'https://www.ebi.ac.uk/intact/',
    searchEndpoint: 'https://www.ebi.ac.uk/intact/ws/',
    apiRequired: false,
    description: 'Molecular interaction database providing data from literature curation and direct user submissions'
  }
];

// 🧬 Disease and Clinical Databases
export const DISEASE_CLINICAL_DATABASES: BioDatabaseConfig[] = [
  {
    name: 'OMIM',
    category: 'core_literature',
    priority: 26,
    url: 'https://www.omim.org/',
    searchEndpoint: 'https://api.omim.org/',
    apiRequired: true,
    description: 'Online Mendelian Inheritance in Man - comprehensive catalog of human genes and genetic disorders'
  },
  {
    name: 'ClinVar',
    category: 'core_literature',
    priority: 27,
    url: 'https://www.ncbi.nlm.nih.gov/clinvar/',
    searchEndpoint: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
    apiRequired: false,
    description: 'Archive of reports on relationships among human variations and phenotypes with clinical significance'
  },
  {
    name: 'DisGeNET',
    category: 'core_literature',
    priority: 28,
    url: 'https://www.disgenet.org/',
    searchEndpoint: 'https://www.disgenet.org/api/',
    apiRequired: true,
    description: 'Discovery platform for gene-disease associations from multiple sources'
  },
  {
    name: 'PharmGKB',
    category: 'core_literature',
    priority: 29,
    url: 'https://www.pharmgkb.org/',
    searchEndpoint: 'https://api.pharmgkb.org/',
    apiRequired: false,
    description: 'Pharmacogenomics knowledge resource with genetic variations affecting drug response'
  }
];

// 🧬 Ontology and Annotation Databases
export const ONTOLOGY_DATABASES: BioDatabaseConfig[] = [
  {
    name: 'Gene Ontology (GO)',
    category: 'core_literature',
    priority: 30,
    url: 'http://geneontology.org/',
    searchEndpoint: 'http://api.geneontology.org/',
    apiRequired: false,
    description: 'Structured, controlled vocabulary describing gene and gene product attributes'
  },
  {
    name: 'QuickGO',
    category: 'core_literature',
    priority: 31,
    url: 'https://www.ebi.ac.uk/QuickGO/',
    searchEndpoint: 'https://www.ebi.ac.uk/QuickGO/services/',
    apiRequired: false,
    description: 'Fast browsing of Gene Ontology terms and annotations'
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
export function getPrioritizedDatabases(queryType: 'general' | 'pathway' | 'structure' | 'literature' | 'expression' | 'disease'): BioDatabaseConfig[] {
  const allDatabases = [
    ...CORE_LITERATURE_DATABASES,
    ...GENERAL_ACADEMIC_DATABASES,
    ...PREPRINT_DATABASES,
    ...PATHWAY_DATABASES,
    ...PROTEIN_STRUCTURE_DATABASES,
    ...GENE_GENOME_DATABASES,
    ...EXPRESSION_INTERACTION_DATABASES,
    ...DISEASE_CLINICAL_DATABASES,
    ...ONTOLOGY_DATABASES
  ];

  // Filter and sort by priority
  let filteredDatabases = allDatabases;
  
  if (queryType === 'pathway') {
    // For pathway queries, prioritize KEGG, EcoCyc, Reactome, BioCyc, MetaCyc
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
  } else if (queryType === 'structure') {
    // For structure queries, prioritize PDB, AlphaFold, UniProt
    filteredDatabases = [
      ...PROTEIN_STRUCTURE_DATABASES,
      ...CORE_LITERATURE_DATABASES,
      ...PREPRINT_DATABASES
    ];
  } else if (queryType === 'expression') {
    // For expression queries, prioritize GEO, STRING, interaction databases
    filteredDatabases = [
      ...EXPRESSION_INTERACTION_DATABASES,
      ...CORE_LITERATURE_DATABASES,
      ...PREPRINT_DATABASES
    ];
  } else if (queryType === 'disease') {
    // For disease queries, prioritize OMIM, ClinVar, DisGeNET
    filteredDatabases = [
      ...DISEASE_CLINICAL_DATABASES,
      ...CORE_LITERATURE_DATABASES,
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
    'KEGG', 'Reactome', 'EcoCyc', 'UniProt', 'PDB', 'NCBI', 'Ensembl',
    'STRING', 'BioGRID', 'AlphaFold', 'Gene Ontology', 'GO', 'OMIM',
    'disease', 'clinical', 'pharmacogenomics', 'variant'
  ];
  
  const queryLower = query.toLowerCase();
  return bioKeywords.some(keyword => queryLower.includes(keyword.toLowerCase()));
}

// Detect query type for database prioritization
export function detectQueryType(query: string): 'general' | 'pathway' | 'structure' | 'literature' | 'expression' | 'disease' {
  const queryLower = query.toLowerCase();
  
  if (queryLower.includes('pathway') || queryLower.includes('metabol') || 
      queryLower.includes('kegg') || queryLower.includes('reactome') ||
      queryLower.includes('ecocyc') || queryLower.includes('biocyc') ||
      queryLower.includes('metacyc') || queryLower.includes('biosynthesis')) {
    return 'pathway';
  }
  
  if (queryLower.includes('structure') || queryLower.includes('pdb') ||
      queryLower.includes('crystal') || queryLower.includes('3d') ||
      queryLower.includes('alphafold') || queryLower.includes('fold') ||
      queryLower.includes('domain') || queryLower.includes('conformation')) {
    return 'structure';
  }
  
  if (queryLower.includes('expression') || queryLower.includes('rna-seq') ||
      queryLower.includes('geo') || queryLower.includes('microarray') ||
      queryLower.includes('interaction') || queryLower.includes('string') ||
      queryLower.includes('biogrid') || queryLower.includes('network')) {
    return 'expression';
  }
  
  if (queryLower.includes('disease') || queryLower.includes('clinical') ||
      queryLower.includes('omim') || queryLower.includes('clinvar') ||
      queryLower.includes('variant') || queryLower.includes('mutation') ||
      queryLower.includes('pharmacogenomic') || queryLower.includes('drug')) {
    return 'disease';
  }
  
  if (queryLower.includes('literature') || queryLower.includes('review') ||
      queryLower.includes('paper') || queryLower.includes('study')) {
    return 'literature';
  }
  
  return 'general';
}
