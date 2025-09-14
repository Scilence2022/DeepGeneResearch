// Gene Research UI Component
// Specialized interface for gene function research

"use client";
import { useState, useRef, useEffect } from "react";
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
import { LoaderCircle, Dna, Microscope, FilePlus, BookText, Paperclip, Link } from "lucide-react";
import ResourceList from "@/components/Knowledge/ResourceList";
import Crawler from "@/components/Knowledge/Crawler";
import Knowledge from "@/components/Knowledge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useKnowledge from "@/hooks/useKnowledge";
import { useTaskStore } from "@/store/task";

const DEFAULT_USER_PROMPT = "What is the function, structure, and biological role of the gene {geneSymbol} in {organism}? Include information about its pathway, regulation, cofactors, substrates, products, and any recent research findings.";

interface GeneResearchProps {
  onStartResearch: (config: GeneResearchConfig) => void;
  isResearching: boolean;
  urlGeneSymbol?: string;
  urlOrganism?: string;
}

interface GeneResearchConfig {
  geneSymbol: string;
  organism: string;
  researchFocus: string[];
  specificAspects: string[];
  diseaseContext?: string;
  experimentalApproach?: string;
  userPrompt?: string;
}

const formSchema = z.object({
  geneSymbol: z.string().min(1, "Gene symbol is required"),
  organism: z.string().min(1, "Organism is required"),
  researchFocus: z.array(z.string()).min(1, "At least one research focus is required"),
  specificAspects: z.array(z.string()).optional(),
  diseaseContext: z.string().optional(),
  experimentalApproach: z.string().optional(),
  userPrompt: z.string().optional(),
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

export default function GeneResearch({ onStartResearch, isResearching, urlGeneSymbol, urlOrganism }: GeneResearchProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taskStore = useTaskStore();
  const [openCrawler, setOpenCrawler] = useState(false);
  const [openKnowledge, setOpenKnowledge] = useState(false);
  const [isCustomOrganism, setIsCustomOrganism] = useState(false);
  const { generateId } = useKnowledge();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      geneSymbol: urlGeneSymbol || "",
      organism: urlOrganism || "Escherichia coli",
      researchFocus: ["general"],
      specificAspects: [],
      diseaseContext: "",
      experimentalApproach: "",
      userPrompt: DEFAULT_USER_PROMPT,
    },
  });

  const { watch, setValue } = form;
  const specificAspects = watch("specificAspects") || [];
  const researchFocus = watch("researchFocus") || [];

  // Update form when URL parameters change
  useEffect(() => {
    if (urlGeneSymbol) {
      setValue("geneSymbol", urlGeneSymbol);
    }
    if (urlOrganism) {
      // Check if it's a predefined organism
      const isValidOrganism = ORGANISMS.some(org => org.value === urlOrganism);
      if (isValidOrganism) {
        setValue("organism", urlOrganism);
        setIsCustomOrganism(false);
      } else {
        // Treat as custom organism
        setValue("organism", urlOrganism);
        setIsCustomOrganism(true);
      }
    }
  }, [urlGeneSymbol, urlOrganism, setValue]);

  const handleAspectToggle = (aspect: string) => {
    const currentAspects = specificAspects;
    const newAspects = currentAspects.includes(aspect) 
      ? currentAspects.filter(a => a !== aspect)
      : [...currentAspects, aspect];
    setValue("specificAspects", newAspects);
  };

  const handleResearchFocusToggle = (focus: string) => {
    const currentFocuses = researchFocus;
    const newFocuses = currentFocuses.includes(focus) 
      ? currentFocuses.filter(f => f !== focus)
      : [...currentFocuses, focus];
    setValue("researchFocus", newFocuses);
  };

  const handleOrganismChange = (value: string) => {
    setIsCustomOrganism(false);
    setValue("organism", value);
  };

  const handleCustomOrganismClick = () => {
    setIsCustomOrganism(true);
    setValue("organism", "");
  };

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      taskStore.addResource({
        id: generateId("file", { fileMeta: { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified } }),
        type: "file",
        name: file.name,
        size: file.size,
        status: "unprocessed",
      });
    });
  };

  const handleStartResearch = (values: z.infer<typeof formSchema>) => {
    const config: GeneResearchConfig = {
      geneSymbol: values.geneSymbol.trim(),
      organism: values.organism,
      researchFocus: values.researchFocus,
      specificAspects: values.specificAspects || [],
      diseaseContext: values.diseaseContext?.trim() || undefined,
      experimentalApproach: values.experimentalApproach?.trim() || undefined,
      userPrompt: values.userPrompt?.trim() || undefined
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
                  {isCustomOrganism ? (
                    <div className="space-y-2">
                      <FormControl>
                        <Input
                          placeholder="Enter custom organism name"
                          {...field}
                        />
                      </FormControl>
                      <div className="text-sm text-muted-foreground">
                        Enter the scientific name of the organism (e.g., "Homo sapiens", "Escherichia coli")
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsCustomOrganism(false);
                          setValue("organism", "Escherichia coli");
                        }}
                      >
                        Use predefined organism
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Select onValueChange={handleOrganismChange} value={field.value}>
                        <SelectTrigger className="flex-1">
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
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCustomOrganismClick}
                        className="whitespace-nowrap"
                      >
                        Custom
                      </Button>
                    </div>
                  )}
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="researchFocus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Research Focus *</FormLabel>
                <div className="flex flex-wrap gap-2">
                  {RESEARCH_FOCI.map((focus) => (
                    <Badge
                      key={focus.value}
                      variant={researchFocus.includes(focus.value) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => handleResearchFocusToggle(focus.value)}
                    >
                      {focus.label}
                    </Badge>
                  ))}
                </div>
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

          <FormField
            control={form.control}
            name="userPrompt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Research Question (Required)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Enter your specific research question about the gene..."
                    className="min-h-[120px]"
                    {...field}
                  />
                </FormControl>
                <div className="text-sm text-muted-foreground">
                  Define the specific research question you want to investigate. Use {`{geneSymbol}`} and {`{organism}`} as placeholders that will be automatically replaced. The system will automatically apply comprehensive gene research guidelines from the built-in prompts.
                </div>
              </FormItem>
            )}
          />

          {/* Local Research Resources Section */}
          <FormItem className="mt-4">
            <FormLabel className="mb-2 text-base font-semibold">
              {t("knowledge.localResourceTitle")}
            </FormLabel>
            <FormControl onSubmit={(ev) => ev.stopPropagation()}>
              <div>
                {taskStore.resources.length > 0 ? (
                  <ResourceList
                    className="pb-2 mb-2 border-b"
                    resources={taskStore.resources}
                    onRemove={taskStore.removeResource}
                  />
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="inline-flex border p-2 rounded-md text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
                      <FilePlus className="w-5 h-5" />
                      <span className="ml-1">{t("knowledge.addResource")}</span>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setOpenKnowledge(true)}>
                      <BookText />
                      <span>{t("knowledge.knowledge")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip />
                      <span>{t("knowledge.localFile")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setOpenCrawler(true)}
                    >
                      <Link />
                      <span>{t("knowledge.webCrawler")}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </FormControl>
          </FormItem>

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

      {/* Hidden file input and crawler */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(ev) => handleFileUpload(ev.target.files)}
      />
      <Crawler
        open={openCrawler}
        onClose={() => setOpenCrawler(false)}
      />
      <Knowledge
        open={openKnowledge}
        onClose={() => setOpenKnowledge(false)}
      />
    </div>
  );
}
