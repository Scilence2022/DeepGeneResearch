"use client";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  LoaderCircle,
  SquarePlus,
} from "lucide-react";
import GeneResearch from "@/components/Research/GeneResearch";
import { Button } from "@/components/Internal/Button";
import useDeepResearch from "@/hooks/useDeepResearch";
import useAiProvider from "@/hooks/useAiProvider";
import useAccurateTimer from "@/hooks/useAccurateTimer";
import { useGlobalStore } from "@/store/global";
import { useSettingStore } from "@/store/setting";
import { useTaskStore } from "@/store/task";
import { useHistoryStore } from "@/store/history";

interface TopicProps {
  urlGeneSymbol?: string;
  urlOrganism?: string;
}


function Topic({ urlGeneSymbol, urlOrganism }: TopicProps) {
  const { t } = useTranslation();
  const taskStore = useTaskStore();
  const { askQuestions } = useDeepResearch();
  const { hasApiKey } = useAiProvider();
  const {
    formattedTime,
    start: accurateTimerStart,
    stop: accurateTimerStop,
  } = useAccurateTimer();
  const [isThinking, setIsThinking] = useState<boolean>(false);

  function handleCheck(): boolean {
    const { mode } = useSettingStore.getState();
    if ((mode === "local" && hasApiKey()) || mode === "proxy") {
      return true;
    } else {
      const { setOpenSetting } = useGlobalStore.getState();
      setOpenSetting(true);
      return false;
    }
  }


  async function handleGeneResearch(config: any) {
    if (handleCheck()) {
      const { id, setQuestion } = useTaskStore.getState();
      try {
        setIsThinking(true);
        accurateTimerStart();
        
        // Create a gene research query
        let query = `Gene research: ${config.geneSymbol} in ${config.organism}`;
        if (config.researchFocus && config.researchFocus.length > 0 && !config.researchFocus.includes('general')) {
          query += ` - Focus: ${config.researchFocus.join(', ')}`;
        }
        if (config.specificAspects.length > 0) {
          query += ` - Aspects: ${config.specificAspects.join(', ')}`;
        }
        if (config.diseaseContext) {
          query += ` - Disease: ${config.diseaseContext}`;
        }
        if (config.experimentalApproach) {
          query += ` - Method: ${config.experimentalApproach}`;
        }
        
        // Add user prompt if provided
        if (config.userPrompt && config.userPrompt.trim()) {
          // Replace placeholders in user prompt
          const userPrompt = config.userPrompt
            .replace(/{geneSymbol}/g, config.geneSymbol)
            .replace(/{organism}/g, config.organism);
          query += `\n\nResearch Question:\n${userPrompt}`;
        }
        
        if (id !== "") {
          createNewResearch();
        }
        setQuestion(query);
        await askQuestions();
      } finally {
        setIsThinking(false);
        accurateTimerStop();
      }
    }
  }

  function createNewResearch() {
    const { id, backup, reset } = useTaskStore.getState();
    const { update } = useHistoryStore.getState();
    if (id) update(id, backup());
    reset();
  }

  function openKnowledgeList() {
    const { setOpenKnowledge } = useGlobalStore.getState();
    setOpenKnowledge(true);
  }



  return (
    <section className="p-4 border rounded-md mt-4 print:hidden">
      <div className="flex justify-between items-center border-b mb-2">
        <h3 className="font-semibold text-lg leading-10">
          {t("research.topic.title")}
        </h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => createNewResearch()}
            title={t("research.common.newResearch")}
          >
            <SquarePlus />
          </Button>
        </div>
      </div>
      
      <GeneResearch
        onStartResearch={handleGeneResearch}
        isResearching={isThinking}
        urlGeneSymbol={urlGeneSymbol}
        urlOrganism={urlOrganism}
      />
    </section>
  );
}

export default Topic;
