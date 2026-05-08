import type { AgentId, EvidenceItem } from "../../src/types";
import { faviconForUrl, firstUsableUrl, normalizeTitle, normalizeUrl } from "./utils";

type EvidenceCandidate = Omit<EvidenceItem, "id" | "retrievedAt" | "uses"> & Partial<Pick<EvidenceItem, "id" | "retrievedAt" | "uses">>;

export class EvidenceRegistry {
  private readonly evidence: EvidenceItem[] = [];
  private readonly index = new Map<string, EvidenceItem>();

  list() {
    return this.evidence;
  }

  add(candidate: EvidenceCandidate, agent: AgentId, round: number, query: string) {
    const candidateUrl = firstUsableUrl(candidate.url);
    const normalizedUrl = normalizeUrl(candidateUrl);
    const titleKey = normalizeTitle(candidate.title || "");
    const key = normalizedUrl || `title:${titleKey}`;
    if (key && this.index.has(key)) {
      const existing = this.index.get(key)!;
      this.registerUse(existing, agent, round, query, candidate.provider || existing.provider);
      return existing;
    }
    const item: EvidenceItem = {
      id: `S${this.evidence.length + 1}`,
      provider: candidate.provider || "unknown",
      title: candidate.title || "Untitled source",
      url: candidateUrl,
      favicon: candidate.favicon || faviconForUrl(candidateUrl),
      snippet: candidate.snippet || candidate.summary || "",
      summary: candidate.summary || "",
      publishedAt: candidate.publishedAt || "",
      retrievedAt: new Date().toISOString(),
      score: candidate.score || null,
      query: candidate.query || query,
      agent,
      round,
      uses: [],
      raw: candidate.raw,
      contentType: candidate.contentType
    };
    this.registerUse(item, agent, round, query, item.provider);
    this.evidence.push(item);
    if (key) this.index.set(key, item);
    return item;
  }

  registerUse(item: EvidenceItem, agent: AgentId, round: number, query: string, provider?: string) {
    if (!Array.isArray(item.uses)) item.uses = [];
    const normalizedQuery = String(query || item.query || "").trim();
    const exists = item.uses.some((use) => use.agent === agent && use.round === round && use.query === normalizedQuery);
    if (!exists) {
      item.uses.push({
        agent,
        round,
        query: normalizedQuery,
        provider: provider || item.provider,
        usedAt: new Date().toISOString()
      });
    }
  }
}
