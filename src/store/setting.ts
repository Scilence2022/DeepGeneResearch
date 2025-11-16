import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SettingStore {
  provider: string;
  mode: string;
  apiKey: string;
  apiProxy: string;
  googleVertexProject: string;
  googleVertexLocation: string;
  googleClientEmail: string;
  googlePrivateKey: string;
  googlePrivateKeyId: string;
  googleVertexThinkingModel: string;
  googleVertexNetworkingModel: string;
  openRouterApiKey: string;
  openRouterApiProxy: string;
  openRouterThinkingModel: string;
  openRouterNetworkingModel: string;
  openAIApiKey: string;
  openAIApiProxy: string;
  openAIThinkingModel: string;
  openAINetworkingModel: string;
  anthropicApiKey: string;
  anthropicApiProxy: string;
  anthropicThinkingModel: string;
  anthropicNetworkingModel: string;
  deepseekApiKey: string;
  deepseekApiProxy: string;
  deepseekThinkingModel: string;
  deepseekNetworkingModel: string;
  xAIApiKey: string;
  xAIApiProxy: string;
  xAIThinkingModel: string;
  xAINetworkingModel: string;
  mistralApiKey: string;
  mistralApiProxy: string;
  mistralThinkingModel: string;
  mistralNetworkingModel: string;
  siliconflowApiKey: string;
  siliconflowApiProxy: string;
  siliconflowThinkingModel: string;
  siliconflowNetworkingModel: string;
  azureApiKey: string;
  azureResourceName: string;
  azureApiVersion: string;
  azureThinkingModel: string;
  azureNetworkingModel: string;
  openAICompatibleApiKey: string;
  openAICompatibleApiProxy: string;
  openAICompatibleThinkingModel: string;
  openAICompatibleNetworkingModel: string;
  pollinationsApiProxy: string;
  pollinationsThinkingModel: string;
  pollinationsNetworkingModel: string;
  ollamaApiProxy: string;
  ollamaThinkingModel: string;
  ollamaNetworkingModel: string;
  accessPassword: string;
  thinkingModel: string;
  networkingModel: string;
  enableSearch: string;
  searchProvider: string;
  tavilyApiKey: string;
  tavilyApiProxy: string;
  tavilyScope: string;
  firecrawlApiKey: string;
  firecrawlApiProxy: string;
  exaApiKey: string;
  exaApiProxy: string;
  exaScope: string;
  bochaApiKey: string;
  bochaApiProxy: string;
  searxngApiProxy: string;
  searxngScope: string;
  parallelSearch: number;
  searchMaxResult: number;
  crawler: string;
  language: string;
  theme: string;
  debug: "enable" | "disable";
  references: "enable" | "disable";
  citationImage: "enable" | "disable";
  smoothTextStreamType: "character" | "word" | "line";
  onlyUseLocalResource: "enable" | "disable";
  settingsVersion: number;  // Track settings schema version for migrations
}

interface SettingActions {
  update: (values: Partial<SettingStore>) => void;
  reset: () => void;
  migrate: () => void;  // Migrate settings from old versions
}

export const defaultValues: SettingStore = {
  provider: "google",
  mode: "",
  apiKey: "",
  apiProxy: "",
  thinkingModel: "gemini-2.0-flash-thinking-exp",
  networkingModel: "gemini-2.0-flash",
  googleVertexProject: "",
  googleVertexLocation: "",
  googleClientEmail: "",
  googlePrivateKey: "",
  googlePrivateKeyId: "",
  googleVertexThinkingModel: "",
  googleVertexNetworkingModel: "",
  openRouterApiKey: "",
  openRouterApiProxy: "",
  openRouterThinkingModel: "",
  openRouterNetworkingModel: "",
  openAIApiKey: "",
  openAIApiProxy: "",
  openAIThinkingModel: "gpt-4o",
  openAINetworkingModel: "gpt-4o-mini",
  anthropicApiKey: "",
  anthropicApiProxy: "",
  anthropicThinkingModel: "",
  anthropicNetworkingModel: "",
  deepseekApiKey: "",
  deepseekApiProxy: "",
  deepseekThinkingModel: "deepseek-reasoner",
  deepseekNetworkingModel: "deepseek-chat",
  xAIApiKey: "",
  xAIApiProxy: "",
  xAIThinkingModel: "",
  xAINetworkingModel: "",
  mistralApiKey: "",
  mistralApiProxy: "",
  mistralThinkingModel: "mistral-large-latest",
  mistralNetworkingModel: "mistral-medium-latest",
  siliconflowApiKey: "",
  siliconflowApiProxy: "",
  siliconflowThinkingModel: "",
  siliconflowNetworkingModel: "",
  azureApiKey: "",
  azureResourceName: "",
  azureApiVersion: "",
  azureThinkingModel: "",
  azureNetworkingModel: "",
  openAICompatibleApiKey: "",
  openAICompatibleApiProxy: "",
  openAICompatibleThinkingModel: "",
  openAICompatibleNetworkingModel: "",
  pollinationsApiProxy: "",
  pollinationsThinkingModel: "",
  pollinationsNetworkingModel: "",
  ollamaApiProxy: "",
  ollamaThinkingModel: "",
  ollamaNetworkingModel: "",
  accessPassword: "",
  enableSearch: "1",
  searchProvider: "searxng",  // Use SearXNG with PubMed priority for biological research
  tavilyApiKey: "",
  tavilyApiProxy: "",
  tavilyScope: "general",
  firecrawlApiKey: "",
  firecrawlApiProxy: "",
  exaApiKey: "",
  exaApiProxy: "",
  exaScope: "research paper",
  bochaApiKey: "",
  bochaApiProxy: "",
  searxngApiProxy: "https://searx.be",  // Public SearXNG instance
  searxngScope: "academic",  // Academic scope for biological/scientific queries
  parallelSearch: 1,
  searchMaxResult: 5,
  crawler: "jina",
  language: "en-US",
  theme: "system",
  debug: "disable",
  references: "enable",
  citationImage: "enable",
  smoothTextStreamType: "word",
  onlyUseLocalResource: "disable",
  settingsVersion: 2,  // Version 2: Changed searchProvider from 'model' to 'searxng'
};

export const useSettingStore = create(
  persist<SettingStore & SettingActions>(
    (set, get) => ({
      ...defaultValues,
      update: (values) => set(values),
      reset: () => set(defaultValues),
      migrate: () => {
        const currentVersion = get().settingsVersion || 0;
        
        // Migration from version 0 or 1 to version 2
        // Key change: searchProvider from 'model' to 'searxng' for real database searches
        if (currentVersion < 2) {
          const currentProvider = get().searchProvider;
          
          // Only migrate if user hasn't explicitly changed from default 'model'
          // or if it's still 'model' (which was the old default)
          if (currentProvider === 'model' || !currentProvider) {
            console.log('[Settings Migration] Upgrading searchProvider from "model" to "searxng" for real database searches');
            set({
              searchProvider: 'searxng',
              searxngApiProxy: defaultValues.searxngApiProxy,
              searxngScope: 'academic',
              settingsVersion: 2,
            });
          } else {
            // User has custom provider, just update version
            set({ settingsVersion: 2 });
          }
        }
      },
    }),
    { name: "setting" }
  )
);
