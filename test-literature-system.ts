// Test script for the enhanced literature validation and quality control system
const { LiteratureValidator } = require('./src/utils/gene-research/literature-validator');

async function runTest() {
  console.log('=== Testing Enhanced Literature Validation System ===');
  
  // Initialize validator
  const validator = new LiteratureValidator();
  
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
      (ref: any) => ref.qualityMetadata.potentialFabrication
    );
    
    if (fabricatedRefs.length > 0) {
      console.log('\n=== Flagged References ===');
      fabricatedRefs.forEach((ref: any) => {
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