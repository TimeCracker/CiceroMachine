import type { Config } from "../types";

type ChatMessage = {
  role: string;
  content: string;
};

type LlmOptions = {
  maxTokens?: number;
  temperature?: number;
  deepSeekThinking?: boolean;
};

export function buildOpenAICompatibleBody(
  cfg: Config,
  systemPrompt: string,
  messages: ChatMessage[],
  options: LlmOptions,
  isDeepSeek: boolean
) {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    max_tokens: options.maxTokens || cfg.maxTokens,
    temperature: typeof options.temperature === "number" ? options.temperature : cfg.temperature,
    stream: false
  };

  if (isDeepSeek) {
    body.thinking = { type: options.deepSeekThinking ? "enabled" : "disabled" };
  }

  return body;
}

export function extractOpenAICompatibleContent(data: any) {
  return extractOpenAICompatibleResult(data).content;
}

export function extractOpenAICompatibleResult(data: any) {
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  const finishReason = data && data.choices && data.choices[0] && data.choices[0].finish_reason;
  return {
    content: typeof content === "string" ? content.trim() : "",
    finishReason: typeof finishReason === "string" ? finishReason : ""
  };
}
