"use client";
import dynamic from "next/dynamic";
import { useLayoutEffect, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useSearchParams } from "next/navigation";
import { useGlobalStore } from "@/store/global";
import { useSettingStore } from "@/store/setting";

const Header = dynamic(() => import("@/components/Internal/Header"));
const Setting = dynamic(() => import("@/components/Setting"));
const ResearchCapabilities = dynamic(() => import("@/components/Research/ResearchCapabilities"));
const Topic = dynamic(() => import("@/components/Research/Topic"));
const Feedback = dynamic(() => import("@/components/Research/Feedback"));
const SearchResult = dynamic(
  () => import("@/components/Research/SearchResult")
);
const FinalReport = dynamic(() => import("@/components/Research/FinalReport"));
const History = dynamic(() => import("@/components/History"));
const Knowledge = dynamic(() => import("@/components/Knowledge"));

function TopicWithParams() {
  const searchParams = useSearchParams();
  
  // Extract URL parameters
  const urlGeneSymbol = searchParams.get('gene') || searchParams.get('geneSymbol') || undefined;
  const urlOrganism = searchParams.get('organism') || searchParams.get('organismName') || undefined;
  
  return (
    <Topic 
      urlGeneSymbol={urlGeneSymbol}
      urlOrganism={urlOrganism}
    />
  );
}

function Home() {
  const { t } = useTranslation();
  const {
    openSetting,
    setOpenSetting,
    openHistory,
    setOpenHistory,
    openKnowledge,
    setOpenKnowledge,
  } = useGlobalStore();

  const { theme } = useSettingStore();
  const { setTheme } = useTheme();

  useLayoutEffect(() => {
    const settingStore = useSettingStore.getState();
    setTheme(settingStore.theme);
  }, [theme, setTheme]);
  return (
    <div className="max-lg:max-w-screen-md max-w-screen-lg mx-auto px-4">
      <Header />
      <ResearchCapabilities />
      <main>
        <Suspense fallback={<div>Loading...</div>}>
          <TopicWithParams />
        </Suspense>
        <Feedback />
        <SearchResult />
        <FinalReport />
      </main>
      <footer className="my-4 text-center text-sm text-gray-600 print:hidden">
        <a href="https://github.com/Scilence2022/DeepGeneResearch" target="_blank">
          {t("copyright", {
            name: "CodeXomics",
          })}
        </a>
      </footer>
      <aside className="print:hidden">
        <Setting open={openSetting} onClose={() => setOpenSetting(false)} />
        <History open={openHistory} onClose={() => setOpenHistory(false)} />
        <Knowledge
          open={openKnowledge}
          onClose={() => setOpenKnowledge(false)}
        />
      </aside>
    </div>
  );
}

export default Home;
