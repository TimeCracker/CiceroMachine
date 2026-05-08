import { describe, expect, it } from "vitest";
import { EvidenceRegistry } from "./evidenceRegistry";

describe("EvidenceRegistry", () => {
  it("assigns global source IDs, dedupes by URL, and preserves per-agent uses", () => {
    const registry = new EvidenceRegistry();
    const first = registry.add({
      provider: "mock",
      title: "First source",
      url: "https://example.org/report?b=2&a=1",
      snippet: "one",
      summary: "one",
      publishedAt: "",
      score: null,
      query: "query a",
      agent: "A",
      round: 1
    }, "A", 1, "query a");
    const duplicate = registry.add({
      provider: "mock",
      title: "First source duplicate",
      url: "https://example.org/report?a=1&b=2",
      snippet: "two",
      summary: "two",
      publishedAt: "",
      score: null,
      query: "query b",
      agent: "B",
      round: 1
    }, "B", 1, "query b");
    const second = registry.add({
      provider: "mock",
      title: "Second source",
      url: "https://example.net/case",
      snippet: "three",
      summary: "three",
      publishedAt: "",
      score: null,
      query: "query c",
      agent: "B",
      round: 2
    }, "B", 2, "query c");

    expect(first.id).toBe("S1");
    expect(duplicate.id).toBe("S1");
    expect(second.id).toBe("S2");
    expect(registry.list()).toHaveLength(2);
    expect(first.uses.map((use) => `${use.agent}:${use.query}`)).toEqual(["A:query a", "B:query b"]);
  });
});
