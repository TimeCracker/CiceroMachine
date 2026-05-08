import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config";
import { buildOpenAICompatibleBody, extractOpenAICompatibleContent, extractOpenAICompatibleResult } from "./llm";

describe("OpenAI-compatible LLM body", () => {
  it("adds DeepSeek thinking without non-official reasoning effort field", () => {
    const deprecatedField = ["reasoning", "effort"].join("_");
    const body = buildOpenAICompatibleBody(
      DEFAULT_CONFIG,
      "system",
      [{ role: "user", content: "hello" }],
      { deepSeekThinking: true, maxTokens: 1800, temperature: 0.3 },
      true
    );

    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      max_tokens: 1800,
      temperature: 0.3,
      thinking: { type: "enabled" }
    });
    expect(body).not.toHaveProperty(deprecatedField);
  });

  it("extracts assistant content from chat completions", () => {
    const data = {
      choices: [{ message: { content: "  ok  " }, finish_reason: "length" }]
    };
    const content = extractOpenAICompatibleContent(data);
    const result = extractOpenAICompatibleResult(data);
    expect(content).toBe("ok");
    expect(result).toEqual({
      content: "ok",
      finishReason: "length"
    });
  });
});
