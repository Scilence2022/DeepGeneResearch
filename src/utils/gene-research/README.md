# Literature Validation and Deduplication System

## Overview

This module provides an advanced literature reference validation and deduplication system for gene research data. It ensures the authenticity of scientific citations, prevents duplicate references, and maintains high quality in research outputs.

## Key Components

### 1. Literature Validator

The `LiteratureValidator` class (<mcfile name="literature-validator.ts" path="./literature-validator.ts"></mcfile>) is the core component that handles reference validation and deduplication:

- **PubMed API Integration**: Validates references by querying the PubMed API using PMIDs
- **Pattern-Based Validation**: Falls back to pattern matching for references without PMIDs
- **Multi-Key Deduplication**: Uses PMID, DOI, and content hashing to detect duplicates
- **Quality Scoring**: Assigns confidence scores to validated references
- **Source Tracking**: Maintains extraction provenance for each reference

### 2. Enhanced Reference Structure

```typescript
interface EnhancedLiteratureReference extends LiteratureReference {
  qualityMetadata: {
    verified: boolean;
    verificationMethod: 'pubmed_api' | 'pattern_validation' | 'manual_review' | 'unknown';
    confidenceScore: number; // Normalized 0-1 scale
    warningFlags: string[];
    isDuplicate?: boolean;
    duplicateOf?: string;
  };
  sourceTracking: {
    extractedFrom: string;
    extractionMethod: string;
    extractionConfidence: number; // Normalized 0-1 scale
    processingTimestamp: number;
  };
}
```

### 3. Improved Reference Extraction

The `GeneDataExtractor` class has been enhanced to:

- Extract references using multiple patterns (PMIDs, DOIs, reference sections)
- Track extraction methods and confidence
- Apply validation and deduplication during content processing
- Filter out low-confidence references
- Include quality statistics in extraction metadata

## Validation Flow

1. **Extraction**: References are extracted from content using multiple patterns
2. **Enrichment**: Extraction method and source information is added
3. **Validation**: References are validated via PubMed API or pattern matching
4. **Deduplication**: Duplicates are detected and marked
5. **Filtering**: Low-confidence references are filtered out
6. **Reporting**: Quality statistics are generated and stored

## Anti-Fabrication Measures

- Strict prompt engineering to prevent AI from inventing references
- Multiple validation methods to verify reference authenticity
- Confidence scoring to identify potentially fabricated references
- Deduplication to prevent reference multiplication
- Source tracking for provenance verification

## Quality Metrics

Each extraction includes comprehensive quality statistics:

- `validatedReferences`: Number of successfully validated references
- `duplicateReferences`: Number of duplicate references removed
- `highConfidenceReferences`: Number of references with confidence score ≥ 0.8
- `warnings`: Number of validation warnings generated

## Implementation Details

### Data Flow

1. Content is processed by `GeneDataExtractor.extractFromContent()`
2. Raw references are extracted and enhanced with source information
3. `LiteratureValidator.processReferences()` validates and deduplicates references
4. Validated references are filtered and mapped to standard format
5. Quality statistics are added to extraction metadata

### Error Handling

The system is designed with robust error handling to:

- Gracefully handle API failures
- Provide fallback validation methods
- Log detailed errors for debugging
- Maintain data integrity even when validation fails

## Usage Example

```typescript
// Initialize the extractor with gene symbol and organism
const extractor = new GeneDataExtractor('BRCA1', 'Homo sapiens');

// Extract and validate data from content
const results = await extractor.extractFromContent(researchContent, 'scientific_paper.pdf');

// Access validated references and quality metrics
console.log(`Extracted ${results.literatureReferences.length} unique references`);
console.log('Reference quality:', results.extractionMetadata?.referenceQuality);
```

## Future Enhancements

- Integration with additional reference databases (Scopus, Web of Science)
- Machine learning models for improved reference quality assessment
- User interface for manual reference review
- Automated correction of common reference formatting issues

## Requirements

- Access to PubMed API (requires internet connection)
- Node.js with TypeScript support
- Dependencies as specified in package.json

## CodeXomics Annotation Proposal Contract

Queued `deep-gene-research` tasks include `annotationProposal` by default. The proposal uses the `codexomics.annotation-change-set.v2` wire contract and is a research artifact, not a mutation command.

- Pass the exact object returned by CodeXomics `resolve_annotation_target` as the DGR `target`. Without it, the proposal is `draft_requires_target`.
- Autonomous annotation refinement supports gene-associated CDS, gene, transcript, coding-RNA, non-coding-RNA, and pseudogene features. A resolved target must include a stable `locusTag`, `proteinId`, or `geneSymbol`; CodeXomics prefers CDS when co-located gene and CDS records share an identifier.
- Pass the bounded `currentAnnotation` snapshot derived from that same target revision: optional `product` plus `note`, `EC_number`, `go_terms`, `ko`, `pathway`, and `db_xref` arrays. Existing normalized values are omitted from claims and operations. A product is replaced only when exact authoritative evidence makes a supplied placeholder or generic product more specific; missing and already-specific products are preserved.
- Only database identifiers and qualifier values found in a supporting retrieved source become claims and operations. If no safe evidence-backed operations remain, the proposal is `draft_requires_evidence`.
- Free-form report prose remains report metadata and never authorizes a mutation. When exact citation-bound PubMed findings are available, DGR additionally emits `curationNote` and a CDS `note` operation. Its compact segments are deterministically derived from exact-target `researchSummary.facts`; every literature segment reproduces an authenticated abstract span and carries its PMID. CodeXomics verifies the segment, fact, evidence, hash, citation, and archived report bindings before previewing the operation.
- Every operation is bound to one or more claims, and every claim is bound to evidence records marked `supporting: true` with source-content hashes.
- Direct PubMed abstract findings appear in `researchSummary.facts` as `target_literature`. Each uses exactly one PubMed evidence record and includes the exact abstract span, UTF-16 offsets, canonical abstract/span SHA-256 hashes, and PMID/DOI. The evidence record has a `dgr.evidence-source-binding.v1` selector and relative JSON pointer so an archived full task can verify the span against `sources`. It is marked supporting only when an authenticated segment is included in `curationNote`; context-only GeneID links remain bibliography, not facts.
- The full report separates direct target literature from exact NCBI Gene-linked context. The proposal keeps a concise literature view while its evidence manifest retains up to 100 source citations for audit.
- `ready_for_validation` means CodeXomics can validate and preview the proposal. It does not mean approved or committed. CodeXomics remains the sole commit authority and requires curator review.

For a bounded agent response, call DGR `get-task-status` with `resultMode: "annotation"`; use `full` when the complete report and workflow are needed.
