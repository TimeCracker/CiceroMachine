import type { Config, ProviderPreset } from "./types";

export const STORE_KEY = "networked_debate_config_v1";

export const PROVIDERS: Record<string, ProviderPreset> = {
  openai: {
    label: "OpenAI",
    apiFormat: "openai",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-5-mini"]
  },
  anthropic: {
    label: "Anthropic",
    apiFormat: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514",
    models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-3-7-sonnet-20250219"]
  },
  deepseek: {
    label: "DeepSeek",
    apiFormat: "openai",
    baseURL: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat (deprecated 2026-07-24)", "deepseek-reasoner (deprecated 2026-07-24)"]
  },
  qwen: {
    label: "Qwen / DashScope",
    apiFormat: "openai",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    models: ["qwen-plus", "qwen-max", "qwen-turbo"]
  },
  moonshot: {
    label: "Moonshot / Kimi",
    apiFormat: "openai",
    baseURL: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-auto",
    models: ["moonshot-v1-auto", "moonshot-v1-8k", "moonshot-v1-32k"]
  },
  glm: {
    label: "Zhipu GLM",
    apiFormat: "openai",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    models: ["glm-4-flash", "glm-4-plus", "glm-4-air"]
  },
  doubao: {
    label: "Doubao / Volcengine",
    apiFormat: "openai",
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    model: "",
    models: ["Enter endpoint id"]
  },
  siliconflow: {
    label: "SiliconFlow",
    apiFormat: "openai",
    baseURL: "https://api.siliconflow.cn/v1",
    model: "deepseek-ai/DeepSeek-V3",
    models: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct"]
  },
  openrouter: {
    label: "OpenRouter",
    apiFormat: "openai",
    baseURL: "https://openrouter.ai/api/v1",
    model: "deepseek/deepseek-chat",
    models: ["deepseek/deepseek-chat", "openai/gpt-4o", "anthropic/claude-3.5-sonnet"]
  },
  custom: {
    label: "Custom",
    apiFormat: "openai",
    baseURL: "",
    model: "",
    models: []
  }
};

export const DEFAULT_CONFIG: Config = {
  provider: "deepseek",
  apiFormat: "openai",
  baseURL: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-v4-flash",
  maxTokens: 1400,
  temperature: 0.65,
  timeoutSeconds: 60,
  deepSeekFinalThinking: true,
  searchProvider: "bocha",
  searchApiKey: "",
  searchCount: 5,
  freshness: "noLimit",
  summary: true,
  queriesPerAgent: 2,
  rounds: 3,
  topic: ""
};
