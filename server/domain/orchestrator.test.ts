import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config";
import { DebateSession, extractModeratorGuidance } from "./orchestrator";

describe("DebateSession", () => {
  it("runs a mock debate with isolated A/B/C agent runtime state", async () => {
    const session = new DebateSession({
      ...DEFAULT_CONFIG,
      topic: "Should AI agents replace manual research workflows?",
      apiKey: "mock-key",
      searchApiKey: "mock-search-key",
      rounds: 3,
      searchCount: 2,
      queriesPerAgent: 1
    }, true);

    await session.start();
    const snapshot = session.snapshot();

    expect(snapshot.debate.messages.some((message) => message.agent === "A")).toBe(true);
    expect(snapshot.debate.messages.some((message) => message.agent === "B")).toBe(true);
    expect(snapshot.debate.messages.some((message) => message.agent === "C")).toBe(true);
    expect(snapshot.debate.finalReport).toContain("Factual Consensus");
    expect(snapshot.debate.finalReport).toContain("Conditional Conclusions");
    expect(snapshot.debate.agentStates?.A?.role).toBe("pro");
    expect(snapshot.debate.agentStates?.B?.role).toBe("con");
    expect(snapshot.debate.agentStates?.C?.role).toBe("moderator");
    expect(snapshot.debate.agentStates?.A?.historyLength).toBeGreaterThan(0);
    expect(snapshot.debate.agentStates?.B?.historyLength).toBeGreaterThan(0);
    expect(snapshot.debate.agentStates?.C?.memory.length).toBeGreaterThan(0);
    expect(snapshot.debate.agentStates?.A?.privateEvidenceIds).not.toEqual(snapshot.debate.agentStates?.B?.privateEvidenceIds);
  });

  it("exports markdown with evidence URLs, attribution, and final report", async () => {
    const session = new DebateSession({
      ...DEFAULT_CONFIG,
      topic: "Should AI agents replace manual research workflows?",
      apiKey: "mock-key",
      searchApiKey: "mock-search-key",
      rounds: 1,
      searchCount: 2,
      queriesPerAgent: 1
    }, true);

    await session.start();
    const markdown = session.exportMarkdown();

    expect(markdown).toContain("## Moderator Final Conclusion");
    expect(markdown).toContain("## Evidence Table");
    expect(markdown).toContain("## Source Attribution");
    expect(markdown).toContain("https://example.org");
    expect(markdown).toContain("https://example.net");
  });

  it("exports local markdown headings in the same language as the topic", async () => {
    const session = new DebateSession({
      ...DEFAULT_CONFIG,
      topic: "泡泡玛特股价当前是否已跌到位？",
      apiKey: "mock-key",
      searchApiKey: "mock-search-key",
      rounds: 1,
      searchCount: 2,
      queriesPerAgent: 1
    }, true);

    await session.start();
    const markdown = session.exportMarkdown();

    expect(session.snapshot().debate.finalReport).toContain("## 1. 事实共识");
    expect(markdown).toContain("# 辩论研究报告");
    expect(markdown).toContain("## 主持人最终结论");
    expect(markdown).toContain("## 证据表");
    expect(markdown).toContain("## 完整辩论记录");
  });

  it("extracts structured moderator blind spot and follow-up guidance", () => {
    const guidance = extractModeratorGuidance([
      "(a) Core disagreement: benefits versus risks.",
      "",
      "(b) Logic audit: no clear fallacy.",
      "",
      "(c) Blind spot: Which variables are measurable rather than judgment calls?",
      "",
      "(d) Follow-up angle: Test B, C, and R in the next round."
    ].join("\n"));

    expect(guidance).toContain("Which variables are measurable");
    expect(guidance).toContain("Follow-up angle");
    expect(guidance).not.toContain("Core disagreement");
  });
});
