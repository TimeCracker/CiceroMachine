export function truncate(text: string, max: number) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function parseMaybeJson(value: unknown) {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  const text = String(value || "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function parseJsonArray(text: string) {
  const trimmed = String(text || "").trim();
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = trimmed.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

export function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.sort();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function normalizeTitle(title: string) {
  return String(title || "").toLowerCase().replace(/\s+/g, "").slice(0, 80);
}

export function dedupeByUrlOrTitle<T extends { url?: string; title?: string }>(items: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = normalizeUrl(item.url || "") || `title:${normalizeTitle(item.title || "")}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function firstUsableUrl(...values: unknown[]) {
  for (const value of values) {
    const url = coerceExternalUrl(value);
    if (url) return url;
  }
  return "";
}

export function bestUrlFromObject(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return firstUsableUrl(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = bestUrlFromObject(item);
      if (url) return url;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const direct = firstUsableUrl(
    record.url,
    record.link,
    record.href,
    record.webpageUrl,
    record.webPageUrl,
    record.displayUrl,
    record.sourceUrl,
    record.source_url,
    record.pageUrl,
    record.page_url
  );
  if (direct) return direct;
  for (const [key, child] of Object.entries(record)) {
    if (/url|link|href/i.test(key)) {
      const url = bestUrlFromObject(child);
      if (url) return url;
    }
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === "object") {
      const url = bestUrlFromObject(child);
      if (url) return url;
    }
  }
  return "";
}

export function coerceExternalUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : (/^www\./i.test(raw) ? `https://${raw}` : "");
  if (!withProtocol) return "";
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function faviconForUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
  } catch {
    return "";
  }
}

export function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function flattenObject(value: unknown, prefix = "", output: Record<string, string> = {}) {
  if (value == null) return output;
  if (Array.isArray(value)) {
    value.slice(0, 6).forEach((item, index) => flattenObject(item, `${prefix}${prefix ? "." : ""}${index}`, output));
    return output;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flattenObject(child, `${prefix}${prefix ? "." : ""}${key}`, output);
    }
    return output;
  }
  if (prefix) output[prefix] = String(value);
  return output;
}

export function firstStringValue(object: unknown, keys: string[]) {
  if (!object || typeof object !== "object") return "";
  const record = object as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] != null && record[key] !== "") return String(record[key]);
  }
  const flat = flattenObject(object);
  for (const [key, value] of Object.entries(flat)) {
    if (keys.some((candidate) => key.toLowerCase().endsWith(candidate.toLowerCase()))) {
      return value;
    }
  }
  return "";
}

export function summarizeStructuredCard(flat: Record<string, string>) {
  const important = Object.entries(flat)
    .filter(([key, value]) => /price|股价|现价|最新|last|market|currency|币种|change|涨跌|percent|open|high|low|volume|time|date|市值|pe|eps|symbol|code|name/i.test(`${key} ${value}`))
    .slice(0, 18);
  const rows = important.length ? important : Object.entries(flat).slice(0, 12);
  return rows.map(([key, value]) => `${key}: ${value}`).join("; ") || "Structured card has no displayable fields.";
}

export function uniqueStrings(items: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const value = String(item || "").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function extractEvidenceIds(text: string) {
  const matches = String(text || "").match(/\[S\d+\]/g) || [];
  return Array.from(new Set(matches.map((item) => item.slice(1, -1))));
}

export function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || /aborted|abort/i.test(error.message || ""));
}

export function formatErrorMessage(error: unknown) {
  if (isAbortError(error)) return "Request was aborted.";
  return error && typeof error === "object" && "message" in error ? String((error as Error).message) : String(error);
}

export function safeFileName(text: string) {
  return String(text || "debate")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "debate";
}

export function escapeMdTable(value: unknown) {
  return String(value == null ? "" : value).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

export type TopicLanguageCode = "zh-Hans" | "zh-Hant" | "ja" | "ko" | "en" | "same";
export type SourceLanguageBucket = "zh" | "en" | "other" | "unknown";

export function topicLanguageCode(topic: string): TopicLanguageCode {
  const text = String(topic || "").trim();
  if (!text) return "same";
  const hangulCount = countMatches(text, /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/g);
  const kanaCount = countMatches(text, /[\u3040-\u30ff]/g);
  const hanCount = countMatches(text, /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g);
  const latinCount = countMatches(text, /[A-Za-z]/g);
  if (hangulCount > 0 && hangulCount >= kanaCount && hangulCount >= hanCount) return "ko";
  if (kanaCount > 0) return "ja";
  if (hanCount > 0) return traditionalChineseScore(text) > simplifiedChineseScore(text) ? "zh-Hant" : "zh-Hans";
  if (latinCount > 0) return "en";
  return "same";
}

export function topicLanguageName(topic: string) {
  switch (topicLanguageCode(topic)) {
    case "zh-Hans":
      return "Simplified Chinese";
    case "zh-Hant":
      return "Traditional Chinese";
    case "ja":
      return "Japanese";
    case "ko":
      return "Korean";
    case "en":
      return "English";
    default:
      return "the topic's dominant language";
  }
}

export function topicLanguageInstruction(topic: string) {
  const language = topicLanguageName(topic);
  return [
    `Output language: ${language}.`,
    "Match the dominant natural language and writing system used by the user's topic.",
    "Do not switch to English just because the system instructions are written in English.",
    "Keep source IDs, URLs, formulas, tickers, company names, model names, provider names, and necessary technical terms in their original form when appropriate."
  ].join(" ");
}

function countMatches(text: string, pattern: RegExp) {
  return (text.match(pattern) || []).length;
}

function traditionalChineseScore(text: string) {
  return countCharHits(text, "體臺灣國與時會來對個這為學習後說問題應該關於發現證據資料風險價值投資市場開發雲數據機構經濟華萬點現實質變義廣東興業產權標準資訊搜尋導體軟體網絡運營戰略競爭優勢劣勢評估總結結論報告證券財務營收預測價格來源歸屬");
}

function simplifiedChineseScore(text: string) {
  return countCharHits(text, "体台国与时会来对个这为学习后说问题应该关于发现证据资料风险价值投资市场开发云数据机构经济华万点现实质变义广东兴业产权标准信息搜索导体软件网络运营战略竞争优势劣势评估总结结论报告证券财务营收预测价格来源归属");
}

function countCharHits(text: string, chars: string) {
  const table = new Set([...chars]);
  return [...text].filter((char) => table.has(char)).length;
}

export function sourceLanguageBucket(source: { title?: string; url?: string; snippet?: string; summary?: string; query?: string }): SourceLanguageBucket {
  const host = hostnameOf(source.url || "").toLowerCase();
  if (isLikelyChineseHost(host)) return "zh";
  if (isLikelyEnglishHost(host)) return "en";

  const text = [source.title, source.snippet, source.summary].map((item) => String(item || "")).join(" ");
  const hanCount = countMatches(text, /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g);
  const kanaCount = countMatches(text, /[\u3040-\u30ff]/g);
  const hangulCount = countMatches(text, /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/g);
  const latinCount = countMatches(text, /[A-Za-z]/g);
  if (kanaCount > 0 || hangulCount > 0) return "other";
  if (hanCount >= 4 && hanCount * 2 >= latinCount) return "zh";
  if (latinCount >= 20 && latinCount > hanCount * 3) return "en";

  const query = String(source.query || "").toLowerCase();
  if (/english|reuters|bloomberg|financial times|bbc|associated press|ap news|academic|journal|official report/.test(query)) return "en";
  if (/中文|中国|中國|证券|證券|研报|報告|财报|財報|雪球|东方财富|東方財富/.test(query)) return "zh";
  return host ? "unknown" : "unknown";
}

function isLikelyChineseHost(host: string) {
  return Boolean(host) && (
    /\.cn$/i.test(host) ||
    /\.com\.cn$/i.test(host) ||
    /(^|\.)((baidu|qq|sina|sohu|163|ifeng|eastmoney|xueqiu|wallstreetcn|caixin|yicai|cls|stcn|cnstock|jrj|hexun|gelonghui|thepaper|people|xinhuanet|chinanews|cctv|cs|sse|szse|cninfo)\.)/i.test(host)
  );
}

function isLikelyEnglishHost(host: string) {
  return Boolean(host) && (
    /\.(edu|gov|mil)$/i.test(host) ||
    /(^|\.)((reuters|bloomberg|ft|wsj|barrons|marketwatch|cnbc|bbc|apnews|associatedpress|nytimes|washingtonpost|economist|forbes|fortune|investopedia|morningstar|fool|seekingalpha|finance\.yahoo|sec|nasdaq|nyse|lse|tradingview|investing|statista|wikipedia|oecd|worldbank|imf|fifa|uefa|espn|theathletic|skysports)\.)/i.test(host)
  );
}
