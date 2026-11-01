# Curation identity and qualifier semantics

Literature retrieval and citation-span authentication answer different questions.
A matching citation hash proves which passage was copied; it does not establish
the biological subject or the validity of a qualifier update.

## Target identity

Gene symbols use canonical case or an initial capital for protein notation.
Stable locus tags and protein accessions use exact case. Thus `nudE` cannot
match `nude`, and `b4308` cannot match the compound code `B4308`. Duplicate
aliases cannot silently reintroduce case-insensitive canonical matching.
Abstract and full-text sentence selection share the same identity policy.

A stable token in prose requires organism support or an exact NCBI Gene–PubMed
link. A conflicting title is not promoted to direct evidence solely because
an expression host, a locus-like string or a Gene–PubMed link is present.
Gene-linked contextual records remain distinct from direct sources.

Literature facts use `directness: source_target_match`; this records heuristic
source matching rather than independent confirmation of an exact biological
claim. Exact-target authoritative database facts retain `exact_target`.
Source matching is not a substitute for organism-, strain- and claim-level
curator assessment, and the title collision rules are not exhaustive.

CodeXomics clients must accept `source_target_match` for authenticated literature
facts before this DGR change is rolled out. The client at upstream revision
`b139ccd8` still required `exact_target`; a companion local patch preserves legacy
summaries while accepting the new label only for `target_literature`. It retains
the existing citation, excerpt-hash, full-text, manifest and archived-proposal
checks, and passed 178 related client tests. Apply the paired changes together.

## Structured qualifiers

UniProt KEGG and BioCyc cross-references often identify genes or proteins.
These identifiers are retained in `dbXrefs`, not inferred to be pathways.
Only recognized pathway ID conventions are eligible for `pathwayTerms`.
Reactome IDs require a supported matching source organism; human pathways
are not emitted as E. coli pathways.

The proposal builder filters pathway candidates and research-summary facts.
The wire-contract integrity check also rejects non-pathway claims even when
their field-level provenance and operation-to-claim binding are otherwise valid.
Unrecognized BioCyc names are excluded conservatively from automatic pathway
qualifiers; extending the accepted conventions requires verified record types.

These checks affect newly prepared proposals. Existing task results and already
applied annotations are not automatically relabelled, migrated or rolled back.
Before production rollout, compare newly retrieved sources and regenerated
proposals against independently assessed records, including rejected and
insufficient-evidence cases. Report recall and curator correction effort as
well as collision removal.
