"use client";
import dynamic from "next/dynamic";
import { useLayoutEffect, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useSearchParams } from "next/navigation";
import { useGlobalStore } from "@/store/global";
import { useSettingStore } from "@/store/setting";

const Header = dynamic(() => import("@/components/Internal/Header"), { ssr: false });
const Setting = dynamic(() => import("@/components/Setting"), { ssr: false });
const ResearchCapabilities = dynamic(() => import("@/components/Research/ResearchCapabilities"), { ssr: false });
const Topic = dynamic(() => import("@/components/Research/Topic"), { ssr: false });
const Feedback = dynamic(() => import("@/components/Research/Feedback"), { ssr: false });
const SearchResult = dynamic(
  () => import("@/components/Research/SearchResult"),
  { ssr: false }
);
const FinalReport = dynamic(() => import("@/components/Research/FinalReport"), { ssr: false });
const History = dynamic(() => import("@/components/History"), { ssr: false });
const Knowledge = dynamic(() => import("@/components/Knowledge"), { ssr: false });

function TopicWithParams() {
  const searchParams = useSearchParams();
  
  // Extract URL parameters safely
  const urlGeneSymbol = searchParams?.get('gene') || searchParams?.get('geneSymbol') || undefined;
  const urlOrganism = searchParams?.get('organism') || searchParams?.get('organismName') || undefined;
  
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
