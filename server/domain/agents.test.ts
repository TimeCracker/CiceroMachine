import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config";
import { AgentRuntime, buildDebaterSystemPrompt, buildModeratorSystemPrompt } from "./agents";
import { EvidenceRegistry } from "./evidenceRegistry";
import { sourceLanguageBucket, topicLanguageCode, topicLanguageInstruction } from "./utils";

describe("AgentRuntime", () => {
  it("treats a search provider 429 as a per-query warning instead of aborting the debate", async () => {
    const warnings: string[] = [];
    const registry = new EvidenceRegistry();
    const agent = new AgentRuntime("A", "pro", {
      ...DEFAULT_CONFIG,
      topic: "Should AI agents improve research workflows?",
      queriesPerAgent: 1,
      searchCount: 1
    }, {
      llm: {} as any,
      search: {
        searchWeb: async () => {
          throw new Error('API request · api.bochaai.com · HTTP 429 : {"message":"You have reached the request limit"}');
        }
      } as any,
      finance: {
        gather: async () => []
      } as any,
      registry,
      emitEvidence: () => {},
      warn: (message) => warnings.push(message),
      checkpoint: async () => {},
      assertActive: () => {}
    }, true);

    const evidence = await agent.gatherEvidence(1, "", {
      topic: "Should AI agents improve research workflows?",
      messages: [],
      evidence: [],
      guidance: [],
      moderatorGuidance: []
    });

    expect(evidence).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("search skipped");
    expect(agent.searchLog.every((entry) => entry.evidenceIds.length === 0)).toBe(true);
  });

  it("instructs agents to answer in the topic language instead of hard-coded English", () => {
    const topic = "泡泡玛特股价当前是否已跌到位？";
    expect(topicLanguageCode(topic)).toBe("zh-Hans");

    const debaterPrompt = buildDebaterSystemPrompt("A", topic);
    const moderatorPrompt = buildModeratorSystemPrompt(topic);

    expect(topicLanguageInstruction(topic)).toContain("Simplified Chinese");
    expect(debaterPrompt).toContain("Output language: Simplified Chinese");
    expect(moderatorPrompt).toContain("Output language: Simplified Chinese");
    expect(debaterPrompt).not.toContain("Answer in English");
  });

  it("mixes local-language and English-source search queries for Chinese topics", async () => {
    const registry = new EvidenceRegistry();
    const agent = new AgentRuntime("A", "pro", {
      ...DEFAULT_CONFIG,
      topic: "泡泡玛特股价当前是否已跌到位？",
      queriesPerAgent: 1,
      searchCount: 2
    }, {
      llm: {} as any,
      search: {
        searchWeb: async () => []
      } as any,
      finance: {
        gather: async () => []
      } as any,
      registry,
      emitEvidence: () => {},
      warn: () => {},
      checkpoint: async () => {},
      assertActive: () => {}
    }, true);

    await agent.gatherEvidence(1, "", {
      topic: "泡泡玛特股价当前是否已跌到位？",
      messages: [],
      evidence: [],
      guidance: [],
      moderatorGuidance: []
    });

    const queries = agent.searchLog.map((entry) => entry.query).join("\n");
    expect(queries).toContain("正方");
    expect(queries).toContain("English-language sources");
  });

  it("classifies common Chinese and English source domains for balancing", () => {
    expect(sourceLanguageBucket({ url: "https://finance.yahoo.com/quote/9988.HK", title: "Alibaba delayed quote" })).toBe("en");
    expect(sourceLanguageBucket({ url: "https://finance.eastmoney.com/a/20260508.html", title: "东方财富 研报" })).toBe("zh");
  });
});
