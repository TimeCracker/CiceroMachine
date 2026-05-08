import type { AgentId, Config, EvidenceItem } from "../../src/types";
import { mockFinanceEvidence } from "../mock";
import { faviconForUrl } from "../domain/utils";
import { parseJsonResponse } from "./http";
import type { SearchService } from "./search";

type EvidenceCandidate = Omit<EvidenceItem, "id" | "retrievedAt" | "uses"> & Partial<Pick<EvidenceItem, "id" | "retrievedAt" | "uses">>;

export class FinanceService {
  constructor(
    private readonly config: Config,
    private readonly fetchWithTimeout: (url: string, options?: RequestInit & { debugLabel?: string }) => Promise<Response>,
    private readonly search: SearchService,
    private readonly mockMode: boolean,
    private readonly onWarning: (message: string) => void
  ) {}

  async gather(agent: AgentId, round: number): Promise<EvidenceCandidate[]> {
    if (!detectFinancialTopic(this.config.topic)) return [];
    if (this.mockMode) return mockFinanceEvidence(this.config, agent, round);
    const ticker = detectKnownTicker(this.config.topic);
    const query = ticker
      ? `${ticker} stock current price delayed quote HKD structured market data`
      : `${this.config.topic} current stock price delayed quote structured market data`;
    const items: EvidenceCandidate[] = [];
    if (this.config.searchProvider === "bocha" || this.config.searchProvider === "hybrid") {
      try {
        const bochaAIItems = await this.search.searchBochaAI(query, { agent, round });
        items.push(...bochaAIItems.filter((item) => isFinanceEvidence(item)));
      } catch (error) {
        this.onWarning(`Bocha AI Search structured quote lookup failed: ${formatErrorMessage(error)}`);
      }
    }
    if (ticker) {
      try {
        const item = await this.fetchYahooQuote(ticker, agent, round);
        if (item) items.push(item);
      } catch (error) {
        this.onWarning(`Yahoo Finance delayed quote lookup failed: ${formatErrorMessage(error)}`);
      }
    }
    if (!items.some((item) => isFinanceEvidence(item))) {
      this.onWarning("No verifiable structured market quote was retrieved. Live or delayed stock price, market cap, P/E, EPS, and similar data will not enter the evidence pool; the LLM must not infer them.");
    }
    return items;
  }

  private async fetchYahooQuote(ticker: string, agent: AgentId, round: number): Promise<EvidenceCandidate | null> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1m`;
    const response = await this.fetchWithTimeout(url, { method: "GET", debugLabel: "Yahoo Finance delayed quote" });
    const data = await parseJsonResponse(response);
    const result = data && data.chart && data.chart.result && data.chart.result[0];
    if (!result || !result.meta) return null;
    const meta = result.meta;
    const price = meta.regularMarketPrice || meta.previousClose || meta.chartPreviousClose;
    const currency = meta.currency || "";
    const marketTime = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : "";
    const exchange = meta.fullExchangeName || meta.exchangeName || "";
    const quoteUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/`;
    return {
      provider: "yahoo-finance-chart",
      title: `${meta.shortName || ticker} ${ticker} delayed quote`,
      url: quoteUrl,
      favicon: faviconForUrl(quoteUrl),
      snippet: `Yahoo Finance chart API returned a delayed quote for ${ticker} ${exchange}: ${price} ${currency || ""}; market time ${marketTime || "unknown"}.`,
      summary: `Delayed quote ${price} ${currency || ""}; exchange ${exchange || "unknown"}; market time ${marketTime || "unknown"}.`,
      publishedAt: marketTime,
      score: null,
      query: `${ticker} latest delayed quote Yahoo Finance`,
      agent,
      round
    };
  }
}

export function detectFinancialTopic(text: string) {
  return /stock|share price|market cap|valuation|financial report|revenue|profit|net income|gross margin|cash flow|balance sheet|EPS|P\/E|PE\b|HKD|CNY|USD|股价|股票|市值|估值|财报|营收|收入|利润|净利|毛利|市盈率|港股|美股|A股|港币|人民币|财务|现金流|资产负债/i.test(text || "");
}

export function detectKnownTicker(text: string) {
  const value = String(text || "");
  const explicit = value.match(/\b\d{4}\.HK\b|\b[A-Z]{1,5}\b(?:\.[A-Z]{1,3})?/i);
  if (explicit && /\d{4}\.HK/i.test(explicit[0])) {
    return explicit[0].toUpperCase();
  }
  const hints = [
    { pattern: /Xiaomi|小米/i, ticker: "1810.HK" },
    { pattern: /Tencent|腾讯/i, ticker: "0700.HK" },
    { pattern: /Alibaba|阿里/i, ticker: "9988.HK" },
    { pattern: /Meituan|美团/i, ticker: "3690.HK" },
    { pattern: /BYD|比亚迪/i, ticker: "1211.HK" },
    { pattern: /JD\.com|JD|京东/i, ticker: "9618.HK" }
  ];
  const match = hints.find((item) => item.pattern.test(value));
  return match ? match.ticker : "";
}

export function isFinanceEvidence(item: Partial<EvidenceItem>) {
  if (!item) return false;
  if (item.provider === "yahoo-finance-chart" || item.provider === "mock-finance") return true;
  if (item.provider !== "bocha-ai-search-card") return false;
  return /price|股价|现价|最新|last|market|currency|币种|change|涨跌|percent|open|high|low|volume|time|date|市值|pe|eps|symbol|code|股票|行情/i.test(
    `${item.title || ""} ${item.summary || ""} ${item.snippet || ""} ${item.contentType || ""}`
  );
}

function formatErrorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error ? String((error as Error).message) : String(error);
}
