import type { AgentId, Config, EvidenceItem } from "../src/types";
import { extractEvidenceIds, faviconForUrl, topicLanguageCode } from "./domain/utils";

export function mockQueries(config: Config, agent: AgentId, round: number) {
  const side = agent === "A" ? "pro" : "con";
  return [
    `${config.topic || "debate topic"} ${side} key data round ${round}`,
    `${config.topic || "debate topic"} ${side} rebuttal evidence round ${round}`
  ].slice(0, config.queriesPerAgent);
}

export function mockSearch(config: Config, query: string, context: { agent: AgentId; round: number }) {
  const host = context.agent === "A" ? "example.org" : "example.net";
  return Promise.resolve([
    {
      provider: config.searchProvider === "hybrid" ? "bocha" : config.searchProvider,
      title: `${query}: industry report summary`,
      url: `https://${host}/report/${context.round}-${encodeURIComponent(query).slice(0, 16)}`,
      favicon: `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
      snippet: `This mock search result supports agent ${context.agent} in round ${context.round} with data and cases for "${config.topic}".`,
      summary: "The report states that impact factors can be decomposed into benefits, costs, risks, and time windows. Formula example: net value = benefits - costs - risk discount.",
      publishedAt: "2026-01-01",
      score: 0.88,
      query,
      agent: context.agent,
      round: context.round
    },
    {
      provider: "mock",
      title: `${query}: counterexamples and boundary conditions`,
      url: `https://${host}/case/${context.round}-${context.agent}`,
      favicon: `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
      snippet: "This source provides counterexamples, constraints, and limitations for the moderator's balanced assessment.",
      summary: "Boundary conditions include organizational maturity, data quality, execution cost, and regulatory constraints.",
      publishedAt: "2026-02-01",
      score: 0.82,
      query,
      agent: context.agent,
      round: context.round
    }
  ]);
}

export function mockLLM(config: Config, systemPrompt: string, messages: Array<{ role: string; content: string }>) {
  const latest = messages[messages.length - 1] ? messages[messages.length - 1].content : "";
  const language = topicLanguageCode(config.topic);
  if (/search planner/i.test(systemPrompt)) {
    return Promise.resolve(JSON.stringify(mockQueries(config, /con/i.test(latest) ? "B" : "A", 1)));
  }
  const ids = extractEvidenceIds(latest);
  const cited = ids.length ? ids.slice(0, 3).map((id) => `[${id}]`).join(", ") : "[S1], [S2]";
  if (/debate moderator/i.test(systemPrompt) && /final summary|final research report/i.test(latest)) {
    return Promise.resolve(mockFinalReport(language, cited));
  }
  if (/debate moderator/i.test(systemPrompt)) {
    return Promise.resolve(mockModeratorCommentary(language, cited));
  }
  const side = /agent A/i.test(systemPrompt) ? "pro" : "con";
  return Promise.resolve(mockDebaterSpeech(language, side, cited));
}

function mockFinalReport(language: ReturnType<typeof topicLanguageCode>, cited: string) {
  if (language === "zh-Hans") {
    return [
      "## 核心结论",
      `双方争议的核心在于证据强度、适用边界和执行成本。当前主要证据包括 ${cited}。`,
      "",
      "## 公式与推导",
      "| 变量 | 含义 |",
      "| --- | --- |",
      "| V | 净价值 |",
      "| B | 可验证收益 |",
      "| C | 执行成本 |",
      "| R | 风险折扣 |",
      "",
      "公式：V = B - C - R。当 V > 0 且证据可验证时，正方更强；当 R 或 C 难以控制时，反方更强。",
      "",
      "## 平衡评估",
      "正方在趋势和效率上更强，反方在边界条件和风险控制上更强。最终结论应当是有条件的，而不是绝对判断。",
      "",
      "## 最终结论与限制",
      "应采用条件性结论，并持续暴露来源不确定性。"
    ].join("\n");
  }
  if (language === "zh-Hant") {
    return [
      "## 核心結論",
      `雙方爭議的核心在於證據強度、適用邊界和執行成本。當前主要證據包括 ${cited}。`,
      "",
      "## 公式與推導",
      "| 變數 | 含義 |",
      "| --- | --- |",
      "| V | 淨價值 |",
      "| B | 可驗證收益 |",
      "| C | 執行成本 |",
      "| R | 風險折扣 |",
      "",
      "公式：V = B - C - R。當 V > 0 且證據可驗證時，正方更強；當 R 或 C 難以控制時，反方更強。",
      "",
      "## 平衡評估",
      "正方在趨勢和效率上更強，反方在邊界條件和風險控制上更強。最終結論應當是有條件的，而不是絕對判斷。",
      "",
      "## 最終結論與限制",
      "應採用條件性結論，並持續揭示來源不確定性。"
    ].join("\n");
  }
  if (language === "ja") {
    return [
      "## 核心結論",
      `両者の争点は、証拠の強さ、適用範囲、実行コストです。主要な根拠は ${cited} です。`,
      "",
      "## 数式と推論",
      "| 変数 | 意味 |",
      "| --- | --- |",
      "| V | 純価値 |",
      "| B | 検証可能な便益 |",
      "| C | 実行コスト |",
      "| R | リスク控除 |",
      "",
      "式：V = B - C - R。V > 0 で証拠が検証可能なら賛成側が強く、R または C が制御しにくいなら反対側が強くなります。",
      "",
      "## 最終結論と限界",
      "結論は条件付きにし、出典の不確実性を明示すべきです。"
    ].join("\n");
  }
  if (language === "ko") {
    return [
      "## 핵심 결론",
      `양측의 핵심 쟁점은 근거의 강도, 적용 범위, 실행 비용입니다. 주요 근거는 ${cited}입니다.`,
      "",
      "## 공식과 추론",
      "| 변수 | 의미 |",
      "| --- | --- |",
      "| V | 순가치 |",
      "| B | 검증 가능한 편익 |",
      "| C | 실행 비용 |",
      "| R | 위험 할인 |",
      "",
      "공식: V = B - C - R. V > 0이고 근거가 검증 가능하면 찬성 측이 강하며, R 또는 C를 통제하기 어렵다면 반대 측이 강합니다.",
      "",
      "## 최종 결론과 한계",
      "조건부 결론을 사용하고 출처의 불확실성을 드러내야 합니다."
    ].join("\n");
  }
  return [
      "## Core Conclusion",
      `Across both sides, the key issue is evidence strength, applicability boundaries, and execution cost. Main support includes ${cited}.`,
      "",
      "## Formula and Derivation",
      "| Variable | Meaning |",
      "| --- | --- |",
      "| V | Net value |",
      "| B | Verifiable benefit |",
      "| C | Execution cost |",
      "| R | Risk discount |",
      "",
      "Formula: V = B - C - R. When V > 0 and the evidence is verifiable, the pro side is stronger; when R or C is hard to control, the con side is stronger.",
      "",
      "## Balanced Assessment",
      "The pro side is stronger on trend and efficiency, while the con side is stronger on boundary conditions and risk control. The final conclusion should be conditional, not absolute.",
      "",
      "## Final Conclusion and Limitations",
      "Use a conditional conclusion and keep source uncertainty visible."
    ].join("\n");
}

function mockModeratorCommentary(language: ReturnType<typeof topicLanguageCode>, cited: string) {
  if (language === "zh-Hans") return `当前争议集中在收益是否足以覆盖成本和风险。正方引用 ${cited} 强调趋势和可衡量收益，反方强调边界条件。下一步追问：哪些变量可以直接衡量，哪些只是判断？`;
  if (language === "zh-Hant") return `目前爭議集中在收益是否足以覆蓋成本和風險。正方引用 ${cited} 強調趨勢和可衡量收益，反方強調邊界條件。下一步追問：哪些變數可以直接衡量，哪些只是判斷？`;
  if (language === "ja") return `現時点の争点は、便益がコストとリスクを上回るかです。賛成側は ${cited} に基づき傾向と測定可能な利得を強調し、反対側は境界条件を重視します。次の問い：どの変数は直接測定でき、どれは判断に依存するのか？`;
  if (language === "ko") return `현재 쟁점은 편익이 비용과 위험을 감당할 수 있는지입니다. 찬성 측은 ${cited}를 근거로 추세와 측정 가능한 이익을 강조하고, 반대 측은 경계 조건을 강조합니다. 다음 질문: 어떤 변수는 직접 측정 가능하고 어떤 변수는 판단에 의존하나요?`;
  return `At this stage, the dispute centers on whether benefits can cover costs and risks. The pro side cites ${cited} to emphasize trends and measurable gains, while the con side emphasizes boundary conditions. Next follow-up: which variables can be measured directly, and which are only judgment calls?`;
}

function mockDebaterSpeech(language: ReturnType<typeof topicLanguageCode>, side: "pro" | "con", cited: string) {
  if (language === "zh-Hans") {
    const label = side === "pro" ? "正方" : "反方";
    return `${label}认为，这个辩题应基于可验证证据而不是直觉判断。根据 ${cited}，核心变量可以写成 V = B - C - R，其中 B 是收益，C 是迁移或执行成本，R 是风险折扣。如果对方只强调单一案例，就会忽视样本范围和时间周期。我的立场是：当证据链显示 B 持续大于 C+R 时，本方更强；否则必须承认阶段性限制。`;
  }
  if (language === "zh-Hant") {
    const label = side === "pro" ? "正方" : "反方";
    return `${label}認為，這個辯題應基於可驗證證據而不是直覺判斷。根據 ${cited}，核心變數可以寫成 V = B - C - R，其中 B 是收益，C 是遷移或執行成本，R 是風險折扣。如果對方只強調單一案例，就會忽視樣本範圍和時間週期。我的立場是：當證據鏈顯示 B 持續大於 C+R 時，本方更強；否則必須承認階段性限制。`;
  }
  if (language === "ja") {
    const label = side === "pro" ? "賛成側" : "反対側";
    return `${label}は、この論題を直感ではなく検証可能な証拠で判断すべきだと考えます。${cited} に基づくと、中心変数は V = B - C - R と表せます。B は便益、C は移行または実行コスト、R はリスク控除です。相手が単一事例だけを強調するなら、サンプル範囲と時間軸を見落としています。`;
  }
  if (language === "ko") {
    const label = side === "pro" ? "찬성 측" : "반대 측";
    return `${label}은 이 주제를 직관이 아니라 검증 가능한 근거로 판단해야 한다고 봅니다. ${cited}에 따르면 핵심 변수는 V = B - C - R로 쓸 수 있습니다. B는 편익, C는 이전 또는 실행 비용, R은 위험 할인입니다. 상대가 하나의 사례만 강조하면 표본 범위와 시간 축을 놓치게 됩니다.`;
  }
  const label = side === "pro" ? "The pro side" : "The con side";
  return `${label} argues that this topic should be judged by verifiable evidence rather than intuition alone. Based on ${cited}, the core variable can be written as V = B - C - R, where B is benefit, C is migration or execution cost, and R is risk discount. If the opposing side only emphasizes one case, it misses sample scope and time horizon. My stance is that if the evidence chain shows B persistently exceeds C+R, this side is stronger; otherwise, we should acknowledge stage-specific limits.`;
}

export function mockFinanceEvidence(config: Config, agent: AgentId, round: number): EvidenceItem[] {
  if (!/stock|price|valuation|股价|股票|估值/i.test(config.topic || "")) return [];
  const url = "https://finance.yahoo.com/";
  return [{
    id: "",
    provider: "mock-finance",
    title: `${config.topic || "Topic"} mock delayed quote`,
    url,
    favicon: faviconForUrl(url),
    snippet: "Mock delayed market quote used only for regression tests.",
    summary: "Mock delayed quote; currency and time are illustrative in mock mode.",
    publishedAt: "2026-05-08T00:00:00.000Z",
    retrievedAt: "",
    score: null,
    query: `${config.topic} delayed quote`,
    agent,
    round,
    uses: []
  }];
}
