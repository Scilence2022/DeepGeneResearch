import DeepResearch from "@/utils/deep-research";
import { getCustomModelList, multiApiKeyPolling } from "@/utils/model";
import {
  getAIProviderBaseURL,
  getAIProviderApiKey,
  getSearchProviderBaseURL,
  getSearchProviderApiKey,
} from "@/app/api/utils";

const AI_PROVIDER = process.env.MCP_AI_PROVIDER || "";
const SEARCH_PROVIDER = process.env.MCP_SEARCH_PROVIDER || "model";
const THINKING_MODEL = process.env.MCP_THINKING_MODEL || "";
const TASK_MODEL = process.env.MCP_TASK_MODEL || "";

export function initDeepResearchServer({
  language, maxResult, provider = AI_PROVIDER, searchProvider = SEARCH_PROVIDER,
  thinkingModel = THINKING_MODEL, taskModel = TASK_MODEL,
}: {
  language?: string;
  maxResult?: number;
  provider?: string;
  searchProvider?: string;
  thinkingModel?: string;
  taskModel?: string;
}) {
  const list = (value?: string) => value?.split(',').map(entry => entry.trim()).filter(Boolean) ?? [];
  if (list(process.env.NEXT_PUBLIC_DISABLED_AI_PROVIDER).includes(provider)
    || list(process.env.NEXT_PUBLIC_DISABLED_SEARCH_PROVIDER).includes(searchProvider)) {
    throw new Error('The configured research provider is disabled');
  }
  const { availableModelList, disabledModelList } = getCustomModelList(list(process.env.NEXT_PUBLIC_MODEL_LIST));
  if ([thinkingModel, taskModel].some(model => !availableModelList.includes(model)
    && (disabledModelList.includes('all') || disabledModelList.includes(model)))) {
    throw new Error('The configured research model is disabled');
  }

  return new DeepResearch({
    language,
    AIProvider: {
      baseURL: getAIProviderBaseURL(provider),
      apiKey: multiApiKeyPolling(getAIProviderApiKey(provider)),
      provider,
      thinkingModel,
      taskModel,
    },
    searchProvider: {
      baseURL: getSearchProviderBaseURL(searchProvider),
      apiKey: multiApiKeyPolling(getSearchProviderApiKey(searchProvider)),
      provider: searchProvider,
      maxResult,
      scope: process.env.MCP_SEARXNG_SCOPE || undefined,
    },
  });
}
