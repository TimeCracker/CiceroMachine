import type { AgentId, Config, EvidenceItem } from "../../src/types";
import { mockSearch } from "../mock";
import {
  bestUrlFromObject,
  dedupeByUrlOrTitle,
  faviconForUrl,
  firstStringValue,
  firstUsableUrl,
  flattenObject,
  parseMaybeJson,
  summarizeStructuredCard
} from "../domain/utils";
import { parseJsonResponse } from "./http";
import { extractAnthropicText, joinEndpoint, LLMService } from "./llm";

type SearchContext = {
  agent: AgentId;
  round: number;
};

type EvidenceCandidate = Omit<EvidenceItem, "id" | "retrievedAt" | "uses"> & Partial<Pick<EvidenceItem, "id" | "retrievedAt" | "uses">>;

export class SearchService {
  private bochaQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: Config,
    private readonly fetchWithTimeout: (url: string, options?: RequestInit & { debugLabel?: string }) => Promise<Response>,
    private readonly llm: LLMService,
    private readonly mockMode: boolean,
    private readonly onSoftError: (message: string) => void
  ) {}

  async searchWeb(query: string, context: SearchContext): Promise<EvidenceCandidate[]> {
    if (this.mockMode) return mockSearch(this.config, query, context);
    const provider = this.config.searchProvider;
    if (provider === "bocha") return this.searchBocha(query, context);
    if (provider === "tavily") return this.searchTavily(query, context);
    if (provider === "llm-native") return this.searchLLMNative(query, context);
    if (provider === "hybrid") {
      let bocha: EvidenceCandidate[] = [];
      try {
        bocha = await this.searchBocha(query, context);
      } catch (error) {
        this.onSoftError(`Bocha search failed for "${truncate(query, 90)}": ${formatErrorMessage(error)}`);
      }
      let native: EvidenceCandidate[] = [];
      if (this.supportsNativeSearch()) {
        try {
          native = await this.searchLLMNative(query, context);
        } catch (error) {
          this.onSoftError(`LLM native search supplement failed: ${formatErrorMessage(error)}`);
        }
      }
      return dedupeByUrlOrTitle([...bocha, ...native]);
    }
    throw new Error(`Unknown search mode: ${provider}`);
  }

  async searchBochaAI(query: string, context: SearchContext): Promise<EvidenceCandidate[]> {
    return this.runBochaRequest(async () => {
      const response = await this.fetchWithTimeout("https://api.bochaai.com/v1/ai-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.searchApiKey}`
      },
      body: JSON.stringify({
        query,
        freshness: this.config.freshness || "noLimit",
        count: Math.max(5, this.config.searchCount),
        answer: false,
        stream: false
      })
      });
      const data = await parseJsonResponse(response);
      return this.normalizeBochaAISearch(data, query, context);
    });
  }

  supportsNativeSearch() {
    return (this.config.provider === "openai" && this.config.apiFormat === "openai") ||
      (this.config.provider === "anthropic" && this.config.apiFormat === "anthropic");
  }

  private async searchBocha(query: string, context: SearchContext): Promise<EvidenceCandidate[]> {
    return this.runBochaRequest(async () => {
      const response = await this.fetchWithTimeout("https://api.bochaai.com/v1/web-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.searchApiKey}`
      },
      body: JSON.stringify({
        query,
        freshness: this.config.freshness || "noLimit",
        summary: Boolean(this.config.summary),
        count: this.config.searchCount
      })
      });
      const data = await parseJsonResponse(response);
      return getWebPageValues(data).map((item: any) => ({
        provider: "bocha",
        title: item.name || item.title || "Bocha search result",
        url: bestUrlFromObject(item),
        favicon: item.siteIcon || item.favicon || "",
        snippet: item.snippet || item.summary || "",
        summary: item.summary || "",
        publishedAt: item.datePublished || "",
        score: item.score || null,
        query,
        agent: context.agent,
        round: context.round
      }));
    });
  }

  private async searchTavily(query: string, context: SearchContext): Promise<EvidenceCandidate[]> {
    const response = await this.fetchWithTimeout("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.searchApiKey}`
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: this.config.searchCount,
        include_answer: false,
        include_raw_content: false
      })
    });
    const data = await parseJsonResponse(response);
    const values = Array.isArray(data.results) ? data.results : [];
    return values.map((item: any) => ({
      provider: "tavily",
      title: item.title || "Tavily search result",
      url: firstUsableUrl(item.url, item.link),
      favicon: item.favicon || "",
      snippet: item.content || "",
      summary: "",
      publishedAt: item.published_date || "",
      score: item.score || null,
      query,
      agent: context.agent,
      round: context.round
    }));
  }

  private async searchLLMNative(query: string, context: SearchContext): Promise<EvidenceCandidate[]> {
    if (!this.supportsNativeSearch()) {
      throw new Error("The current LLM provider does not support standard native LLM search. Use Bocha or Tavily instead.");
    }
    if (this.config.provider === "openai" && this.config.apiFormat === "openai") {
      return this.searchOpenAINative(query, context);
    }
    if (this.config.provider === "anthropic" && this.config.apiFormat === "anthropic") {
      return this.searchAnthropicNative(query, context);
    }
    throw new Error("The current configuration cannot use native LLM search.");
  }

  private async searchOpenAINative(query: string, context: SearchContext): Promise<EvidenceCandidate[]> {
    const url = joinEndpoint(this.config.baseURL, "responses");
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        instructions: "You are a search assistant. Search the web and return a concise answer while preserving source citations.",
        input: query,
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"]
      })
    });
    const data = await parseJsonResponse(response);
    const text = data.output_text || extractOpenAIResponseText(data);
    const citations = extractOpenAICitations(data);
    if (citations.length) {
      return citations.map((source) => ({
        provider: "llm-native-openai",
        title: source.title || "OpenAI Web Search",
        url: firstUsableUrl(source.url),
        favicon: faviconForUrl(source.url || ""),
        snippet: text || source.snippet || "",
        summary: "",
        publishedAt: "",
        score: null,
        query,
        agent: context.agent,
        round: context.round
      }));
    }
    return [{
      provider: "llm-native-openai",
      title: "OpenAI native search summary",
      url: "",
      favicon: "",
      snippet: text || "OpenAI native search did not return parseable sources.",
      summary: "",
      publishedAt: "",
      score: null,
      query,
      agent: context.agent,
      round: context.round
    }];
  }

  private async searchAnthropicNative(query: string, context: SearchContext): Promise<EvidenceCandidate[]> {
    const url = joinEndpoint(this.config.baseURL, "messages");
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: this.config.model,
        system: "You are a search assistant. Search the web and return a concise answer while preserving source citations.",
        messages: [{ role: "user", content: query }],
        max_tokens: 900,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }]
      })
    });
    const data = await parseJsonResponse(response);
    const text = extractAnthropicText(data);
    const citations = extractAnthropicCitations(data);
    if (citations.length) {
      return citations.map((source) => ({
        provider: "llm-native-anthropic",
        title: source.title || "Anthropic Web Search",
        url: firstUsableUrl(source.url),
        favicon: faviconForUrl(source.url || ""),
        snippet: text || source.snippet || "",
        summary: "",
        publishedAt: "",
        score: null,
        query,
        agent: context.agent,
        round: context.round
      }));
    }
    return [{
      provider: "llm-native-anthropic",
      title: "Anthropic native search summary",
      url: "",
      favicon: "",
      snippet: text || "Anthropic native search did not return parseable sources.",
      summary: "",
      publishedAt: "",
      score: null,
      query,
      agent: context.agent,
      round: context.round
    }];
  }

  private normalizeBochaAISearch(data: any, query: string, context: SearchContext) {
    const items: EvidenceCandidate[] = [];
    const messages = Array.isArray(data && data.messages)
      ? data.messages
      : (Array.isArray(data && data.data && data.data.messages) ? data.data.messages : []);

    for (const message of messages) {
      const content = parseMaybeJson(message && message.content);
      if (message && message.content_type === "webpage") {
        const pages = Array.isArray(content && content.value) ? content.value : [];
        for (const page of pages) {
          items.push({
            provider: "bocha-ai-search-webpage",
            title: page.name || page.title || "Bocha AI Search webpage result",
            url: bestUrlFromObject(page),
            favicon: page.siteIcon || page.favicon || "",
            snippet: page.snippet || page.summary || "",
            summary: page.summary || "",
            publishedAt: page.datePublished || "",
            score: page.score || null,
            query,
            agent: context.agent,
            round: context.round
          });
        }
      } else if (content && Object.keys(content).length) {
        items.push(structuredBochaCardToEvidence(content, message, query, context));
      } else if (message && message.content && message.content !== "{}" && message.content_type !== "image") {
        items.push({
          provider: "bocha-ai-search-card",
          title: "Bocha AI Search structured card",
          url: `https://bochaai.com/search?q=${encodeURIComponent(query)}`,
          favicon: faviconForUrl("https://bochaai.com"),
          snippet: String(message.content),
          summary: String(message.content),
          publishedAt: "",
          score: null,
          query,
          agent: context.agent,
          round: context.round
        });
      }
    }

    for (const page of getWebPageValues(data)) {
      items.push({
        provider: "bocha-ai-search-webpage",
        title: page.name || page.title || "Bocha AI Search webpage result",
        url: bestUrlFromObject(page),
        favicon: page.siteIcon || page.favicon || "",
        snippet: page.snippet || page.summary || "",
        summary: page.summary || "",
        publishedAt: page.datePublished || "",
        score: page.score || null,
        query,
        agent: context.agent,
        round: context.round
      });
    }
    return dedupeByUrlOrTitle(items);
  }

  private runBochaRequest<T>(task: () => Promise<T>): Promise<T> {
    const run = this.bochaQueue
      .catch(() => undefined)
      .then(async () => {
        await delay(350);
        return task();
      });
    this.bochaQueue = run.catch(() => undefined);
    return run;
  }
}

function structuredBochaCardToEvidence(content: Record<string, unknown>, message: any, query: string, context: SearchContext): EvidenceCandidate {
  const flat = flattenObject(content);
  const title =
    firstStringValue(content, ["name", "title", "stockName", "shortName", "symbol", "code"]) ||
    "Bocha AI Search structured card";
  const url = bestUrlFromObject(content) || `https://bochaai.com/search?q=${encodeURIComponent(query)}`;
  const summary = summarizeStructuredCard(flat);
  return {
    provider: "bocha-ai-search-card",
    title,
    url,
    favicon: faviconForUrl(url),
    snippet: summary,
    summary,
    publishedAt: firstStringValue(content, ["date", "time", "datetime", "updateTime", "timestamp"]) || "",
    score: null,
    query,
    agent: context.agent,
    round: context.round,
    raw: content,
    contentType: message && message.content_type
  };
}

function getWebPageValues(data: any) {
  const candidates = [
    data && data.data && data.data.webPages && data.data.webPages.value,
    data && data.webPages && data.webPages.value,
    data && data.value,
    data && data.results
  ];
  const found = candidates.find((item) => Array.isArray(item));
  return found || [];
}

function extractOpenAIResponseText(data: any) {
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (item.type === "message" && Array.isArray(item.content)) {
      const text = item.content.map((part: any) => part.text || "").join("");
      if (text) return text;
    }
  }
  return "";
}

function extractOpenAICitations(data: any) {
  const citations: Array<{ title: string; url: string; snippet: string }> = [];
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (item.type === "web_search_call" && item.action && Array.isArray(item.action.sources)) {
      for (const source of item.action.sources) {
        citations.push({ title: source.title || source.url, url: source.url, snippet: "" });
      }
    }
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        const annotations = Array.isArray(part.annotations) ? part.annotations : [];
        for (const annotation of annotations) {
          if (annotation.type === "url_citation" || annotation.url) {
            citations.push({ title: annotation.title || annotation.url, url: annotation.url, snippet: part.text || "" });
          }
        }
      }
    }
  }
  return dedupeCitations(citations);
}

function extractAnthropicCitations(data: any) {
  const citations: Array<{ title: string; url: string; snippet: string }> = [];
  const walk = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value.url) {
      citations.push({ title: value.title || value.url, url: value.url, snippet: value.text || "" });
    }
    Object.values(value).forEach(walk);
  };
  walk(data);
  return dedupeCitations(citations);
}

function dedupeCitations(items: Array<{ title: string; url: string; snippet: string }>) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = firstUsableUrl(item.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatErrorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error ? String((error as Error).message) : String(error);
}

function truncate(text: string, max: number) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
