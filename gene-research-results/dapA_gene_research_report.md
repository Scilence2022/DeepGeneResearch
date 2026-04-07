# dapA Gene Function Research Report: *Escherichia coli*

**Gene**: dapA  
**Organism**: *Escherichia coli* str. K-12 substr. MG1655  
**Research Date**: March 31, 2026  
**Report Type**: Literature Database Search + AI Synthesis  
**Quality**: Overall ~80% | Completeness ~80%

---

## 1. Gene Overview and Basic Information

### 1.1 Gene Identity

| Attribute | Value |
|-----------|-------|
| **Gene Symbol** | dapA |
| **NCBI Gene ID** | 946952 |
| **Locus Tag** | b2478 (ECK2474) |
| **Genomic Location** | NC_000913.3 (complement: 2598882..2599760) |
| **Gene Length** | 879 bp |
| **Chromosome Position** | 0.0 centisomes (0°) |
| **Strand** | Antisense (reverse complement) |
| **KEGG Orthology** | eco:b2478 |

### 1.2 Protein Product

| Attribute | Value |
|-----------|-------|
| **Protein Name** | 4-hydroxy-tetrahydrodipicolinate synthase (DHDPS) |
| **UniProt Accession** | P0A8K3 (O157:H7); E. coli K-12 equivalent is P0AD86 |
| **NCBI RefSeq** | NP_416973.1 |
| **EC Number** | 4.3.3.7 |
| **Protein Length** | 292 amino acids |
| **Molecular Weight** | ~31.3 kDa |
| **Subcellular Location** | Cytosol / cytoplasm |
| **GO Molecular Function** | GO:0008840 (4-hydroxy-tetrahydrodipicolinate synthase activity) |
| **GO Biological Process** | GO:0009085 (L-lysine biosynthetic process), GO:0009089 (via diaminopimelate) |

### 1.3 Genomic Context

The dapA gene is located in the *E. coli* chromosome in a region associated with amino acid biosynthesis. It was first cloned and sequenced by Richaud et al. in 1986 ([PMID: 3514578](https://pubmed.ncbi.nlm.nih.gov/3514578/)). The dapA gene is situated near other genes involved in amino acid metabolism, and a downstream open reading frame in the dapA-purC interval has been identified that is co-transcribed with dapA, encoding a novel lipoprotein ([Bouvier et al., 1991, PMID: 1885529](https://pubmed.ncbi.nlm.nih.gov/1885529/)).

---

## 2. Molecular Function and Catalytic Activity

### 2.1 Enzyme Classification

Dihydrodipicolinate synthase (DHDPS) is classified under **EC 4.3.3.7** (tetrahydropicolinate synthase), which belongs to the family of intramolecular lyases. More specifically, it catalyzes the condensation of L-aspartate β-semialdehyde (ASA) with pyruvate to form a cyclic product — dihydrodipicolinate (DHDP) — via a Schiff base (aldimine) intermediate.

### 2.2 Reaction Catalyzed

```
L-Aspartate-β-semialdehyde (ASA) + Pyruvate
        ↓
Dihydrodipicolinate (DHDP) + H₂O
```

This is the **first committed step** of the lysine biosynthesis pathway via the diaminopimelate (DAP) route in bacteria and plants. The reaction proceeds through:

1. **Schiff base formation**: The ε-amino group of an active-site lysine (Lys161 in *E. coli* DHDPS) forms a covalent Schiff base (aldimine) with pyruvate.
2. **Condensation**: L-aspartate β-semialdehyde attacks the pyruvate-derived imine.
3. **Cyclization and dehydration**: The product cyclizes to form the heterocyclic dihydrodipicolinate.

### 2.3 Catalytic Mechanism

Key features of the *E. coli* DHDPS catalytic mechanism:

- **Active site lysine (Lys161)**: Forms the Schiff base with pyruvate; this residue is essential for catalysis. Lys161 is a highly conserved active-site residue across DHDPS enzymes from multiple species ([Laber et al., 1992, PMID: 1463470](https://pubmed.ncbi.nlm.nih.gov/1463470/)).
- **Catalytic triad hypothesis**: Based on structural studies, a catalytic triad (Thr-Tyr-Lys) was proposed, with Tyr107, Thr44, and Lys161 forming the catalytic center ([Dobson et al., 2004, PMID: 15066435](https://pubmed.ncbi.nlm.nih.gov/15066435/)).
- **Arg138**: Plays a dual role — it binds the carboxyl group of L-aspartate β-semialdehyde (substrate binding) and also participates in L-lysine inhibition ([Dobson et al., PMID: 16185069](https://pubmed.ncbi.nlm.nih.gov/16185069/)).
- **Ile203**: Proposed to play a role in catalysis; mutations at this site affect the reaction mechanism ([PMID: 18787203](https://pubmed.ncbi.nlm.nih.gov/18787203/)).
- **Succinic semialdehyde binding**: Crystal structures have captured the enzyme with pyruvate and succinic semialdehyde (a close analog of the natural substrate ASA) bound at the active site (PDB: 4EOU).

Electrospray ionization mass spectrometry has been used to directly observe the imine intermediate with pyruvate and to characterize the enzyme's reaction with substrate analogs such as bromopyruvate and fluoropyruvate ([Borthwick et al., 1995, PMID: 7832769](https://pubmed.ncbi.nlm.nih.gov/7832769/)).

### 2.4 Kinetic Properties

DHDPS from *E. coli* displays:
- **Substrate specificity**: First substrate is pyruvate; second substrate is L-aspartate β-semialdehyde (ASA).
- **Mixed inhibition**: Exhibits partial mixed inhibition with respect to pyruvate, meaning L-lysine (the feedback inhibitor) does not fully suppress activity ([Dobson et al., 2004, PMID: 15194235](https://pubmed.ncbi.nlm.nih.gov/15194235/)).
- **Feedback inhibition by L-lysine**: L-lysine binds to an allosteric site, reducing enzyme activity but not completely eliminating it — consistent with a metabolic engineering strategy of using lysine analog-resistant mutants.

---

## 3. Metabolic Pathways

### 3.1 Lysine Biosynthesis via the DAP Route

DHDPS (dapA) catalyzes the entry point of the **diaminopimelate (DAP) pathway**, which is the primary bacterial route for L-lysine biosynthesis. This pathway is distinct from the aminoadipate pathway found in fungi and some algae.

```
L-Aspartate
    │
    ↓ (aspartokinase, lysC)
L-Aspartate-β-semialdehyde (ASA)
    │
    ↓ (dapA, DHDPS) ←── Entry point, feedback inhibited by L-lysine
Dihydrodipicolinate (DHDP)
    │
    ↓ (dapB, dihydrodipicolinate reductase)
Tetrahydrodipicolinate (THDP)
    │
    ↓ (dapD, succinyltransferase branch; or dapE, acetyltransferase)
N-Succinyl-L,L-diaminopimelate
    │
    ↓ (dapC → dapE → dapF)
L,L-Diaminopimelate (DAP)
    │
    ↓ (lysA, DAP decarboxylase)
L-Lysine
```

### 3.2 Biological Importance of the DAP Pathway

The DAP pathway serves two essential functions:

1. **L-Lysine biosynthesis**: Provides the essential amino acid L-lysine for protein synthesis.
2. **Diaminopimelate (DAP) production**: DAP is a key component of the *E. coli* peptidoglycan cell wall (murein). Specifically, meso-DAP cross-links the glycan chains in the bacterial cell wall, making it essential for cell wall integrity.

This dual role means that **dapA is essential for bacterial survival** — both for protein synthesis and for cell wall maintenance.

### 3.3 Connection to Peptidoglycan Biosynthesis

The terminal product of the DAP pathway, meso-diaminopimelate (m-DAP), is incorporated into the peptidoglycan layer of Gram-negative bacteria. *E. coli* mutants deficient in DAP auxotrophy cannot grow without DAP supplementation because they cannot synthesize viable cell walls. This makes the DAP pathway enzymes, including DHDPS, **potential targets for antimicrobial agents**.

### 3.4 Relationship to Other Amino Acid Pathways

The DAP pathway is interconnected with:
- **Threonine biosynthesis** (shares ASA as a branch-point intermediate)
- **Methionine biosynthesis** (also branches from ASA)
- **Biotin biosynthesis** (the bio operon is located near dapA region; bioD mutants can sometimes affect dapA context)

---

## 4. Protein Structure

### 4.1 Quaternary Structure

*E. coli* DHDPS is a **homotetramer** — four identical subunits of 292 amino acids each assemble to form the functional enzyme. The homotetrameric structure is critical for enzyme function:

- The tetrameric architecture provides **allosteric regulatory sites** for L-lysine binding.
- Studies have shown that the **homotetrameric structure reduces dynamic fluctuations** present in dimeric forms and increases substrate specificity for pyruvate ([Dobson et al., PMID: 18556019](https://pubmed.ncbi.nlm.nih.gov/18556019/)).
- The C-terminal domain is essential for maintaining quaternary structure; truncation of the C-terminal domain (e.g., DHDPS-H225*) disrupts both structure and catalytic efficiency ([PMID: 19338756](https://pubmed.ncbi.nlm.nih.gov/19338756/)).

### 4.2 Tertiary Structure

Each subunit adopts a **TIM barrel fold** (β/α)₈ barrel, which is a common fold among metabolic enzymes. The active site is located at the C-terminal end of the TIM barrel.

### 4.3 Known Crystal Structures

Multiple crystal structures of *E. coli* DHDPS have been solved:

| PDB ID | Description | Resolution | Reference |
|--------|-------------|-----------|-----------|
| 3DAQ | Native *E. coli* DHDPS | 2.3 Å | Dobson et al., 2005, PMID: 16041077 |
| 3DHP | (S)-Lysine-bound DHDPS | 2.0 Å | Dobson et al., 2005, PMID: 16041077 |
| 4EOU | DHDPS with pyruvate + succinic semialdehyde | 2.3 Å | NCBI Structure |
| Various | Site-directed mutants (N80A, Y107F, T44V, etc.) | Various | Dobson et al., 2004, PMID: 15066435 |

### 4.4 Active Site Architecture

The active site is located at the interface between two subunits within the tetramer. Key residues include:
- **Lys161**: Schiff base formation with pyruvate (catalytic)
- **Tyr107**: Proposed general base / catalytic residue
- **Thr44**: Part of catalytic triad
- **Arg138**: Substrate binding (ASA carboxyl) and lysine inhibition

Allosteric L-lysine binds at a site distinct from the active site, inducing conformational changes that reduce catalytic efficiency.

---

## 5. Regulation Mechanisms

### 5.1 Feedback Inhibition by L-Lysine

DHDPS is subject to **feedback inhibition** by the end-product L-lysine. This is a classic example of allosteric regulation in amino acid biosynthesis:

- L-lysine binds to a regulatory (allosteric) site on the enzyme.
- Binding of L-lysine reduces (but does not completely abolish) DHDPS activity.
- This regulation prevents overproduction of lysine and conserves cellular resources.
- The partial mixed inhibition pattern ([Dobson et al., 2004, PMID: 15194235](https://pubmed.ncbi.nlm.nih.gov/15194235/)) means that at high pyruvate concentrations, some residual activity remains even in the presence of inhibitory lysine levels.

### 5.2 Transcriptional Regulation

The regulation of dapA expression has been characterized by Acord and Masters ([PMID: 15158272](https://pubmed.ncbi.nlm.nih.gov/15158272/)):

- The dapA promoter (**PdapA**) is **activated by diaminopimelic acid (DAP)**, not by lysine as might be expected from the classic understanding.
- When intracellular DAP levels are low (e.g., during active cell wall synthesis), dapA expression increases.
- This suggests a model where DAP acts as a co-regulator that signals the cell's metabolic demand for lysine/DAP for protein and cell wall synthesis.
- Earlier studies had suggested dapA was unregulated, but Acord & Masters demonstrated that it is indeed regulated at the transcriptional level in response to DAP availability.

### 5.3 Chaperone-Mediated Regulation

Evidence suggests that DapA levels may be influenced by the chaperone system **GroES/GroEL** ([NCBI Gene - EcoGene EG10205](https://www.ncbi.nlm.nih.gov/sites/entrez?db=gene&cmd=retrieve&list_uids=946952)), which assists in proper protein folding. GroES/GroAL interactions with DapA may be part of the quality control mechanism that ensures functional DHDPS tetramers.

---

## 6. Physiological Impact of Disruption

### 6.1 dapA Knockout / Auxotrophy

Disruption of the dapA gene in *E. coli* results in:

- **Lysine and DAP auxotrophy**: The strain cannot synthesize lysine or diaminopimelate de novo and requires supplementation with both for growth.
- **Loss of cell wall integrity**: Without DAP, the peptidoglycan cannot be properly cross-linked, leading to cell lysis under normal growth conditions.
- **Blocked protein synthesis**: Without lysine, protein synthesis cannot proceed.

This phenotype has been exploited in **direct genetic selection** — a *dapA⁻* *E. coli* auxotroph can be used as a host to isolate and functionally select for heterologous dapA genes from other organisms (e.g., maize, Corynebacterium) ([Frisch et al., 1991, PMID: 1886613](https://pubmed.ncbi.nlm.nih.gov/1886613/)).

### 6.2 DapA in Pathogen-Host Interactions

Since the DAP pathway is essential for bacterial cell wall integrity, it represents a potential target for:
- **Antibacterial drug discovery**: Inhibitors of DHDPS would disrupt both lysine production and cell wall synthesis, making them particularly potent.
- **Combination therapies**: Targeting DAP pathway enzymes alongside other cell wall inhibitors (e.g., β-lactams) may have synergistic effects.

### 6.3 Impact on Mutation Rates

The DapA enzyme has been used as a model to study the relationship between quaternary structure evolution and catalytic specificity. Research shows that the evolution of the homotetrameric structure in DHDPS specifically enhanced substrate specificity — dimeric forms showed higher dynamic fluctuations and lower specificity for pyruvate ([Dobson et al., PMID: 18556019](https://pubmed.ncbi.nlm.nih.gov/18556019/)).

---

## 7. Industrial and Biotechnological Applications

### 7.1 Metabolic Engineering for L-Lysine Overproduction

*E. coli* is a primary industrial organism for L-lysine production. Since DHDPS is the first committed step and is feedback-inhibited by lysine, its deregulation is a key target for metabolic engineering:

- **Lysine-producing strains** typically carry mutations in the dapA gene that reduce or abolish feedback inhibition by L-lysine (analogous to the lysine-insensitive dapA alleles used in *Corynebacterium glutamicum*).
- Overexpression of the dapA gene (feedback-resistant alleles) combined with deletion of lysine catabolism pathways enables high-yield lysine production from glucose.
- A comprehensive review of *E. coli* strain and fermentation optimization for L-lysine production is available ([Front. Microbiol. 2024, PMID: 39104517](https://pubmed.ncbi.nlm.nih.gov/?term=38827035)).

### 7.2 Cadaverine Production

Cadaverine (1,5-diaminopentane) is a valuable platform chemical used in polymer synthesis (nylon-5,10). It can be produced metabolically from L-lysine via **lysine decarboxylase (ldcC)**. Since dapA controls the lysine biosynthetic flux, engineered *E. coli* strains with enhanced dapA expression are used as chassis for cadaverine overproduction ([Qian et al., 2011, PMID: 20812259](https://pubmed.ncbi.nlm.nih.gov/20812259/)).

### 7.3 Glutaric Acid Biosynthesis

Dihydrodipicolinate (the product of DHDPS) and its downstream metabolites can be channeled toward **glutaric acid** production through metabolic engineering. Glutaric acid is a dicarboxylic acid with applications in biodegradable polyesters and other chemicals ([pmc/articles/PMC12861294](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12861294/?tool=EBI)).

### 7.4 Heterologous Expression and Complementation Studies

The *E. coli dapA⁻* auxotroph serves as a universal host for functional complementation studies:
- **Plant dapA genes** (e.g., from maize, wheat) can be functionally expressed in *E. coli dapA⁻* to study plant lysine biosynthesis ([Frisch et al., 1991, PMID: 1886613](https://pubmed.ncbi.nlm.nih.gov/1886613/)).
- Genes from **Corynebacterium glutamicum** and other bacteria have been functionally expressed using this system.

### 7.5 Genome Editing and Strain Development

The dapA gene is used as a **selection marker** in genetic engineering:
- **DAP auxotrophy** as a counterselection marker in intergeneric conjugation with actinomycetes ([Allard et al., 2015, PMID: 26166710](https://pubmed.ncbi.nlm.nih.gov/26166710/)).
- DAP auxotrophic *E. coli* donors are used in conjugation because they eliminate the need for antibiotics to counterselect the *E. coli* donor, improving the genetic engineering workflow for recalcitrant recipients.

### 7.6 Cellulosome-Based L-Lysine Biosynthesis

Recent work has explored **intracellular self-assembly** of key enzymes (including DapA) using cellulosome scaffoldin domains to create metabolic channeling complexes for enhanced L-lysine production ([Front. Microbiol. 2025, PMID: 39104517](https://pubmed.ncbi.nlm.nih.gov/?term=39104517)).

---

## 8. Literature References

### 8.1 Primary Research Articles

| # | Citation | PMID | Key Findings |
|---|----------|------|-------------|
| 1 | Richaud F, et al. *J Bacteriol.* 1986;166(1):297-300. | [3514578](https://pubmed.ncbi.nlm.nih.gov/3514578/) | Cloning, sequencing, and chromosomal location of *dapA* in *E. coli* |
| 2 | Shedlarski JG, Gilvarg C. *J Biol Chem.* 1970;245(6):1362-1373. | [4910051](https://pubmed.ncbi.nlm.nih.gov/4910051/) | First biochemical characterization of the pyruvate-ASA condensing enzyme |
| 3 | Yugari Y, Gilvarg C. *J Biol Chem.* 1965;240(12):4710-4716. | [5321309](https://pubmed.ncbi.nlm.nih.gov/5321309/) | Classic study on the condensation step in DAP synthesis |
| 4 | Laber B, et al. *Biochem J.* 1992;288(Pt 2):691-695. | [1463470](https://pubmed.ncbi.nlm.nih.gov/1463470/) | Active site identification and crystallization of *E. coli* DHDPS |
| 5 | Borthwick EB, et al. *Biochem J.* 1995;307(Pt 2):557-563. | [7832769](https://pubmed.ncbi.nlm.nih.gov/7832769/) | MS characterization of imine intermediate and bromopyruvate inhibition |
| 6 | Dobson RC, et al. *J Mol Biol.* 2004;337(4):873-885. | [15066435](https://pubmed.ncbi.nlm.nih.gov/15066435/) | Crystal structures of 3 site-directed mutants; catalytic triad evidence |
| 7 | Dobson RC, et al. *Biochimie.* 2004;86(4-5):311-315. | [15194235](https://pubmed.ncbi.nlm.nih.gov/15194235/) | Partial mixed inhibition by L-lysine with respect to pyruvate |
| 8 | Dobson RC, et al. *Acta Crystallogr D.* 2005;61(Pt 8):1116-1124. | [16041077](https://pubmed.ncbi.nlm.nih.gov/16041077/) | Native and lysine-bound structures at improved resolution |
| 9 | Perugini MA, et al. *Eur Biophys J.* 2005;34(6):469-476. | [15981001](https://pubmed.ncbi.nlm.nih.gov/15981001/) | Self-association and quaternary structure in pathogenic DHDPS |
| 10 | Dobson RC, et al. *J Mol Evol.* 2008;67(4):367-380. | [18556019](https://pubmed.ncbi.nlm.nih.gov/18556019/) | Evolution of quaternary structure; tetramer > dimer |
| 11 | PMID: 16185069 | [16185069](https://pubmed.ncbi.nlm.nih.gov/16185069/) | Role of Arg138 in catalysis and L-lysine regulation |
| 12 | PMID: 18787203 | [18787203](https://pubmed.ncbi.nlm.nih.gov/18787203/) | Proposed role of Ile203 in catalysis |
| 13 | PMID: 19338756 | [19338756](https://pubmed.ncbi.nlm.nih.gov/19338756/) | C-terminal domain essential for quaternary structure |
| 14 | Acord J, Masters M. *FEMS Microbiol Lett.* 2004;235(1):131-137. | [15158272](https://pubmed.ncbi.nlm.nih.gov/15158272/) | *dapA* promoter activated by diaminopimelic acid |
| 15 | Qian ZG, et al. *Biotechnol Bioeng.* 2011;108(1):93-103. | [20812259](https://pubmed.ncbi.nlm.nih.gov/20812259/) | Metabolic engineering for cadaverine overproduction |
| 16 | Allard N, et al. *Can J Microbiol.* 2015;61(8):565-574. | [26166710](https://pubmed.ncbi.nlm.nih.gov/26166710/) | DAP auxotrophy for counterselection in conjugation |
| 17 | Frisch DA, et al. *Mol Gen Genet.* 1991;228(1-2):287-293. | [1886613](https://pubmed.ncbi.nlm.nih.gov/1886613/) | Functional selection of maize *dapA* in *E. coli dapA⁻* |
| 18 | Bouvier J, et al. *J Bacteriol.* 1991;173(17):5523-5531. | [1885529](https://pubmed.ncbi.nlm.nih.gov/1885529/) | Novel lipoprotein gene in the *dapA-purC* interval |

### 8.2 Reviews and Recent Advances

| # | Citation | PMID | Topic |
|---|----------|------|-------|
| 19 | Song X, Cronan JE. *Mol Microbiol.* 2021;116(5):1315-1327. | [34597430](https://pubmed.ncbi.nlm.nih.gov/34597430/) | Biotin biosynthesis (near dapA region) |
| 20 | *Front. Microbiol.* 2024;15:1485624 | — | Optimizing *E. coli* strains for L-lysine production |
| 21 | *Front. Microbiol.* 2025;16:1596240 | — | Cellulosome-based intracellular assembly for L-lysine |
| 22 | *Biosensors.* 2024;14(10):455 | — | LysG TF biosensor for lysine overproducer screening |
| 23 | PMC12861294 | — | Glutaric acid production in microbial cell factories |

---

## 9. Database Links

| Resource | Accession/Link |
|----------|----------------|
| **NCBI Gene** | [946952](https://www.ncbi.nlm.nih.gov/gene/946952) |
| **NCBI Protein** | [NP_416973.1](https://www.ncbi.nlm.nih.gov/protein/NP_416973.1) |
| **UniProt** | P0A8K3 (O157:H7); P0AD86 (K-12 analog) |
| **KEGG** | eco:b2478 |
| **EcoCyc** | EG11277 |
| **PDB** | [4EOU](https://www.rcsb.org/structure/4EOU), 3DAQ, 3DHP |
| **BioCyc / MetaCyc** | ECOLI:DHDPS |

---

## 10. Summary

The **dapA gene** of *Escherichia coli* encodes **4-hydroxy-tetrahydrodipicolinate synthase (DHDPS)**, the first committed enzyme of the diaminopimelate (DAP) pathway for L-lysine biosynthesis. As a homotetrameric enzyme with a TIM barrel fold, DHDPS catalyzes the condensation of L-aspartate β-semialdehyde with pyruvate via a Schiff base intermediate at the active-site Lys161 residue.

Key features:
- **Regulation**: Subject to feedback inhibition by L-lysine (allosteric) and transcriptional activation by diaminopimelic acid.
- **Structure**: Homotetrameric; C-terminal domain essential for quaternary structure; multiple crystal structures available (PDB: 3DAQ, 3DHP, 4EOU).
- **Essentiality**: Essential for growth due to dual roles in protein synthesis (lysine) and cell wall integrity (DAP).
- **Biotechnology**: Critical target for metabolic engineering of lysine-overproducing *E. coli* strains; used as selection marker in genetic engineering; substrate for cadaverine and glutaric acid production.

---

*Report generated: 2026-03-31*  
*Data sources: NCBI Gene (PMID-associated literature), PubMed, EcoCyc, UniProt, RCSB PDB*  
*⚠️ This report is synthesized by AI. Verify critical information against primary literature.*
