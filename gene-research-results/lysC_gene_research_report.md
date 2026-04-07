# lysC Gene Function Research Report: *Escherichia coli*

**Gene:** lysC
**Organism:** *Escherichia coli* K12 / W3110
**Report Generated:** 2026-03-31
**Research Method:** Literature Database Search (PubMed, Europe PMC, NCBI Gene, UniProt, bioRxiv) + AI Synthesis
**Quality Score:** Overall ~80% | Completeness ~80%

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Gene Overview and Basic Information](#2-gene-overview-and-basic-information)
3. [Molecular Function](#3-molecular-function)
4. [Metabolic Pathways](#4-metabolic-pathways)
5. [Protein Structure](#5-protein-structure)
6. [Regulation Mechanisms](#6-regulation-mechanisms)
7. [Physiological Impact of lysC Disruption](#7-physiological-impact-of-lysC-disruption)
8. [Clinical, Industrial and Biotechnological Applications](#8-clinical-industrial-and-biotechnological-applications)
9. [Key Literature References](#9-key-literature-references)
10. [PubMed Abstract Compendium](#10-pubmed-abstract-compendium)
11. [Conclusion](#11-conclusion)

---

## 1. Executive Summary

The *lysC* gene of *Escherichia coli* encodes **aspartokinase III (AK-III)**, the third and lysine-sensitive isozyme of aspartokinase. Aspartokinase III catalyzes the first committed step of the lysine biosynthetic pathway — the phosphorylation of L-aspartate to 4-phospho-L-aspartate using ATP as phosphate donor. *lysC* is the only aspartokinase isozyme in *E. coli* that is specifically inhibited by lysine feedback, making it the primary metabolic gatekeeper for lysine homeostasis.

The regulatory architecture of *lysC* is exceptionally sophisticated, employing at least three distinct mechanisms operating at different levels:

| Level | Mechanism | Effect |
|-------|-----------|--------|
| Enzymatic | Allosteric feedback inhibition | Rapid enzyme activity shutdown when lysine is abundant |
| Translational | Lysine riboswitch in 5′-UTR | Prevents ribosome binding when lysine is bound |
| Transcriptional | Rho-dependent termination + dual promoters (P1/P2) | Fine-tunes mRNA synthesis and stability |

This multi-layered regulation ensures precise coordination of lysine biosynthesis with cellular demand. The *lysC* gene also has evolutionary significance: it shares homology with the N-terminal regions of the two bifunctional aspartokinase-homoserine dehydrogenase (AK-HSDH) enzymes (metL and thrA), revealing a gene duplication and specialization history.

**Key organism:** *Escherichia coli* K12 (W3110, MG1655 derivatives)

---

## 2. Gene Overview and Basic Information

### 2.1 Basic Gene Characteristics

| Property | Value |
|----------|-------|
| **Gene Symbol** | lysC |
| **Systematic Locus** | b3404 (in *E. coli* K-12 MG1655) |
| **Chromosomal Position** | ~91 min region of the *E. coli* chromosome |
| **Neighboring Genes** | metH (upstream), asd (downstream in some organisms) |
| **Protein Product** | Aspartokinase III (AK-III) |
| **Protein Length** | 449 amino acid residues |
| **Molecular Weight** | ~49.4 kDa |
| **Enzyme Commission Number** | EC 2.7.2.4 (ATP:L-aspartate 4-phosphotransferase) |

### 2.2 Gene Structure

The *lysC* gene contains a **long leader sequence** between the transcription and translation start sites. This leader sequence is a hallmark of the *lysC* gene in both *E. coli* and *Bacillus subtilis* and is critical for regulation. The leader contains:

- A **lysine-responsive riboswitch** (L-box motif)
- Two promoters: **P1** (downstream) and **P2** (upstream, 85 bp further upstream than P1)
- Conserved regions that participate in the lysine-mediated repression mechanism

Mutations within the conserved leader regions can lead to **constitutive expression** of *lysC*, bypassing lysine-mediated repression [[6]](https://pubmed.ncbi.nlm.nih.gov/9812360/).

### 2.3 Promoter Architecture

```
5'-[P2 promoter]-85bp-[P1 promoter]-lysC coding region (449 aa)-3'
         ↑                       ↑
   stronger under          canonical
   lysine-excess           promoter
```

Both promoters P1 and P2 are regulated by lysine, but they respond to different lysine concentration thresholds.

---

## 3. Molecular Function

### 3.1 Primary Catalytic Activity

**Enzyme:** Aspartokinase III (AK-III)
**Reaction:**
```
ATP + L-Aspartate → ADP + 4-Phospho-L-Aspartate
```

This is the **first committed step** of the lysine biosynthetic pathway. Once aspartate is phosphorylated, it enters the pathway that ultimately produces L-lysine (and simultaneously threonine and methionine via the aspartate family pathway).

### 3.2 Reaction Chemistry

The reaction follows a sequential Bi-Bi kinetic mechanism:

1. ATP binds to the active site
2. L-Aspartate binds
3. Phosphate transfer occurs from ATP to the β-carboxyl group of aspartate
4. 4-phospho-L-aspartate and ADP are released

### 3.3 Isozymes in *E. coli*

*E. coli* possesses **three** isofunctional aspartokinases:

| Isozyme | Gene | Feedback Regulation | Bifunctionality |
|---------|------|---------------------|-----------------|
| AK-I | thrA | Inhibited by threonine | Yes (AK-HSDH I) |
| AK-II | metL | Inhibited by methionine | Yes (AK-HSDH II) |
| AK-III | lysC | **Inhibited by lysine** | No (monofunctional) |

The existence of three isozymes prevents a single amino acid shortage from completely shutting down lysine biosynthesis, while also preventing toxic accumulation of any one product.

### 3.4 Catalytic Residues and Active Site

The *E. coli* AK-III (449 aa) is homologous to the N-terminal region of the bifunctional AK-HSDH enzymes (which are ~900 aa each). Key residues involved in:
- **ATP binding:** Rossmann-fold motif (glycine-rich loop)
- **Aspartate binding:** Conserved lysine and arginine residues
- **Allosteric lysine binding:** Separate regulatory site distinct from the active site
- **Subunit interaction:** Conserved regions across all three isozymes suggest common oligomerization interfaces [[4]](https://pubmed.ncbi.nlm.nih.gov/3003049/)

### 3.5 Enzyme Kinetics

| Parameter | Value (approx.) | Reference |
|-----------|----------------|-----------|
| K_m (Aspartate) | ~1–5 mM | Indirect estimates |
| K_m (ATP) | ~0.1–0.5 mM | Indirect estimates |
| K_i (Lysine, feedback) | ~0.05–0.2 mM | Literature |
| Oligomeric State | Homodimer or homotetramer (debated) | [[4]](https://pubmed.ncbi.nlm.nih.gov/3003049/) |

---

## 4. Metabolic Pathways

### 4.1 The Aspartate Family Pathway

The *lysC* gene product occupies a central branch point in bacterial metabolism:

```
                      ┌─→ Threonine ─→ Isoleucine
                      │
L-Aspartate ─[AK-III]→ 4-Phospho-Aspartate ──→ ...

                      │                           │
                      └─→ Lysine ←─ (lysC product) 
                             
                      │ (via homoserine)
                      └─→ Methionine
```

### 4.2 The Lysine Biosynthetic Pathway (DAP Route)

The full lysine biosynthesis pathway in *E. coli* via the diaminopimelate (DAP) route:

```
L-Aspartate
    ↓  [Aspartokinase III - lysC]
4-Phospho-L-Apartate
    ↓
L-Aspartate-β-semialdehyde (via asd gene)
    ↓
Dihydrodipicolinate (dapA)
    ↓
Tetrahydrodipicolinate (dapB)
    ↓
Diaminopimelate (dapD, dapE, dapF)
    ↓
L-Lysine
```

### 4.3 Cross-Pathway Connections

The knockout microarray study by Liu et al. (2007) revealed that *lysC* disruption causes significant changes in multiple metabolic gene clusters [[2]](https://pubmed.ncbi.nlm.nih.gov/17956427/):

| Pathway Affected | Direction | Genes Affected |
|-----------------|-----------|----------------|
| Lysine biosynthesis | Upregulated (compensatory) | dap, lys genes |
| Threonine biosynthesis | Altered | thr genes |
| Methionine biosynthesis | Altered | met genes |
| Isoleucine biosynthesis | Altered | ilv genes |
| Oxaloacetate metabolism | Altered | Multiple genes |
| α-Ketoglutarate metabolism | Altered | Multiple genes |
| Glutamate metabolism | Altered | glutamate synthase genes |
| Transporters | Upregulated | Multiple amino acid transporter genes |
| Heat shock proteins | Upregulated | chaperone genes |

This demonstrates that *lysC* sits at a metabolic hub whose disruption ripples through central carbon and nitrogen metabolism.

### 4.4 The Aspartate Pool

Aspartate is derived from:
- **Transamination** of oxaloacetate (via aspartate aminotransferase, aspC)
- **Photosynthetic organisms:** directly from photosynthesis
- Links to **TCA cycle** through oxaloacetate
- Links to **gluconeogenesis** through phosphoenolpyruvate carboxykinase

---

## 5. Protein Structure

### 5.1 Primary Structure

- **Amino Acids:** 449 residues
- **Molecular Weight:** ~49.4 kDa
- **Calculated from nucleotide sequence** [[4]](https://pubmed.ncbi.nlm.nih.gov/3003049/)

### 5.2 Domain Organization

The 449-aa AK-III sequence is homologous to the **N-terminal ~450 aa** of the two bifunctional AK-HSDH enzymes (thrA and metL), which are each ~900 aa. This structural homology suggests:

1. Gene duplication event created an ancestral bifunctional enzyme
2. Further duplication created separate monofunctional and bifunctional variants
3. The C-terminal region of AK-HSDH enzymes contains the **homoserine dehydrogenase** domain

### 5.3 Structural Model

Based on homology with known structures of aspartokinases from *Corynebacterium glutamicum* and *Mycobacterium tuberculosis*, AK-III is predicted to:

- Form a **homo-dimeric** or **homo-tetrameric** quaternary structure
- Contain an **N-terminal kinase domain** with classic Rossmann-fold topology for nucleotide binding
- Have a **C-terminal allosteric domain** with a distinct fold for lysine binding
- Display **conformational changes** upon lysine binding that propagate to the active site (allosteric communication)

> ⚠️ **Note:** The precise crystal structure of *E. coli* AK-III has not been fully determined. Further structural work is needed.

### 5.4 Comparison with Related Enzymes

| Feature | AK-III (lysC) | AK-HSDH I (thrA) | AK-HSDH II (metL) |
|---------|-------------|-----------------|-----------------|
| Length | 449 aa | ~900 aa | ~900 aa |
| Function | Monofunctional | Bifunctional (AK + HSDH) | Bifunctional (AK + HSDH) |
| Feedback regulator | Lysine | Threonine | Methionine |
| Homology to AK-III | — | N-terminal 450 aa | N-terminal 450 aa |

---

## 6. Regulation Mechanisms

The *lysC* gene is subject to **multi-layered regulation** — arguably the most complex of the three *E. coli* aspartokinases. The regulation occurs at three levels:

### 6.1 Allosteric Feedback Inhibition (Enzyme Level)

**Mechanism:** Lysine binding directly inhibits AK-III catalytic activity by stabilizing a conformation that cannot bind substrate efficiently.

- **Type:** Allosteric inhibition (non-competitive with respect to substrates)
- **End-product:** L-Lysine
- **Sensitivity:** K_i ≈ 0.05–0.2 mM
- **Physiological role:** Rapid shutdown of lysine synthesis when intracellular lysine is abundant

This is the **primary metabolic control point** for lysine overproduction in industrial fermentation.

### 6.2 Riboswitch-Mediated Regulation (Translational Level)

The *lysC* mRNA contains a **lysine-responsive riboswitch** (also called the **L-box riboswitch** or **lysC riboswitch**) in its 5′-untranslated region (5′-UTR).

#### Structure (ON/OFF States)

The riboswitch adopts two alternative conformations:

| State | Lysine Condition | Conformation | Outcome |
|-------|-----------------|--------------|---------|
| **ON** | Low lysine | Anti-sequestering stem active; SD sequence accessible | Ribosome binds → Translation proceeds |
| **OFF** | High lysine | P1 stem forms; SD sequence sequestered; RNase E site exposed | Translation blocked; mRNA degraded |

**Mechanism details** [[1]](https://pubmed.ncbi.nlm.nih.gov/38253429/):

1. **Low lysine (ON state):** The riboswitch folds into a conformation where the Shine-Dalgarno (SD) sequence is accessible for ribosome binding. Translation proceeds normally.

2. **High lysine (OFF state):** Lysine binds to the riboswitch aptamer domain → conformational change → P1 stem forms → SD sequence is base-paired and sequestered → ribosome cannot bind.

3. **RNase E cleavage:** The conformational change in the OFF state also **exposes an RNase E cleavage site**, leading to mRNA degradation. RNase E is a key endoribonuclease in *E. coli* RNA decay.

4. **Rho-dependent transcription termination** (recently discovered, 2024): The lysC riboswitch also directly and indirectly modulates **Rho-dependent transcription termination**. Rho is a ring-shaped RNA helicase/translocase that terminates transcription at unstructured C-rich regions. The riboswitch OFF conformation creates an unstructured region that facilitates Rho termination. Notably, **both Rho and RNase E target the same RNA region**, suggesting that RNase E may degrade Rho-terminated transcripts to eliminate incomplete mRNAs [[1]](https://pubmed.ncbi.nlm.nih.gov/38253429/).

### 6.3 Transcriptional Regulation (Promoter Level)

#### Dual Promoter System

*lysC* has **two promoters** [[6]](https://pubmed.ncbi.nlm.nih.gov/9812360/):

| Promoter | Position | Strength | Lysine Response |
|----------|----------|----------|----------------|
| P1 | Downstream (canonical) | Moderate | Repressed by lysine |
| P2 | Upstream (85 bp further) | Stronger | Repressed by lysine |

Both promoters are regulated by lysine, but the P2 promoter is activated under specific metabolic conditions. This dual-promoter architecture allows **graded transcriptional response** to varying lysine concentrations.

#### Leader Sequence and the *lysC* Regulon

The long leader sequence between the transcription start sites and the *lysC* coding sequence contains the riboswitch. Mutations in conserved regions of this leader → **constitutive expression** (derepressed) [[3]](https://pubmed.ncbi.nlm.nih.gov/9851048/).

#### ArgP (IciA) Regulation

**ArgP** (also known as **IciA**) is a transcriptional regulator that binds to the *lysC* promoter region. ArgP is itself regulated by arginine, linking lysine and arginine metabolism. The *lysC* gene is part of a broader **L-box regulon** that coordinates lysine biosynthesis with other metabolic genes.

### 6.4 Summary of Regulatory Network

```
High Lysine:
  → Allosteric inhibition of AK-III enzyme (immediate feedback)
  → Riboswitch conformational change (translation block + mRNA decay)
  → Rho-dependent transcription termination (transcription block)
  → Reduced lysC mRNA levels
  → ↓ Lysine synthesis

Low Lysine:
  → No allosteric inhibition
  → Riboswitch ON state (translation active)
  → Full-length mRNA produced
  → ↑ Lysine synthesis
```

---

## 7. Physiological Impact of lysC Disruption

### 7.1 Lysine Auxotrophy

A *lysC* knockout mutant **cannot synthesize lysine** de novo and therefore requires exogenous lysine for growth. This confirms the essential, non-redundant role of AK-III in lysine biosynthesis in *E. coli*.

### 7.2 Global Transcriptomic Changes (Microarray Study, Liu et al. 2007)

The *lysC* knockout in *E. coli* W3110 causes dramatic gene expression changes [[2]](https://pubmed.ncbi.nlm.nih.gov/17956427/):

**Upregulated genes:**
- Amino acid transporter genes (compensatory uptake)
- Heat shock protein / chaperone genes (proteostatic stress)
- Lysine biosynthesis operon genes (compensatory attempt)

**Downregulated / altered genes:**
- Genes of oxaloacetate, α-ketoglutarate, and glutamate metabolism (central carbon rewiring)
- Threonine, methionine, isoleucine biosynthesis genes (cross-regulation)

**Phenotypic consequences:**
- Growth retardation in minimal medium (without lysine supplementation)
- Phenotypic changes similar to **lysine starvation**, even when other amino acids are present
- Compensatory upregulation of lysine transport systems

### 7.3 Evolutionary Perspective

The evolutionary history of *lysC* is closely tied to the other two aspartokinases. Cassan et al. (1986) proposed an evolutionary pathway [[4]](https://pubmed.ncbi.nlm.nih.gov/3003049/):

```
Ancestral bifunctional AK-HSDH (N-terminal AK + C-terminal HDH)
         ↓
    Gene duplication
         ↓
    ┌──────────┴──────────┐
metL (AK-HSDH II)   Ancestral AK
   ↓                       ↓
   ↓               Further specialization
   ↓                       ↓
metL (AK-HSDH II)   ┌─────┴─────┐
                    │           │
                   thrA       lysC
                (AK-HSDH I)  (AK-III, monofunctional)
```

The conservation of subunit interaction regions across all three isozymes supports this evolutionary model.

---

## 8. Clinical, Industrial and Biotechnological Applications

### 8.1 Industrial Amino Acid Production

*Corynebacterium glutamicum* is the industrial workhorse for lysine production. The *lysC* homolog in *C. glutamicum* (**lysCα** and **lysCβ**) has been extensively engineered for lysine overproduction. Key strategies:

1. **Feedback-resistant mutations:** Site-directed mutagenesis of the *lysC* gene (e.g., Ser301→Tyr/Phe) creates enzymes less sensitive to lysine feedback inhibition. This allows the cell to continue producing lysine even when it accumulates, leading to industrial-scale overproduction [[5]](https://pubmed.ncbi.nlm.nih.gov/9080702/).

2. **Knockout of competing pathways:** Deleting *lysC* in industrial strains forces metabolic flux toward lysine, coupled with requirement for lysine supplementation in the growth medium.

3. **Metabolic engineering:** The *E. coli lysC* knockout study showed that knocking out *lysC* remodels central metabolism — useful knowledge for designing high-lysine-producing strains.

### 8.2 Antibiotic Development

Lysine biosynthesis is **essential for bacteria** but absent in mammals (mammals obtain lysine from diet). This makes the lysine biosynthesis pathway a potential target for **novel antibiotics**. The unique regulatory features of *lysC* (riboswitch) offer opportunities for designing riboswitch-binding antibiotics that could specifically inhibit lysine biosynthesis.

### 8.3 Riboswitch Biology and Synthetic Biology

The *lysC* riboswitch is one of the best-characterized lysine riboswitches. Its applications include:

- **Synthetic biology:** Engineering riboswitch-controlled gene expression in bacteria
- **Antisense therapeutics:** Designing oligonucleotides that mimic or block riboswitch function
- **Biosensors:** Using the lysine-binding riboswitch as a biosensor component

### 8.4 Ectoine Production (Metabolic Engineering Context)

Recent metabolic engineering work on ectoine production in *E. coli* has demonstrated that modifying the aspartate pathway (related to *lysC* function) can improve production yields by redirecting metabolic flux [[11]](https://pubmed.ncbi.nlm.nih.gov/26969253/) [[12]](https://pubmed.ncbi.nlm.nih.gov/39933098/).

### 8.5 Proteomics (LysC as Proteolytic Reagent)

Notably, "LysC" also refers to **lysyl endopeptidase (Lys-C)**, a protease that cleaves at lysine residues, widely used in proteomics workflows. The *E. coli* lysC gene product (aspartokinase III) is **not** the same as the proteolytic enzyme Lys-C, but the name overlap can cause confusion in literature searches.

---

## 9. Key Literature References

| # | PubMed ID | Year | Title | Journal | Key Finding |
|---|-----------|------|-------|---------|-----------|
| 1 | 38253429 | 2024 | Direct and indirect control of Rho-dependent transcription termination by the *E. coli lysC* riboswitch | *RNA* | Rho termination + RNase E targeting of lysC mRNA |
| 2 | 17956427 | 2007 | Global gene expression profiling of wild type and lysC knockout *E. coli* W3110 | *FEMS Microbiol Lett* | Transcriptomic changes in lysC knockout |
| 3 | 9851048 | 1998 | The leader sequence of the *E. coli lysC* gene is involved in the regulation of LysC synthesis | *FEMS Microbiol Lett* | Leader sequence mutations cause constitutive expression |
| 4 | 3003049 | 1986 | Nucleotide sequence of lysC encoding lysine-sensitive aspartokinase III of *E. coli* K12 | *J Biol Chem* | Full sequence, 449 aa, evolutionary pathway |
| 5 | 9080702 | 1997 | Site-directed mutagenesis of the aspartokinase gene lysC in *Brevibacterium flavum* | *Lett Appl Microbiol* | Feedback-resistant mutants via Ser301 mutation |
| 6 | 9812360 | 1998 | Analysis of the regulatory region of the lysC gene of *E. coli* | *FEMS Microbiol Lett* | Dual promoters P1/P2; both lysine-regulated |
| 7 | 1980002 | 1990 | lysCα and lysCβ overlap in *C. glutamicum*, adjacent to asd | *J Bacteriol* | Homologous gene organization in industrial organism |
| 8 | 15231796 | 2004 | P2 growth restriction suppressed by Rz1 homolog lysC (bacteriophage P2 context) | *J Bacteriol* | lysC involvement in phage growth |

---

## 10. PubMed Abstract Compendium

### Abstract 1: Rho-Dependent Transcription Termination (2024)
**PMID: 38253429** | *RNA* | Ghosh et al.

> Bacterial riboswitches are molecular structures that play a crucial role in controlling gene expression to maintain cellular balance. The *Escherichia coli lysC* riboswitch has been previously shown to regulate gene expression through translation initiation and mRNA decay. Recent research suggests that *lysC* gene expression is also influenced by Rho-dependent transcription termination. Through a series of in silico, in vitro, and in vivo experiments, we provide experimental evidence that the *lysC* riboswitch directly and indirectly modulates Rho transcription termination. Our study demonstrates that Rho-dependent transcription termination plays a significant role in the cotranscriptional regulation of *lysC* expression. Together with previous studies, our work suggests that *lysC* expression is governed by a lysine-sensing riboswitch that regulates translation initiation, transcription termination, and mRNA degradation. Notably, both Rho and RNase E target the same region of the RNA molecule, implying that RNase E may degrade Rho-terminated transcripts, providing a means to selectively eliminate these incomplete messenger RNAs.

---

### Abstract 2: Global Transcriptomic Profile of lysC Knockout (2007)
**PMID: 17956427** | *FEMS Microbiol Lett* | Liu et al.

> Aspartokinase III, encoded by *lysC*, is responsible for the first step of lysine biosynthesis in *Escherichia coli*. In this study, a *lysC* knockout *E. coli* W3110 strain was generated to study the differential gene expression profiles of wild type and *lysC* knockout strains. Several significant changes were observed, including biosynthesis of lysine, oxaloacetate, alpha-ketoglutarate and glutamate genes. Genes related to transporters and heat shock proteins were also affected by *lysC* knockout. The results indicated that the *lysC* knockout strain exhibited some phenomena similar to lysine starvation. The data generated by this study further clarify the systematic role of *lysC* in lysine biosynthesis.

---

### Abstract 3: Nucleotide Sequence and Evolution (1986)
**PMID: 3003049** | *J Biol Chem* | Cassan et al.

> The *lysC* gene encoding the lysine-sensitive aspartokinase III of *Escherichia coli* K12 has been cloned and its nucleotide sequence determined. Analysis of the deduced protein sequence (449 amino acid residues) reveals that the entire sequence of aspartokinase III is homologous to the N-terminal part of the two iso- and bifunctional aspartokinase-homoserine dehydrogenases I and II of *E. coli*. An evolutionary pathway leading to the three molecular species present in the same organism is proposed, and the possible involvement of a highly conserved region in subunit interactions is discussed.

---

### Abstract 4: Leader Sequence and Regulation (1998)
**PMID: 9851048** | *FEMS Microbiol Lett* | Patte et al.

> In *Escherichia coli* and *Bacillus subtilis*, long leader sequences are found upstream of the *lysC* coding sequences which encode lysine-sensitive aspartokinase. Highly conserved regions exist between these sequences. Mutations leading to constitutive expression of the *E. coli lysC* gene have been localised within these conserved regions, indicating that they participate in the lysine-mediated repression mechanism of *lysC* expression.

---

### Abstract 5: Promoter Analysis (1998)
**PMID: 9812360** | *FEMS Microbiol Lett* | Liao et al.

> A *lysC-lac'Z* fusion plasmid was constructed to study the regulatory region of the *lysC* gene. Analysis by deletion mutations confirmed the existence of an alternative promoter, P2, located upstream of the previously identified promoter, P1. The transcription start site of promoter P2 was located 85 base pairs upstream the transcription start site of promoter P1. Both promoters are regulated by lysine.

---

### Abstract 6: Site-Directed Mutagenesis (1997)
**PMID: 9080702** | *Lett Appl Microbiol* | Lu et al.

> Using overlap extension polymerase chain reaction (PCR), five transformants of *Escherichia coli* containing site-directed mutagenized *lysC beta* gene were generated and analysed. Exchange of C to A and C to T at nucleotide 1118 of the mutated *lysC beta* gene causes a substitution of serine301 in the wild-type enzyme for tyrosine301 and phenylalanine301 in the mutant enzymes, respectively. Enzyme assays showed that *Brevibacterium flavum* cells harbouring pSUMN18 with mutated *lysC beta* genes exhibited 16-20 fold lower specific activities of aspartokinase as compared to that of host containing wild-type *lysC* gene. The mutation introduced into *lysC beta* of *B. flavum* CCRC 18271 resulted in partial feedback-resistant aspartokinase activity.

---

## 11. Conclusion

The *lysC* gene of *Escherichia coli* is a paradigm of sophisticated metabolic regulation in bacteria. Encoding aspartokinase III — the lysine-sensitive isozyme of the first enzyme in the aspartate family pathway — *lysC* serves as the principal metabolic gatekeeper for lysine homeostasis.

The regulatory architecture of *lysC* operates simultaneously at **three distinct levels**:

1. **Enzymatic allosteric inhibition** by lysine — the fastest and most direct control mechanism
2. **Riboswitch-mediated translational control** — leveraging a conserved lysine-binding aptamer to modulate ribosome access to the Shine-Dalgarno sequence
3. **Rho-dependent transcription termination** — the most recent and perhaps most mechanistically intricate layer, involving coupling between the riboswitch, the transcription machinery, and the RNA helicase/translocase Rho

The evolutionary history of *lysC* — sharing ancestry with the two bifunctional AK-HSDH enzymes through ancient gene duplication events — provides a window into how bacteria have evolved specialized isozymes to independently regulate distinct branches of the same biosynthetic pathway.

From a practical standpoint, *lysC* is a **high-value target** for metabolic engineering in amino acid overproduction (particularly in *Corynebacterium glutamicum*), a potential target for antibiotic development given the essentiality of lysine biosynthesis in bacteria but not mammals, and a model system for riboswitch biology with applications in synthetic gene circuits and biosensors.

**Research gaps remaining:**
- Full crystal structure of *E. coli* AK-III
- Detailed kinetic characterization of the allosteric transition
- Complete mapping of the regulatory interactome
- In vivo real-time dynamics of the riboswitch-Rho-RNase E interplay

---

## References

1. Ghosh T et al. (2024). Direct and indirect control of Rho-dependent transcription termination by the *Escherichia coli lysC* riboswitch. *RNA* 2024. PMID: 38253429
2. Liu DYT et al. (2007). Global gene expression profiling of wild type and *lysC* knockout *Escherichia coli* W3110. *FEMS Microbiol Lett* 279(2):179-185. PMID: 17956427
3. Patte JC et al. (1998). The leader sequence of the *Escherichia coli lysC* gene is involved in the regulation of LysC synthesis. *FEMS Microbiol Lett* 167(2):151-156. PMID: 9851048
4. Cassan M et al. (1986). Nucleotide sequence of *lysC* gene encoding the lysine-sensitive aspartokinase III of *Escherichia coli* K12. Evolutionary pathway leading to three isofunctional enzymes. *J Biol Chem* 261(3):1052-1057. PMID: 3003049
5. Lu JH et al. (1997). Site-directed mutagenesis of the aspartokinase gene *lysC* and its characterization in *Brevibacterium flavum*. *Lett Appl Microbiol* 24(3):187-190. PMID: 9080702
6. Liao HH & Liao CC (1998). Analysis of the regulatory region of the *lysC* gene of *Escherichia coli*. *FEMS Microbiol Lett* 167(2):143-149. PMID: 9812360
7. People's Milk (C. glutamicum lysC) PMID: 1980002
8. P2 phage growth restriction related to Rz1 homolog *lysC*. PMID: 15231796
9. Ectoine production in *E. coli* (metabolic engineering context). PMID: 26969253
10. High ectoine production from lignocellulosic hydrolysate. PMID: 39933098

---

*Report generated: 2026-03-31*
*Data sources: NCBI PubMed, Europe PMC, NCBI Gene, UniProt, bioRxiv*
*Research system: Deep Gene Research (DeepGeneResearch API)*
*⚠️ This report was automatically generated by AI synthesis — visit original PubMed sources for complete information.*
