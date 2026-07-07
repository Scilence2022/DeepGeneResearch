type SourceLike = string | Record<string, any>;

export interface CodeXomicsEvidenceDetail {
  type: 'pmid' | 'doi' | 'url' | 'citation' | 'source';
  label: string;
  id?: string;
  url?: string;
  title?: string;
  database?: string;
}

export interface CodeXomicsAnnotationProposal {
  schema: 'codexomics.gene_annotation_merge.v1';
  target: {
    geneSymbol: string;
    organism: string;
  };
  summary: string;
  confidence: number | null;
  evidence: string[];
  evidenceDetails: CodeXomicsEvidenceDetail[];
  sources: string[];
  updates: Record<string, string | string[]>;
  ecNumbers: string[];
  goTerms: string[];
  koTerms: string[];
  pathwayTerms: string[];
  dbXrefs: string[];
  reportUrl?: string;
  detailsUrl?: string;
  generatedAt: string;
  mergeHints: {
    conservative: true;
    overwriteProduct: false;
    preserveExistingProduct: true;
  };
}

interface BuildProposalInput {
  geneSymbol: string;
  organism: string;
  finalReport?: string;
  sources?: SourceLike[];
  confidence?: number | null;
  reportUrl?: string;
  detailsUrl?: string;
}

function dedupe(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const clean = String(value || '')
      .trim()
      .replace(/[),.;\]]+$/, '');

    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(clean);
  }

  return result;
}

function stripMarkdown(text: string): string {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, maxLength: number): string {
  const clean = stripMarkdown(text);
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3).trim()}...` : clean;
}

function extractSummary(reportText: string): string {
  const text = String(reportText || '');
  const sectionMatch = text.match(
    /(?:key research findings|main findings|functional summary|function(?:al)? annotation|research overview|summary)[\s\S]{0,2500}/i
  );
  const sourceText = sectionMatch ? sectionMatch[0] : text;
  const paragraphs = sourceText
    .split(/\n{2,}/)
    .map((part) => stripMarkdown(part))
    .filter((part) => part && !/^references?$/i.test(part) && part.length > 40);

  return truncate(paragraphs[0] || sourceText, 900);
}

function sourceToText(source: SourceLike): string {
  if (!source) return '';
  if (typeof source === 'string') return source;

  return [
    source.title,
    source.content,
    source.abstract,
    source.summary,
    source.formattedCitation,
    source.url,
    source.database,
    Array.isArray(source.evidence) ? source.evidence.join(' ') : source.evidence,
  ]
    .filter(Boolean)
    .join(' ');
}

function addEvidenceDetail(details: CodeXomicsEvidenceDetail[], detail: CodeXomicsEvidenceDetail) {
  if (!detail.label) return;
  const exists = details.some((item) => item.label.toLowerCase() === detail.label.toLowerCase());
  if (!exists) details.push(detail);
}

function extractEvidenceFromText(text: string): CodeXomicsEvidenceDetail[] {
  const details: CodeXomicsEvidenceDetail[] = [];
  const sourceText = String(text || '');

  for (const match of sourceText.matchAll(/\bPMID[:\s]*(\d{6,10})\b/gi)) {
    addEvidenceDetail(details, {
      type: 'pmid',
      id: match[1],
      label: `PMID:${match[1]}`,
      url: `https://pubmed.ncbi.nlm.nih.gov/${match[1]}/`,
    });
  }

  for (const match of sourceText.matchAll(/\b(?:DOI[:\s]*)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/gi)) {
    const doi = match[1].replace(/[),.;\]]+$/, '');
    addEvidenceDetail(details, {
      type: 'doi',
      id: doi,
      label: `DOI:${doi}`,
      url: `https://doi.org/${doi}`,
    });
  }

  for (const match of sourceText.matchAll(/https?:\/\/[^\s<>)\]]+/gi)) {
    const url = match[0].replace(/[),.;\]]+$/, '');
    addEvidenceDetail(details, {
      type: 'url',
      label: url,
      url,
    });
  }

  return details;
}

function extractEvidenceFromSources(sources: SourceLike[]): CodeXomicsEvidenceDetail[] {
  const details: CodeXomicsEvidenceDetail[] = [];

  for (const source of sources || []) {
    const text = sourceToText(source);
    for (const detail of extractEvidenceFromText(text)) {
      addEvidenceDetail(details, detail);
    }

    if (!source || typeof source === 'string') {
      if (source && details.length === 0) {
        addEvidenceDetail(details, {
          type: 'source',
          label: truncate(source, 220),
        });
      }
      continue;
    }

    if (source.pmid) {
      const pmid = String(source.pmid);
      addEvidenceDetail(details, {
        type: 'pmid',
        id: pmid,
        label: `PMID:${pmid}`,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        title: source.title,
        database: source.database,
      });
    }

    if (source.doi) {
      const doi = String(source.doi).replace(/[),.;\]]+$/, '');
      addEvidenceDetail(details, {
        type: 'doi',
        id: doi,
        label: `DOI:${doi}`,
        url: `https://doi.org/${doi}`,
        title: source.title,
        database: source.database,
      });
    }

    if (source.url) {
      const label = source.title ? `${source.title} - ${source.url}` : String(source.url);
      addEvidenceDetail(details, {
        type: 'url',
        label,
        url: source.url,
        title: source.title,
        database: source.database,
      });
    } else if (source.formattedCitation || source.title) {
      addEvidenceDetail(details, {
        type: 'citation',
        label: truncate(source.formattedCitation || source.title, 260),
        title: source.title,
        database: source.database,
      });
    }
  }

  return details.slice(0, 30);
}

function extractAnnotationTerms(reportText: string, sources: SourceLike[]) {
  const text = [reportText, ...sources.map(sourceToText)].join('\n');

  return {
    ecNumbers: dedupe(
      Array.from(text.matchAll(/\bEC(?:\s+number)?[:\s]*(\d{1,2}\.\d{1,3}\.\d{1,3}\.(?:\d{1,3}|-))\b/gi)).map(
        (match) => match[1]
      )
    ),
    goTerms: dedupe(Array.from(text.matchAll(/\bGO:\d{7}\b/gi)).map((match) => match[0].toUpperCase())),
    koTerms: dedupe(Array.from(text.matchAll(/\bK\d{5}\b/g)).map((match) => match[0])),
    pathwayTerms: dedupe(
      Array.from(text.matchAll(/\b(?:KEGG|Reactome|MetaCyc|BioCyc)[:\s]+([A-Za-z0-9_.:-]+)\b/gi)).map(
        (match) => match[0]
      )
    ),
  };
}

export function buildCodeXomicsAnnotationProposal(input: BuildProposalInput): CodeXomicsAnnotationProposal {
  const finalReport = input.finalReport || '';
  const sources = input.sources || [];
  const summary = extractSummary(finalReport);
  const evidenceDetails = extractEvidenceFromSources(sources);
  for (const detail of extractEvidenceFromText(finalReport)) {
    addEvidenceDetail(evidenceDetails, detail);
  }

  const evidence = dedupe(evidenceDetails.map((detail) => detail.label)).slice(0, 30);
  const terms = extractAnnotationTerms(finalReport, sources);
  const dbXrefs = dedupe(evidence.filter((item) => /^(PMID|DOI):/i.test(item)));
  const updates: Record<string, string | string[]> = {};

  if (summary) {
    updates.function_research_summary = summary;
    updates.note = `Deep Gene Research summary: ${summary}`;
  }
  if (terms.ecNumbers.length > 0) updates.EC_number = terms.ecNumbers;
  if (terms.goTerms.length > 0) updates.go_terms = terms.goTerms;
  if (terms.koTerms.length > 0) updates.ko = terms.koTerms;
  if (terms.pathwayTerms.length > 0) updates.pathway = terms.pathwayTerms;
  if (dbXrefs.length > 0) updates.db_xref = dbXrefs;
  if (evidence.length > 0) updates.codexomics_research_evidence = evidence;

  return {
    schema: 'codexomics.gene_annotation_merge.v1',
    target: {
      geneSymbol: input.geneSymbol,
      organism: input.organism,
    },
    summary,
    confidence: input.confidence ?? null,
    evidence,
    evidenceDetails,
    sources: evidence,
    updates,
    ecNumbers: terms.ecNumbers,
    goTerms: terms.goTerms,
    koTerms: terms.koTerms,
    pathwayTerms: terms.pathwayTerms,
    dbXrefs,
    reportUrl: input.reportUrl,
    detailsUrl: input.detailsUrl,
    generatedAt: new Date().toISOString(),
    mergeHints: {
      conservative: true,
      overwriteProduct: false,
      preserveExistingProduct: true,
    },
  };
}
