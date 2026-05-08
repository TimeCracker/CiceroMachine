import type { Config } from "../../src/types";
import { buildOpenAICompatibleBody, extractOpenAICompatibleResult } from "../../src/domain/llm";
import { mockLLM } from "../mock";
import { parseJsonResponse } from "./http";

export type LLMMessage = { role: string; content: string };

export type LLMCallOptions = {
  maxTokens?: number;
  temperature?: number;
  deepSeekThinking?: boolean;
  debugLabel?: string;
};

export type LLMResult = {
  content: string;
  finishReason: string;
};

export class LLMService {
  constructor(
    private readonly config: Config,
    private readonly fetchWithTimeout: (url: string, options?: RequestInit & { debugLabel?: string }) => Promise<Response>,
    private readonly mockMode: boolean
  ) {}

  async call(systemPrompt: string, messages: LLMMessage[], options: LLMCallOptions = {}) {
    const result = await this.callResult(systemPrompt, messages, options);
    return result.content;
  }

  async callResult(systemPrompt: string, messages: LLMMessage[], options: LLMCallOptions = {}): Promise<LLMResult> {
    if (this.mockMode) {
      return {
        content: await mockLLM(this.config, systemPrompt, messages),
        finishReason: "stop"
      };
    }
    if (this.config.apiFormat === "anthropic") {
      return this.callAnthropic(systemPrompt, messages, options);
    }
    return this.callOpenAICompatible(systemPrompt, messages, options);
  }

  private async callOpenAICompatible(systemPrompt: string, messages: LLMMessage[], options: LLMCallOptions) {
    const url = joinEndpoint(this.config.baseURL, "chat/completions");
    const body = buildOpenAICompatibleBody(this.config, systemPrompt, messages, options, this.isDeepSeekConfig());

    const response = await this.fetchWithTimeout(url, {
      debugLabel: options.debugLabel || "LLM OpenAI-compatible",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    const data = await parseJsonResponse(response);
    const result = extractOpenAICompatibleResult(data);
    if (!result.content) {
      throw new Error("LLM response is missing choices[0].message.content.");
    }
    return result;
  }

  private async callAnthropic(systemPrompt: string, messages: LLMMessage[], options: LLMCallOptions) {
    const url = joinEndpoint(this.config.baseURL, "messages");
    const response = await this.fetchWithTimeout(url, {
      debugLabel: options.debugLabel || "LLM Anthropic",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: this.config.model,
        system: systemPrompt,
        messages,
        max_tokens: options.maxTokens || this.config.maxTokens,
        temperature: typeof options.temperature === "number" ? options.temperature : this.config.temperature
      })
    });

    const data = await parseJsonResponse(response);
    const text = extractAnthropicText(data);
    if (!text) {
      throw new Error("Anthropic response is missing content[0].text.");
    }
    return {
      content: text.trim(),
      finishReason: typeof data.stop_reason === "string" ? data.stop_reason : ""
    };
  }

  private isDeepSeekConfig() {
    return this.config.provider === "deepseek" || /api\.deepseek\.com/i.test(this.config.baseURL);
  }
}

export function joinEndpoint(baseURL: string, endpoint: string) {
  const base = String(baseURL || "").replace(/\/+$/, "");
  const cleanEndpoint = String(endpoint || "").replace(/^\/+/, "");
  return `${base}/${cleanEndpoint}`;
}

export function extractAnthropicText(data: any) {
  if (!data || !Array.isArray(data.content)) return "";
  return data.content.map((part: any) => part.text || "").filter(Boolean).join("\n");
}
