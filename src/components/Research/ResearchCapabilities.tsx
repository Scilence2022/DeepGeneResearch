// Research Capabilities Component
// Displays the capabilities overview for gene research

"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

export default function ResearchCapabilities() {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Research Capabilities
        </CardTitle>
        <CardDescription>
          Comprehensive gene research capabilities powered by advanced AI and biological databases
        </CardDescription>
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
  );
}
