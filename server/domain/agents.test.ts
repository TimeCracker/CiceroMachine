import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config";
import { AgentRuntime, buildDebaterSystemPrompt, buildModeratorSystemPrompt, estimateReplyLengthUnits } from "./agents";
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

  it("falls back to local search queries when LLM search planning fails", async () => {
    const warnings: string[] = [];
    const queries: string[] = [];
    const registry = new EvidenceRegistry();
    const agent = new AgentRuntime("A", "pro", {
      ...DEFAULT_CONFIG,
      topic: "Should AI agents improve research workflows?",
      queriesPerAgent: 1,
      searchCount: 1
    }, {
      llm: {
        call: async () => {
          throw new Error("Pro Agent A search planning · api.deepseek.com · Network error: fetch failed");
        }
      } as any,
      search: {
        searchWeb: async (query: string) => {
          queries.push(query);
          return [];
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
    }, false);

    const evidence = await agent.gatherEvidence(1, "", {
      topic: "Should AI agents improve research workflows?",
      messages: [],
      evidence: [],
      guidance: [],
      moderatorGuidance: []
    });

    expect(evidence).toEqual([]);
    expect(warnings.some((message) => message.includes("search planning failed"))).toBe(true);
    expect(queries.length).toBeGreaterThan(0);
    expect(agent.searchLog.length).toBeGreaterThan(0);
  });

  it("instructs agents to answer in the topic language instead of hard-coded English", () => {
    const topic = "泡泡玛特股价当前是否已跌到位？";
    expect(topicLanguageCode(topic)).toBe("zh-Hans");

    const debaterPrompt = buildDebaterSystemPrompt("A", topic);
    const moderatorPrompt = buildModeratorSystemPrompt(topic);

    expect(topicLanguageInstruction(topic)).toContain("Simplified Chinese");
    expect(debaterPrompt).toContain("Output language: Simplified Chinese");
    expect(moderatorPrompt).toContain("Output language: Simplified Chinese");
    expect(debaterPrompt).toContain("Steel-man requirement");
    expect(debaterPrompt).toContain("Concession requirement");
    expect(moderatorPrompt).toContain("(b) Logic audit");
    expect(moderatorPrompt).toContain("(c) Blind spot");
    expect(debaterPrompt).not.toContain("Answer in English");
  });

  it("switches the final debater round from attack to convergence", async () => {
    const calls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    const registry = new EvidenceRegistry();
    const agent = new AgentRuntime("A", "pro", {
      ...DEFAULT_CONFIG,
      topic: "Should AI agents improve research workflows?",
      rounds: 3,
      responseWordLimitEnabled: true,
      responseWordLimit: 180
    }, {
      llm: {
        call: async (_systemPrompt: string, messages: Array<{ role: string; content: string }>) => {
          calls.push({ messages: messages.map((message) => ({ ...message })) });
          return [
            "Brief response: the opponent correctly emphasizes risk boundaries.",
            "Based on [S1] and [S2], the data and evidence report show benefits, costs, risk boundaries, stakeholder effects for users, long-term trend uncertainty, and execution feasibility.",
            "The opponent's position is correct under conditions where R exceeds B-C.",
            "My position holds when B persistently exceeds C+R.",
            "I concede that the opponent is right that execution cost can defeat the pro case when it cannot be measured."
          ].join("\n")
        }
      } as any,
      search: {} as any,
      finance: {} as any,
      registry,
      emitEvidence: () => {},
      warn: () => {},
      checkpoint: async () => {},
      assertActive: () => {}
    }, false);
    const evidence = [
      { id: "S1", title: "Source one", provider: "mock", url: "https://example.org/1", summary: "Evidence one" },
      { id: "S2", title: "Source two", provider: "mock", url: "https://example.org/2", summary: "Evidence two" }
    ] as any;

    await agent.speak(3, evidence, "The con side says risk dominates.", {
      topic: "Should AI agents improve research workflows?",
      messages: [],
      evidence,
      guidance: [],
      moderatorGuidance: []
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].messages[calls[0].messages.length - 1].content).toContain("FINAL ROUND - CONVERGENCE TASK");
    expect(calls[0].messages[calls[0].messages.length - 1].content).toContain("boundary-mapping");
    expect(calls[0].messages[calls[0].messages.length - 1].content).toContain("maximum 180 words/CJK characters");
  });

  it("compresses one whole debater response when it exceeds the configured reply limit", async () => {
    const calls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    const registry = new EvidenceRegistry();
    const agent = new AgentRuntime("A", "pro", {
      ...DEFAULT_CONFIG,
      topic: "Should AI agents improve research workflows?",
      rounds: 1,
      responseWordLimitEnabled: true,
      responseWordLimit: 35
    }, {
      llm: {
        call: async (_systemPrompt: string, messages: Array<{ role: string; content: string }>) => {
          calls.push({ messages: messages.map((message) => ({ ...message })) });
          if (calls.length === 1) {
            return [
              "Data evidence case research reports show meaningful benefits for research teams [S1] [S2].",
              "Cost benefit ROI profit revenue effects are positive when saved analyst time exceeds integration cost.",
              "Risk boundary counterexample uncertainty remains: low-quality retrieval can mislead users, enterprises, regulators, and stakeholders.",
              "Long-term trend and execution feasibility depend on governance, process quality, and evaluation loops.",
              "I concede that the opponent is right that weak evidence and poor execution can defeat the pro case."
            ].join(" ");
          }
          return "Data, costs, risks, stakeholders, timing, and execution favor pro when B>C+R [S1][S2]. I concede that weak evidence can make con stronger.";
        }
      } as any,
      search: {} as any,
      finance: {} as any,
      registry,
      emitEvidence: () => {},
      warn: () => {},
      checkpoint: async () => {},
      assertActive: () => {}
    }, false);
    const evidence = [
      { id: "S1", title: "Source one", provider: "mock", url: "https://example.org/1", summary: "Evidence one" },
      { id: "S2", title: "Source two", provider: "mock", url: "https://example.org/2", summary: "Evidence two" }
    ] as any;

    const result = await agent.speak(1, evidence, "", {
      topic: "Should AI agents improve research workflows?",
      messages: [],
      evidence,
      guidance: [],
      moderatorGuidance: []
    });

    expect(calls).toHaveLength(2);
    expect(calls[1].messages[calls[1].messages.length - 1].content).toContain("whole revised speech must obey");
    expect(estimateReplyLengthUnits(result)).toBeLessThanOrEqual(35);
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
