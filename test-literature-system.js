// JavaScript test script for the enhanced literature validation system
// This script can be run directly with Node.js without TypeScript compilation

// Create a mock version of the enhanced quality control system
class MockEnhancedQualityControl {
  assessLiteratureQuality(references, statistics) {
    return {
      authenticityIndex: references.length > 0 ? 0.85 : 0,
      diversityIndex: 0.72,
      recencyIndex: 0.65,
      citationPatternAnalysis: {
        hasConsistentCitationPattern: true,
        suspiciousPatternsDetected: references.some(r => r.qualityMetadata?.potentialFabrication),
        patternScore: 0.8
      },
      overallQualityScore: 0.75,
      qualityAssessment: references.some(r => r.qualityMetadata?.potentialFabrication) ? 'Mixed Quality' : 'Good',
      recommendations: [
        'Verify flagged references manually',
        'Consider additional sources for high-risk claims'
      ],
      timestamp: new Date().toISOString()
    };
  }
}

// Create a simplified mock of the LiteratureValidator
class MockLiteratureValidator {
  constructor() {
    this.qualityControl = new MockEnhancedQualityControl();
  }

  async processReferences(references, organism) {
    // Validate and enhance references
    const validatedReferences = references.map(ref => {
      // Determine if potentially fabricated
      const hasSuspiciousJournal = ref.journal && (
        ref.journal.toLowerCase().includes('international journal') ||
        ref.journal.toLowerCase().includes('global journal')
      );
      const hasSuspiciousTitle = ref.title && (
        ref.title.toLowerCase().includes('innovative') &&
        ref.title.toLowerCase().includes('novel')
      );
      const hasMinimalAbstract = !ref.abstract || ref.abstract.length < 10;
      const hasSuspiciousAuthor = ref.authors && ref.authors.length === 1 && ref.authors[0].includes('. ');
      
      const potentialFabrication = hasSuspiciousJournal && (
        hasSuspiciousTitle || hasMinimalAbstract || hasSuspiciousAuthor
      );

      return {
        ...ref,
        qualityMetadata: {
          verified: ref.pmid !== undefined,
          verificationMethod: ref.pmid ? 'pubmed_api' : 'pattern_validation',
          confidenceScore: potentialFabrication ? 0.25 : 0.85,
          warningFlags: potentialFabrication ? ['FLAGGED: Potential fabrication detected'] : [],
          potentialFabrication: potentialFabrication
        }
      };
    });

    // Calculate statistics
    const stats = {
      validated: validatedReferences.filter(r => r.qualityMetadata.verified).length,
      highConfidence: validatedReferences.filter(r => r.qualityMetadata.confidenceScore >= 0.7).length,
      warnings: validatedReferences.filter(r => r.qualityMetadata.warningFlags.length > 0).length,
      potentiallyFabricated: validatedReferences.filter(r => r.qualityMetadata.potentialFabrication).length
    };

    // Generate quality report
    const qualityReport = this.qualityControl.assessLiteratureQuality(
      validatedReferences,
      {
        validatedReferences: stats.validated,
        duplicateReferences: 0,
        highConfidenceReferences: stats.highConfidence,
        warnings: stats.warnings,
        potentiallyFabricated: stats.potentiallyFabricated
      }
    );

    return {
      uniqueReferences: validatedReferences,
      duplicateCount: 0,
      stats: stats,
      qualityReport: qualityReport
    };
  }
}

async function runTest() {
  console.log('=== Testing Enhanced Literature Validation System ===');
  
  // Initialize validator
  const validator = new MockLiteratureValidator();
  
  // Sample references for testing
  const testReferences = [
    {
      pmid: '12345678',
      title: 'Role of TP53 in cancer progression',
      authors: ['Smith A', 'Johnson B', 'Williams C'],
      journal: 'Nature',
      year: 2021,
      abstract: 'This study examines the role of TP53 in various cancer types...',
      relevance: 0.9,
      studyType: 'research_article',
      organism: 'human',
      methodology: ['sequencing', 'expression_analysis']
    },
    {
      pmid: '87654321',
      title: 'Novel innovative cutting-edge advancements in molecular biology',
      authors: ['X. Y. Z'],
      journal: 'International Journal of Advanced Sciences',
      year: 2020,
      abstract: 'Extracted from content analysis...',
      relevance: 0.6,
      studyType: 'review',
      organism: 'human',
      methodology: ['literature_review']
    },
    {
      // This should be flagged as potentially fabricated
      pmid: '11111111',
      title: 'Innovative novel approach to gene therapy',
      authors: ['A. Author'],
      journal: 'Global Journal of Medical Research',
      year: 2019,
      abstract: '',
      relevance: 0.7,
      studyType: 'research_article',
      organism: 'mouse',
      methodology: ['cell_culture']
    }
  ];
  
  console.log(`Processing ${testReferences.length} test references...`);
  
  try {
    // Process references
    const result = await validator.processReferences(
      testReferences.map(ref => ({ ...ref, source: 'test', extractionMethod: 'manual' })),
      'human'
    );
    
    // Log results
    console.log('\n=== Processed Results ===');
    console.log(`Unique references: ${result.uniqueReferences.length}`);
    console.log(`Duplicate count: ${result.duplicateCount}`);
    console.log(`\nStatistics:`);
    console.log(`- Validated references: ${result.stats.validated}`);
    console.log(`- High confidence references: ${result.stats.highConfidence}`);
    console.log(`- References with warnings: ${result.stats.warnings}`);
    console.log(`- Potentially fabricated references: ${result.stats.potentiallyFabricated}`);
    
    console.log('\n=== Quality Report ===');
    console.log(JSON.stringify(result.qualityReport, null, 2));
    
    // Check for fabricated references
    const fabricatedRefs = result.uniqueReferences.filter(
      ref => ref.qualityMetadata.potentialFabrication
    );
    
    if (fabricatedRefs.length > 0) {
      console.log('\n=== Flagged References ===');
      fabricatedRefs.forEach(ref => {
        console.log(`\nTitle: ${ref.title}`);
        console.log(`Journal: ${ref.journal}`);
        console.log(`Warnings: ${ref.qualityMetadata.warningFlags.join(', ')}`);
        console.log(`Confidence Score: ${ref.qualityMetadata.confidenceScore}`);
      });
    }
    
  } catch (error) {
    console.error('Error during testing:', error);
  }
}

// Run the test
runTest().then(() => {
  console.log('\n=== Test completed ===');
});