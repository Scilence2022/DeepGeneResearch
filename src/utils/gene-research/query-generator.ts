// Gene-specific query generation system
// Intelligent query generation for molecular biology research

import { GeneSearchTask } from '@/types/gene-research';

export interface GeneQueryContext {
  geneSymbol: string;
  organism: string;
  featureType?: string;
  researchFocus?: string[];
  specificAspects?: string[];
  diseaseContext?: string;
  experimentalApproach?: string;
}

export class GeneQueryGenerator {
  private geneSymbol: string;
  private organism: string;
  private featureType: string;
  private researchFocus: string[];
  private specificAspects: string[];
  private diseaseContext?: string;
  private experimentalApproach?: string;

  private isProkaryoticOrganism(): boolean {
    return /(?:Escherichia|Corynebacterium|Bacillus|Pseudomonas|Salmonella|Staphylococcus|Streptococcus|Mycobacterium)/i.test(this.organism);
  }

  private isProteinCodingFeature(): boolean {
    return this.featureType.toUpperCase() === 'CDS';
  }

  constructor(context: GeneQueryContext) {
    this.geneSymbol = context.geneSymbol;
    this.organism = context.organism;
    this.featureType = context.featureType || 'CDS';
    this.researchFocus = (context.researchFocus || ['general']).map(aspect => this.normalizeAspect(aspect));
    this.specificAspects = (context.specificAspects || []).map(aspect => this.normalizeAspect(aspect));
    this.diseaseContext = context.diseaseContext;
    this.experimentalApproach = context.experimentalApproach;
  }

  private normalizeAspect(aspect: string): string {
    const normalized = String(aspect || '').trim().toLowerCase();
    if (/(gene name|nomenclature|alias|synonym|locus)/.test(normalized)) return 'basic_info';
    if (/(structure|domain|motif|fold)/.test(normalized)) return 'structure';
    if (/(function|functional|annotation|catalytic|protein family|enzyme|ec number|go term|product)/.test(normalized)) return 'function';
    if (/(expression|transcript|rna[- ]?seq|localization|cellular component)/.test(normalized)) return 'expression';
    if (/(regulation|regulatory|promoter|operon)/.test(normalized)) return 'regulation';
    if (/(interaction|complex|binding)/.test(normalized)) return 'interactions';
    if (/(pathway|metabolic|biosynth)/.test(normalized)) return 'pathway';
    if (/(evolution|ortholog|homolog|conservation)/.test(normalized)) return 'evolution';
    if (/(disease|phenotype|clinical)/.test(normalized)) return 'disease';
    return normalized || 'general';
  }

  generateComprehensiveQueries(): GeneSearchTask[] {
    const queries: GeneSearchTask[] = [];

    // Always include basic gene information queries
    queries.push(...this.generateBasicInfoQueries());
    
    // Generate queries based on selected research focuses
    if (this.researchFocus.includes('general') || this.researchFocus.includes('function')) {
      queries.push(...this.generateFunctionQueries());
    }
    
    if (this.researchFocus.includes('general') || this.researchFocus.includes('structure')) {
      queries.push(...this.generateStructureQueries());
    }
    
    if (this.researchFocus.includes('general') || this.researchFocus.includes('expression')) {
      queries.push(...this.generateExpressionQueries());
    }
    
    if (this.researchFocus.includes('general') || this.researchFocus.includes('interaction') || this.researchFocus.includes('interactions')) {
      queries.push(...this.generateInteractionQueries());
    }
    
    if (this.researchFocus.includes('general') || this.researchFocus.includes('disease')) {
      queries.push(...this.generateDiseaseQueries());
    }
    
    if (this.researchFocus.includes('general') || this.researchFocus.includes('evolution')) {
      queries.push(...this.generateEvolutionaryQueries());
    }
    
    if (this.researchFocus.includes('general') || this.researchFocus.includes('therapeutic') || this.researchFocus.includes('pathway')) {
      queries.push(...this.generatePathwayQueries());
    }
    
    // Always include regulatory mechanism queries as they're fundamental
    queries.push(...this.generateRegulatoryQueries());

    return queries;
  }

  private generateBasicInfoQueries(): GeneSearchTask[] {
    return [
      {
        query: `${this.geneSymbol} gene basic information ${this.organism}`,
        researchGoal: `Obtain comprehensive basic information about the ${this.geneSymbol} gene in ${this.organism}, including gene structure, genomic location, alternative names, and general description.`,
        database: 'ncbi_gene',
        priority: 'high',
        category: 'basic_info',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} gene nomenclature symbols ${this.organism}`,
        researchGoal: `Identify all alternative names, symbols, and aliases for the ${this.geneSymbol} gene to ensure comprehensive literature coverage.`,
        database: 'pubmed',
        priority: 'high',
        category: 'basic_info',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} genomic coordinates chromosome location ${this.organism}`,
        researchGoal: `Determine the precise genomic location, chromosomal coordinates, and genomic context of the ${this.geneSymbol} gene.`,
        database: 'ncbi_gene',
        priority: 'medium',
        category: 'basic_info',
        status: 'pending'
      }
    ];
  }

  private generateFunctionQueries(): GeneSearchTask[] {
    if (!this.isProteinCodingFeature()) {
      return [
        {
          query: `${this.geneSymbol} ${this.featureType} molecular biological function ${this.organism}`,
          researchGoal: `Determine the molecular and biological function of the ${this.geneSymbol} ${this.featureType} feature in ${this.organism}.`,
          database: 'pubmed',
          priority: 'high',
          category: 'function',
          status: 'pending'
        },
        {
          query: `${this.geneSymbol} RNA processing maturation modification ${this.organism}`,
          researchGoal: `Identify processing, maturation, modification, and stability mechanisms relevant to ${this.geneSymbol}.`,
          database: 'pubmed',
          priority: 'high',
          category: 'function',
          status: 'pending'
        },
        {
          query: `${this.geneSymbol} phenotype deletion mutation ${this.organism}`,
          researchGoal: `Find direct phenotype evidence that establishes the physiological role of ${this.geneSymbol}.`,
          database: 'pubmed',
          priority: 'high',
          category: 'function',
          status: 'pending'
        }
      ];
    }
    return [
      {
        query: `${this.geneSymbol} molecular function catalytic activity ${this.organism}`,
        researchGoal: `Investigate the molecular function and catalytic activity of the ${this.geneSymbol} gene product, including enzyme classification and substrate specificity.`,
        database: 'uniprot',
        priority: 'high',
        category: 'function',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} protein domains functional motifs ${this.organism}`,
        researchGoal: `Identify and analyze protein domains, functional motifs, and structural elements that contribute to the function of ${this.geneSymbol}.`,
        database: 'uniprot',
        priority: 'high',
        category: 'function',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} biological process cellular function ${this.organism}`,
        researchGoal: `Understand the biological processes and cellular functions in which ${this.geneSymbol} participates, including pathway involvement and cellular roles.`,
        database: 'pubmed',
        priority: 'high',
        category: 'function',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} substrate binding specificity ${this.organism}`,
        researchGoal: `Analyze substrate binding specificity, affinity constants, and molecular interactions of the ${this.geneSymbol} gene product.`,
        database: 'pubmed',
        priority: 'medium',
        category: 'function',
        status: 'pending'
      }
    ];
  }

  private generateStructureQueries(): GeneSearchTask[] {
    if (!this.isProteinCodingFeature()) {
      return [
        {
          query: `${this.geneSymbol} RNA secondary structure functional elements ${this.organism}`,
          researchGoal: `Determine experimentally supported RNA structure and functional elements for ${this.geneSymbol}.`,
          database: 'pubmed',
          priority: 'medium',
          category: 'structure',
          status: 'pending'
        },
        {
          query: `${this.geneSymbol} RNA binding partners ribonucleoprotein ${this.organism}`,
          researchGoal: `Identify RNA, DNA, and protein partners required for ${this.geneSymbol} function.`,
          database: 'pubmed',
          priority: 'medium',
          category: 'structure',
          status: 'pending'
        }
      ];
    }
    return [
      {
        query: `${this.geneSymbol} protein structure 3D crystal ${this.organism}`,
        researchGoal: `Obtain 3D protein structure information for ${this.geneSymbol}, including crystal structures, NMR structures, and homology models.`,
        database: 'pdb',
        priority: 'high',
        category: 'structure',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} active site binding pocket structure ${this.organism}`,
        researchGoal: `Analyze the active site, binding pockets, and critical structural elements of the ${this.geneSymbol} protein.`,
        database: 'pdb',
        priority: 'high',
        category: 'structure',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} protein folding stability domains ${this.organism}`,
        researchGoal: `Investigate protein folding, stability, and domain organization of the ${this.geneSymbol} gene product.`,
        database: 'pubmed',
        priority: 'medium',
        category: 'structure',
        status: 'pending'
      }
    ];
  }

  private generateExpressionQueries(): GeneSearchTask[] {
    if (this.isProkaryoticOrganism()) {
      return [
        {
          query: `${this.geneSymbol} expression growth condition stress response ${this.organism}`,
          researchGoal: `Determine condition-dependent expression and stress responses of ${this.geneSymbol} in ${this.organism}.`,
          database: 'pubmed', priority: 'medium', category: 'expression', status: 'pending'
        },
        {
          query: `${this.geneSymbol} transcriptomics RNA-seq ${this.organism}`,
          researchGoal: `Find transcriptomic evidence for ${this.geneSymbol} expression in ${this.organism}.`,
          database: 'geo', priority: 'medium', category: 'expression', status: 'pending'
        },
        this.isProteinCodingFeature()
          ? {
              query: `${this.geneSymbol} subcellular localization ${this.organism}`,
              researchGoal: `Determine the experimentally supported cellular localization of the ${this.geneSymbol} product.`,
              database: 'uniprot', priority: 'high', category: 'expression', status: 'pending'
            }
          : {
              query: `${this.geneSymbol} RNA abundance localization half-life ${this.organism}`,
              researchGoal: `Determine the abundance, localization, stability, and condition dependence of ${this.geneSymbol}.`,
              database: 'pubmed', priority: 'high', category: 'expression', status: 'pending'
            }
      ];
    }
    return [
      {
        query: `${this.geneSymbol} expression pattern tissue specific ${this.organism}`,
        researchGoal: `Analyze tissue-specific expression patterns of ${this.geneSymbol} across different organs and cell types.`,
        database: 'geo',
        priority: 'high',
        category: 'expression',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} developmental expression stage specific ${this.organism}`,
        researchGoal: `Investigate developmental stage-specific expression of ${this.geneSymbol} during embryogenesis and postnatal development.`,
        database: 'geo',
        priority: 'high',
        category: 'expression',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} expression regulation environmental response ${this.organism}`,
        researchGoal: `Study how ${this.geneSymbol} expression responds to environmental stimuli, stress conditions, and physiological changes.`,
        database: 'pubmed',
        priority: 'medium',
        category: 'expression',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} subcellular localization expression ${this.organism}`,
        researchGoal: `Determine the subcellular localization and compartmentalization of the ${this.geneSymbol} gene product.`,
        database: 'uniprot',
        priority: 'medium',
        category: 'expression',
        status: 'pending'
      }
    ];
  }

  private generateRegulatoryQueries(): GeneSearchTask[] {
    if (this.isProkaryoticOrganism()) {
      return [
        {
          query: `${this.geneSymbol} operon promoter transcription regulation ${this.organism}`,
          researchGoal: `Identify operon context, promoter control, and transcriptional regulators of ${this.geneSymbol}.`,
          database: 'pubmed', priority: 'high', category: 'interactions', status: 'pending'
        },
        {
          query: `${this.geneSymbol} attenuation feedback regulation ${this.organism}`,
          researchGoal: `Investigate attenuation, feedback, and metabolic regulation affecting ${this.geneSymbol}.`,
          database: 'pubmed', priority: 'medium', category: 'interactions', status: 'pending'
        }
      ];
    }
    return [
      {
        query: `${this.geneSymbol} transcription regulation promoter enhancer ${this.organism}`,
        researchGoal: `Investigate transcriptional regulation of ${this.geneSymbol}, including promoter elements, enhancers, and transcription factors.`,
        database: 'pubmed',
        priority: 'high',
        category: 'interactions',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} post-transcriptional regulation miRNA ${this.organism}`,
        researchGoal: `Analyze post-transcriptional regulation of ${this.geneSymbol}, including miRNA targeting, RNA stability, and processing.`,
        database: 'pubmed',
        priority: 'medium',
        category: 'interactions',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} post-translational modification phosphorylation ${this.organism}`,
        researchGoal: `Study post-translational modifications of the ${this.geneSymbol} protein, including phosphorylation, acetylation, and ubiquitination.`,
        database: 'uniprot',
        priority: 'medium',
        category: 'interactions',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} epigenetic regulation methylation ${this.organism}`,
        researchGoal: `Investigate epigenetic regulation of ${this.geneSymbol}, including DNA methylation, histone modifications, and chromatin structure.`,
        database: 'pubmed',
        priority: 'medium',
        category: 'interactions',
        status: 'pending'
      }
    ];
  }

  private generateInteractionQueries(): GeneSearchTask[] {
    if (!this.isProteinCodingFeature()) {
      return [
        {
          query: `${this.geneSymbol} RNA interaction targets binding partners ${this.organism}`,
          researchGoal: `Identify experimentally supported targets and binding partners of ${this.geneSymbol}.`,
          database: 'pubmed',
          priority: 'high',
          category: 'interactions',
          status: 'pending'
        },
        {
          query: `${this.geneSymbol} ribonucleoprotein complex regulation ${this.organism}`,
          researchGoal: `Determine whether ${this.geneSymbol} functions in a ribonucleoprotein complex or regulatory RNA network.`,
          database: 'pubmed',
          priority: 'medium',
          category: 'interactions',
          status: 'pending'
        }
      ];
    }
    return [
      {
        query: `${this.geneSymbol} protein-protein interactions network ${this.organism}`,
        researchGoal: `Identify protein-protein interactions involving ${this.geneSymbol} and analyze its role in protein interaction networks.`,
        database: 'pubmed',
        priority: 'high',
        category: 'interactions',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} protein complex subunit ${this.organism}`,
        researchGoal: `Investigate protein complexes containing ${this.geneSymbol} and determine its role as a complex subunit.`,
        database: 'pubmed',
        priority: 'high',
        category: 'interactions',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} DNA binding transcription factor ${this.organism}`,
        researchGoal: `Analyze DNA binding activity of ${this.geneSymbol} and its role as a transcription factor or DNA-binding protein.`,
        database: 'pubmed',
        priority: 'medium',
        category: 'interactions',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} small molecule binding ligand ${this.organism}`,
        researchGoal: `Investigate small molecule binding by ${this.geneSymbol}, including substrates, cofactors, and regulatory ligands.`,
        database: 'pubmed',
        priority: 'medium',
        category: 'interactions',
        status: 'pending'
      }
    ];
  }

  private generateDiseaseQueries(): GeneSearchTask[] {
    if (this.isProkaryoticOrganism() && !this.diseaseContext) {
      return [
        {
          query: `${this.geneSymbol} mutant knockout phenotype fitness ${this.organism}`,
          researchGoal: `Find experimentally measured growth, fitness, and metabolic phenotypes caused by perturbing ${this.geneSymbol} in ${this.organism}.`,
          database: 'pubmed',
          priority: 'high',
          category: 'disease',
          status: 'pending'
        },
        {
          query: `${this.geneSymbol} allele complementation biochemical phenotype ${this.organism}`,
          researchGoal: `Find allele, complementation, and biochemical phenotype evidence that links ${this.geneSymbol} to its annotated function.`,
          database: 'pubmed',
          priority: 'high',
          category: 'disease',
          status: 'pending'
        }
      ];
    }
    if (!this.diseaseContext) {
      return [
        {
          query: `${this.geneSymbol} disease association mutation ${this.organism}`,
          researchGoal: `Investigate disease associations of ${this.geneSymbol}, including mutations, polymorphisms, and clinical phenotypes.`,
          database: 'pubmed',
          priority: 'high',
          category: 'disease',
          status: 'pending'
        },
        {
          query: `${this.geneSymbol} genetic disorder syndrome ${this.organism}`,
          researchGoal: `Analyze genetic disorders and syndromes associated with ${this.geneSymbol} mutations or dysregulation.`,
          database: 'pubmed',
          priority: 'high',
          category: 'disease',
          status: 'pending'
        }
      ];
    }

    return [
      {
        query: `${this.geneSymbol} ${this.diseaseContext} disease mechanism ${this.organism}`,
        researchGoal: `Investigate the role of ${this.geneSymbol} in ${this.diseaseContext} pathogenesis and disease mechanisms.`,
        database: 'pubmed',
        priority: 'high',
        category: 'disease',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} ${this.diseaseContext} therapeutic target ${this.organism}`,
        researchGoal: `Evaluate ${this.geneSymbol} as a therapeutic target for ${this.diseaseContext} treatment and drug development.`,
        database: 'pubmed',
        priority: 'high',
        category: 'disease',
        status: 'pending'
      }
    ];
  }

  private generateEvolutionaryQueries(): GeneSearchTask[] {
    return [
      {
        query: `${this.geneSymbol} orthologs paralogs evolution ${this.organism}`,
        researchGoal: `Analyze evolutionary relationships of ${this.geneSymbol}, including orthologs, paralogs, and gene family evolution.`,
        database: 'pubmed',
        priority: 'medium',
        category: 'evolution',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} gene duplication conservation ${this.organism}`,
        researchGoal: `Investigate gene duplication events and evolutionary conservation of ${this.geneSymbol} across species.`,
        database: 'pubmed',
        priority: 'medium',
        category: 'evolution',
        status: 'pending'
      },
      {
        query: `${this.geneSymbol} functional conservation divergence ${this.organism}`,
        researchGoal: `Study functional conservation and divergence of ${this.geneSymbol} across different organisms and evolutionary time.`,
        database: 'pubmed',
        priority: 'low',
        category: 'evolution',
        status: 'pending'
      }
    ];
  }

  private generatePathwayQueries(): GeneSearchTask[] {
    const queries: GeneSearchTask[] = [
      {
        query: `${this.geneSymbol} metabolic pathway KEGG ${this.organism}`,
        researchGoal: `Identify metabolic pathways involving ${this.geneSymbol} and analyze its role in cellular metabolism.`,
        database: 'kegg',
        priority: 'high',
        category: 'pathway',
        status: 'pending'
      },
      this.isProkaryoticOrganism()
        ? {
            query: `${this.geneSymbol} biosynthetic pathway metabolic regulation ${this.organism}`,
            researchGoal: `Investigate biosynthetic pathways and metabolic regulatory networks involving ${this.geneSymbol}.`,
            database: 'pubmed',
            priority: 'high',
            category: 'pathway',
            status: 'pending'
          }
        : {
            query: `${this.geneSymbol} signaling pathway network ${this.organism}`,
            researchGoal: `Investigate signaling pathways and regulatory networks involving ${this.geneSymbol}.`,
            database: 'pubmed',
            priority: 'high',
            category: 'pathway',
            status: 'pending'
          },
    ];
    queries.push(this.isProkaryoticOrganism() ? {
      query: `${this.geneSymbol} knockout phenotype metabolic flux ${this.organism}`,
      researchGoal: `Determine pathway consequences and metabolic phenotypes caused by perturbing ${this.geneSymbol}.`,
      database: 'pubmed', priority: 'medium', category: 'pathway', status: 'pending'
    } : {
      query: `${this.geneSymbol} disease pathway mechanism ${this.organism}`,
      researchGoal: `Analyze disease-related pathways and mechanisms involving ${this.geneSymbol} dysfunction.`,
      database: 'pubmed', priority: 'medium', category: 'pathway', status: 'pending'
    });
    return queries;
  }

  // Generate focused queries based on specific research aspects
  generateFocusedQueries(aspects: string[]): GeneSearchTask[] {
    // Focused research still needs an identity baseline. Otherwise requests
    // such as "refine product and EC number" skip NCBI Gene entirely and may
    // never establish which record the functional evidence belongs to.
    const queries: GeneSearchTask[] = [...this.generateBasicInfoQueries()];
    
    aspects.map(aspect => this.normalizeAspect(aspect)).forEach(aspect => {
      switch (aspect.toLowerCase()) {
        case 'basic_info':
          queries.push(...this.generateBasicInfoQueries());
          break;
        case 'structure':
          queries.push(...this.generateStructureQueries());
          break;
        case 'function':
          queries.push(...this.generateFunctionQueries());
          break;
        case 'expression':
          queries.push(...this.generateExpressionQueries());
          break;
        case 'regulation':
          queries.push(...this.generateRegulatoryQueries());
          break;
        case 'interactions':
          queries.push(...this.generateInteractionQueries());
          break;
        case 'disease':
          queries.push(...this.generateDiseaseQueries());
          break;
        case 'evolution':
          queries.push(...this.generateEvolutionaryQueries());
          break;
        case 'pathway':
          queries.push(...this.generatePathwayQueries());
          break;
      }
    });

    const seen = new Set<string>();
    return queries.filter(query => {
      const key = `${query.database}:${query.query}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Generate follow-up queries based on initial findings
  generateFollowUpQueries(initialFindings: string[]): GeneSearchTask[] {
    const queries: GeneSearchTask[] = [];
    
    // Analyze initial findings to generate targeted follow-up queries
    initialFindings.forEach(finding => {
      if (/function|catalytic activity|enzyme|protein:/i.test(finding)) {
        queries.push({
          query: `${this.geneSymbol} biochemical characterization catalytic mechanism ${this.organism}`,
          researchGoal: `Find experimental biochemical evidence for the molecular function and catalytic mechanism of ${this.geneSymbol}.`,
          database: 'pubmed',
          priority: 'high',
          category: 'function',
          status: 'pending'
        });
      }

      if (finding.toLowerCase().includes('mutation')) {
        queries.push({
          query: `${this.geneSymbol} mutation functional effect mechanism ${this.organism}`,
          researchGoal: `Investigate the functional effects and molecular mechanisms of mutations in ${this.geneSymbol}.`,
          database: 'pubmed',
          priority: 'high',
          category: 'disease',
          status: 'pending'
        });
      }
      
      if (finding.toLowerCase().includes('interaction')) {
        queries.push({
          query: `${this.geneSymbol} interaction partner functional significance ${this.organism}`,
          researchGoal: `Analyze the functional significance of protein interactions involving ${this.geneSymbol}.`,
          database: 'pubmed',
          priority: 'high',
          category: 'interactions',
          status: 'pending'
        });
      }
      
      if (finding.toLowerCase().includes('pathway')) {
        queries.push({
          query: `${this.geneSymbol} pathway regulation control mechanism ${this.organism}`,
          researchGoal: `Investigate how ${this.geneSymbol} regulates and controls pathway activity.`,
          database: 'pubmed',
          priority: 'medium',
          category: 'pathway',
          status: 'pending'
        });
      }
    });

    const seen = new Set<string>();
    return queries.filter(query => {
      const key = `${query.database}:${query.query}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Generate comparative analysis queries
  generateComparativeQueries(otherGenes: string[]): GeneSearchTask[] {
    const queries: GeneSearchTask[] = [];
    
    otherGenes.forEach(gene => {
      queries.push({
        query: `${this.geneSymbol} ${gene} comparative analysis function ${this.organism}`,
        researchGoal: `Compare the function and properties of ${this.geneSymbol} with ${gene} to identify similarities and differences.`,
        database: 'pubmed',
        priority: 'medium',
        category: 'function',
        status: 'pending'
      });
    });

    return queries;
  }
}

// Utility function to create gene query generator
export function createGeneQueryGenerator(context: GeneQueryContext): GeneQueryGenerator {
  return new GeneQueryGenerator(context);
}

// Predefined query templates for common gene research scenarios
export const GENE_QUERY_TEMPLATES = {
  FUNCTIONAL_ANALYSIS: [
    'molecular function',
    'catalytic activity',
    'protein domains',
    'substrate specificity'
  ],
  
  EXPRESSION_ANALYSIS: [
    'tissue expression',
    'developmental expression',
    'environmental response',
    'subcellular localization'
  ],
  
  DISEASE_RESEARCH: [
    'disease association',
    'mutation effects',
    'therapeutic target',
    'clinical relevance'
  ],
  
  STRUCTURAL_ANALYSIS: [
    'protein structure',
    'active site',
    'binding sites',
    'protein folding'
  ],
  
  REGULATORY_ANALYSIS: [
    'transcription regulation',
    'post-translational modification',
    'epigenetic regulation',
    'signaling pathways'
  ]
};
