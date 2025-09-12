// Gene Research UI Component
// Specialized interface for gene function research

"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/Internal/Button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoaderCircle, Dna, Microscope, Activity } from "lucide-react";

interface GeneResearchProps {
  onStartResearch: (config: GeneResearchConfig) => void;
  isResearching: boolean;
}

interface GeneResearchConfig {
  geneSymbol: string;
  organism: string;
  researchFocus: string;
  specificAspects: string[];
  diseaseContext?: string;
  experimentalApproach?: string;
}

const formSchema = z.object({
  geneSymbol: z.string().min(1, "Gene symbol is required"),
  organism: z.string().min(1, "Organism is required"),
  researchFocus: z.string().min(1, "Research focus is required"),
  specificAspects: z.array(z.string()).optional(),
  diseaseContext: z.string().optional(),
  experimentalApproach: z.string().optional(),
});

const ORGANISMS = [
  { value: "Escherichia coli", label: "E. coli (Escherichia coli)" },
  { value: "Corynebacterium glutamicum", label: "C. glutamicum (Corynebacterium glutamicum)" },
  { value: "Bacillus subtilis", label: "B. subtilis (Bacillus subtilis)" },
  { value: "Homo sapiens", label: "Human (Homo sapiens)" },
  { value: "Mus musculus", label: "Mouse (Mus musculus)" },
  { value: "Rattus norvegicus", label: "Rat (Rattus norvegicus)" },
  { value: "Drosophila melanogaster", label: "Fruit fly (Drosophila melanogaster)" },
  { value: "Caenorhabditis elegans", label: "Nematode (Caenorhabditis elegans)" },
  { value: "Saccharomyces cerevisiae", label: "Yeast (Saccharomyces cerevisiae)" },
  { value: "Arabidopsis thaliana", label: "Thale cress (Arabidopsis thaliana)" },
  { value: "Danio rerio", label: "Zebrafish (Danio rerio)" },
  { value: "Xenopus laevis", label: "African clawed frog (Xenopus laevis)" }
];

const RESEARCH_FOCI = [
  { value: "general", label: "General Gene Function" },
  { value: "disease", label: "Disease Association" },
  { value: "structure", label: "Protein Structure" },
  { value: "expression", label: "Expression Analysis" },
  { value: "interaction", label: "Protein Interactions" },
  { value: "evolution", label: "Evolutionary Analysis" },
  { value: "therapeutic", label: "Therapeutic Potential" }
];

const SPECIFIC_ASPECTS = [
  { value: "mutation", label: "Mutations" },
  { value: "interaction", label: "Protein Interactions" },
  { value: "pathway", label: "Biological Pathways" },
  { value: "evolution", label: "Evolution" },
  { value: "regulation", label: "Gene Regulation" },
  { value: "expression", label: "Expression Patterns" },
  { value: "structure", label: "Protein Structure" },
  { value: "function", label: "Molecular Function" }
];

export default function GeneResearch({ onStartResearch, isResearching }: GeneResearchProps) {
  const { t } = useTranslation();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      geneSymbol: "",
      organism: "Escherichia coli",
      researchFocus: "general",
      specificAspects: [],
      diseaseContext: "",
      experimentalApproach: "",
    },
  });

  const { watch, setValue } = form;
  const specificAspects = watch("specificAspects") || [];

  const handleAspectToggle = (aspect: string) => {
    const currentAspects = specificAspects;
    const newAspects = currentAspects.includes(aspect) 
      ? currentAspects.filter(a => a !== aspect)
      : [...currentAspects, aspect];
    setValue("specificAspects", newAspects);
  };

  const handleStartResearch = (values: z.infer<typeof formSchema>) => {
    const config: GeneResearchConfig = {
      geneSymbol: values.geneSymbol.trim(),
      organism: values.organism,
      researchFocus: values.researchFocus,
      specificAspects: values.specificAspects || [],
      diseaseContext: values.diseaseContext?.trim() || undefined,
      experimentalApproach: values.experimentalApproach?.trim() || undefined
    };

    onStartResearch(config);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dna className="h-5 w-5" />
            Gene Research Configuration
          </CardTitle>
          <CardDescription>
            Configure your gene research parameters for comprehensive analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleStartResearch)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="geneSymbol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gene Symbol *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., TP53, BRCA1, MYC"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="organism"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organism *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select organism" />
                    </SelectTrigger>
                    <SelectContent>
                      {ORGANISMS.map((org) => (
                        <SelectItem key={org.value} value={org.value}>
                          {org.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="researchFocus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Research Focus</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select research focus" />
                  </SelectTrigger>
                  <SelectContent>
                    {RESEARCH_FOCI.map((focus) => (
                      <SelectItem key={focus.value} value={focus.value}>
                        {focus.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="specificAspects"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Specific Aspects (Optional)</FormLabel>
                <div className="flex flex-wrap gap-2">
                  {SPECIFIC_ASPECTS.map((aspect) => (
                    <Badge
                      key={aspect.value}
                      variant={specificAspects.includes(aspect.value) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => handleAspectToggle(aspect.value)}
                    >
                      {aspect.label}
                    </Badge>
                  ))}
                </div>
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="diseaseContext"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Disease Context (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., cancer, diabetes, Alzheimer's"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="experimentalApproach"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Experimental Approach (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., CRISPR, RNA-seq, ChIP-seq"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <Button
            type="submit"
            disabled={isResearching}
            className="w-full"
          >
            {isResearching ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Conducting Gene Research...
              </>
            ) : (
              <>
                <Microscope className="mr-2 h-4 w-4" />
                Start Gene Research
              </>
            )}
          </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Research Capabilities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">Molecular Function</h4>
              <p className="text-sm text-muted-foreground">
                Catalytic activity, binding sites, enzyme classification
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Protein Structure</h4>
              <p className="text-sm text-muted-foreground">
                Domains, motifs, 3D structure, post-translational modifications
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Expression Analysis</h4>
              <p className="text-sm text-muted-foreground">
                Tissue specificity, developmental patterns, regulation
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Protein Interactions</h4>
              <p className="text-sm text-muted-foreground">
                Protein-protein, DNA/RNA binding, small molecule interactions
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Disease Associations</h4>
              <p className="text-sm text-muted-foreground">
                Mutations, phenotypes, therapeutic potential
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Evolutionary Analysis</h4>
              <p className="text-sm text-muted-foreground">
                Orthologs, paralogs, conservation, gene family
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
