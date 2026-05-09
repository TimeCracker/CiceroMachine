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
  const labels = {
    "zh-Hans": {
      consensus: "事实共识",
      disputes: "事实分歧",
      value: "价值与立场分歧",
      table: "证据与公式表",
      conditional: "条件性结论",
      unresolved: "未解决问题",
      conclusion: "平衡评估与最终结论",
      limits: "方法论限制",
      text: `双方都承认需要用证据强度、适用边界和执行成本来判断，当前主要证据包括 ${cited}。`,
      formula: "V = B - C - R，其中 B 是可验证收益，C 是执行成本，R 是风险折扣。"
    },
    "zh-Hant": {
      consensus: "事實共識",
      disputes: "事實分歧",
      value: "價值與立場分歧",
      table: "證據與公式表",
      conditional: "條件性結論",
      unresolved: "未解決問題",
      conclusion: "平衡評估與最終結論",
      limits: "方法論限制",
      text: `雙方都承認需要用證據強度、適用邊界和執行成本來判斷，當前主要證據包括 ${cited}。`,
      formula: "V = B - C - R，其中 B 是可驗證收益，C 是執行成本，R 是風險折扣。"
    },
    ja: {
      consensus: "事実上の合意",
      disputes: "事実上の争点",
      value: "価値・立場の争点",
      table: "証拠と数式の表",
      conditional: "条件付き結論",
      unresolved: "未解決の問い",
      conclusion: "均衡評価と最終結論",
      limits: "方法論上の限界",
      text: `両者は、証拠の強さ、適用範囲、実行コストで判断すべき点では一致しています。主要な根拠は ${cited} です。`,
      formula: "V = B - C - R。B は検証可能な便益、C は実行コスト、R はリスク控除です。"
    },
    ko: {
      consensus: "사실 합의",
      disputes: "사실 쟁점",
      value: "가치 및 입장 쟁점",
      table: "근거와 공식 표",
      conditional: "조건부 결론",
      unresolved: "미해결 질문",
      conclusion: "균형 평가와 최종 결론",
      limits: "방법론적 한계",
      text: `양측은 근거의 강도, 적용 범위, 실행 비용으로 판단해야 한다는 점에는 동의합니다. 주요 근거는 ${cited}입니다.`,
      formula: "V = B - C - R. B는 검증 가능한 편익, C는 실행 비용, R은 위험 할인입니다."
    },
    en: {
      consensus: "Factual Consensus",
      disputes: "Factual Disputes",
      value: "Value & Stance Disputes",
      table: "Evidence & Formula Table",
      conditional: "Conditional Conclusions",
      unresolved: "Unresolved Questions",
      conclusion: "Balanced Assessment & Final Conclusion",
      limits: "Methodology Limitations",
      text: `Both sides accept that the topic should be judged by evidence strength, applicability boundaries, and execution cost. Main support includes ${cited}.`,
      formula: "V = B - C - R, where B is verifiable benefit, C is execution cost, and R is risk discount."
    }
  }[language] || labelsFallback(cited);
  return [
    `## 1. ${labels.consensus}`,
    labels.text,
    "",
    `## 2. ${labels.disputes}`,
    `The main factual dispute is whether ${cited} is strong enough to generalize beyond the cited cases.`,
    "",
    `## 3. ${labels.value}`,
    "The pro side prioritizes upside and trend strength; the con side prioritizes downside control and boundary conditions.",
    "",
    `## 4. ${labels.table}`,
    "| Claim | Pro evidence | Con evidence | Verdict |",
    "| --- | --- | --- | --- |",
    `| Net value | ${cited} | Boundary-condition evidence | Conditional |`,
    "",
    `## 5. ${labels.conditional}`,
    `- If B persistently exceeds C + R, the pro position is stronger because ${labels.formula}`,
    "- If R or C cannot be controlled, the con position is stronger.",
    "",
    `## 6. ${labels.unresolved}`,
    "The decisive open question is which variables are directly measurable rather than judgment calls.",
    "",
    `## 7. ${labels.conclusion}`,
    "The current evidence supports a conditional conclusion rather than an absolute winner.",
    "",
    `## 8. ${labels.limits}`,
    "This mock report is limited by synthetic evidence and should only be used for regression testing."
  ].join("\n");
}

function labelsFallback(cited: string) {
  return {
    consensus: "Factual Consensus",
    disputes: "Factual Disputes",
    value: "Value & Stance Disputes",
    table: "Evidence & Formula Table",
    conditional: "Conditional Conclusions",
    unresolved: "Unresolved Questions",
    conclusion: "Balanced Assessment & Final Conclusion",
    limits: "Methodology Limitations",
    text: `Both sides accept that the topic should be judged by evidence strength, applicability boundaries, and execution cost. Main support includes ${cited}.`,
    formula: "V = B - C - R, where B is verifiable benefit, C is execution cost, and R is risk discount."
  };
}

function mockModeratorCommentary(language: ReturnType<typeof topicLanguageCode>, cited: string) {
  if (language === "zh-Hans") return `(a) 核心分歧：当前争议集中在收益是否足以覆盖成本和风险。正方引用 ${cited} 强调趋势和可衡量收益，反方强调边界条件。\n\n(b) 逻辑审计：暂无明确谬误，但双方都可能把有限样本外推为一般结论。\n\n(c) 盲区：双方都需要回答：哪些关键变量可以直接衡量，哪些只是判断？\n\n(d) 后续角度：下一轮应检验 B、C、R 三个变量的可测性和时间稳定性。`;
  if (language === "zh-Hant") return `(a) 核心分歧：目前爭議集中在收益是否足以覆蓋成本和風險。正方引用 ${cited} 強調趨勢和可衡量收益，反方強調邊界條件。\n\n(b) 邏輯審計：暫無明確謬誤，但雙方都可能把有限樣本外推為一般結論。\n\n(c) 盲區：雙方都需要回答：哪些關鍵變數可以直接衡量，哪些只是判斷？\n\n(d) 後續角度：下一輪應檢驗 B、C、R 三個變數的可測性和時間穩定性。`;
  if (language === "ja") return `(a) 核心的な不一致：争点は、便益がコストとリスクを上回るかです。賛成側は ${cited} に基づき傾向と測定可能な利得を強調し、反対側は境界条件を重視します。\n\n(b) 論理監査：明確な誤謬はありませんが、両者とも限られたサンプルを一般化している可能性があります。\n\n(c) 盲点：どの変数は直接測定でき、どれは判断に依存するのかを次に答える必要があります。\n\n(d) フォローアップ角度：次ラウンドでは B、C、R の測定可能性と時間的安定性を検証してください。`;
  if (language === "ko") return `(a) 핵심 불일치: 현재 쟁점은 편익이 비용과 위험을 감당할 수 있는지입니다. 찬성 측은 ${cited}를 근거로 추세와 측정 가능한 이익을 강조하고, 반대 측은 경계 조건을 강조합니다.\n\n(b) 논리 감사: 명확한 오류는 없지만 양측 모두 제한된 표본을 일반화할 위험이 있습니다.\n\n(c) 맹점: 양측은 어떤 핵심 변수가 직접 측정 가능하고 어떤 변수가 판단에 의존하는지 답해야 합니다.\n\n(d) 후속 각도: 다음 라운드에서는 B, C, R의 측정 가능성과 시간 안정성을 검증해야 합니다.`;
  return `(a) Core disagreement: The dispute centers on whether benefits can cover costs and risks. The pro side cites ${cited} to emphasize trends and measurable gains, while the con side emphasizes boundary conditions.\n\n(b) Logic audit: No clear fallacy is established, but both sides risk overgeneralizing from limited samples.\n\n(c) Blind spot: Which key variables can be measured directly, and which are only judgment calls?\n\n(d) Follow-up angle: Next round should test the measurability and time stability of B, C, and R.`;
}

function mockDebaterSpeech(language: ReturnType<typeof topicLanguageCode>, side: "pro" | "con", cited: string) {
  if (language === "zh-Hans") {
    const label = side === "pro" ? "正方" : "反方";
    return `${label}认为，这个辩题应基于可验证证据而不是直觉判断。对方最有力的论点是边界条件和风险折扣可能吞噬表面收益。根据 ${cited}，核心变量可以写成 V = B - C - R，其中 B 是收益，C 是迁移或执行成本，R 是风险折扣。如果对方只强调单一案例，就会忽视样本范围和时间周期。我的立场是：当证据链显示 B 持续大于 C+R 时，本方更强；否则必须承认阶段性限制。\n\n我承认，对方关于风险边界的提醒有道理，尤其是在执行成本难以量化时。`;
  }
  if (language === "zh-Hant") {
    const label = side === "pro" ? "正方" : "反方";
    return `${label}認為，這個辯題應基於可驗證證據而不是直覺判斷。對方最有力的論點是邊界條件和風險折扣可能吞噬表面收益。根據 ${cited}，核心變數可以寫成 V = B - C - R，其中 B 是收益，C 是遷移或執行成本，R 是風險折扣。如果對方只強調單一案例，就會忽視樣本範圍和時間週期。我的立場是：當證據鏈顯示 B 持續大於 C+R 時，本方更強；否則必須承認階段性限制。\n\n我承認，對方關於風險邊界的提醒有道理，尤其是在執行成本難以量化時。`;
  }
  if (language === "ja") {
    const label = side === "pro" ? "賛成側" : "反対側";
    return `${label}は、この論題を直感ではなく検証可能な証拠で判断すべきだと考えます。相手の最も強い主張は、境界条件とリスク控除が表面的な便益を相殺し得る点です。${cited} に基づくと、中心変数は V = B - C - R と表せます。B は便益、C は移行または実行コスト、R はリスク控除です。相手が単一事例だけを強調するなら、サンプル範囲と時間軸を見落としています。私の立場は、V > 0 が安定して成立する条件で強くなります。\n\n認めます。相手のリスク境界に関する指摘は、実行コストが測定しにくい場合には正しい可能性があります。`;
  }
  if (language === "ko") {
    const label = side === "pro" ? "찬성 측" : "반대 측";
    return `${label}은 이 주제를 직관이 아니라 검증 가능한 근거로 판단해야 한다고 봅니다. 상대의 가장 강력한 주장은 경계 조건과 위험 할인이 표면적 편익을 상쇄할 수 있다는 점입니다. ${cited}에 따르면 핵심 변수는 V = B - C - R로 쓸 수 있습니다. B는 편익, C는 이전 또는 실행 비용, R은 위험 할인입니다. 상대가 하나의 사례만 강조하면 표본 범위와 시간 축을 놓치게 됩니다. 제 입장은 V > 0이 안정적으로 성립하는 조건에서 유효합니다.\n\n인정합니다. 실행 비용을 측정하기 어려운 경우에는 상대방의 위험 경계 지적이 맞습니다.`;
  }
  const label = side === "pro" ? "The pro side" : "The con side";
  return `${label} argues that this topic should be judged by verifiable evidence rather than intuition alone. The opponent's strongest point is that boundary conditions and risk discounting can overwhelm apparent benefits. Based on ${cited}, the core variable can be written as V = B - C - R, where B is benefit, C is migration or execution cost, and R is risk discount. If the opposing side only emphasizes one case, it misses sample scope and time horizon. My position holds when the evidence chain shows B persistently exceeds C+R; otherwise, we should acknowledge stage-specific limits.\n\nI concede that the opponent's risk-boundary argument has merit when execution costs are hard to measure.`;
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
