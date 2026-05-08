import type { AgentId, AgentRuntimeState, Config, DebateMessage, EvidenceItem, ModeratorGuidance, UserGuidance } from "../../src/types";
import { isFinalReportIncomplete, mergeFinalReportContinuation } from "../../src/domain/finalReport";
import { isRetryableFinalSummaryError } from "../../src/domain/errors";
import { mockQueries } from "../mock";
import { FinanceService, detectFinancialTopic, isFinanceEvidence } from "../services/finance";
import { LLMService } from "../services/llm";
import { SearchService } from "../services/search";
import { EvidenceRegistry } from "./evidenceRegistry";
import { extractEvidenceIds, formatErrorMessage, hostnameOf, isAbortError, parseJsonArray, sourceLanguageBucket, topicLanguageCode, topicLanguageInstruction, truncate, uniqueStrings } from "./utils";

type AgentRole = "pro" | "con" | "moderator";

export type RuntimeToolset = {
  llm: LLMService;
  search: SearchService;
  finance: FinanceService;
  registry: EvidenceRegistry;
  emitEvidence: () => void;
  warn: (message: string) => void;
  checkpoint: (label: string) => Promise<void>;
  assertActive: () => void;
};

export type SharedDebateContext = {
  topic: string;
  messages: DebateMessage[];
  evidence: EvidenceItem[];
  guidance: UserGuidance[];
  moderatorGuidance: ModeratorGuidance[];
};

export class AgentRuntime {
  readonly history: Array<{ role: string; content: string }> = [];
  readonly privateEvidenceIds: string[] = [];
  readonly searchLog: AgentRuntimeState["searchLog"] = [];
  readonly auditLog: AgentRuntimeState["auditLog"] = [];
  readonly memory: string[] = [];

  constructor(
    readonly agent: Exclude<AgentId, "system">,
    readonly role: AgentRole,
    private readonly config: Config,
    private readonly tools: RuntimeToolset,
    private readonly mockMode: boolean
  ) {}

  get label() {
    if (this.agent === "A") return "Pro Agent A";
    if (this.agent === "B") return "Con Agent B";
    return "Moderator Agent C";
  }

  snapshot(): AgentRuntimeState {
    return {
      agent: this.agent,
      label: this.label,
      role: this.role,
      historyLength: this.history.length,
      privateEvidenceIds: [...this.privateEvidenceIds],
      searchLog: [...this.searchLog],
      auditLog: [...this.auditLog],
      memory: [...this.memory]
    };
  }

  async gatherEvidence(round: number, opponentSpeech: string, shared: SharedDebateContext) {
    if (this.agent === "C") return [];
    const queries = await this.generateSearchQueries(round, opponentSpeech, shared);
    const coverageQueries = this.buildCoverageQueries(round, shared);
    const plannedQueries = planSearchQueries(coverageQueries, queries, this.config.queriesPerAgent);
    const collected: EvidenceItem[] = [];
    const financeItems = await this.tools.finance.gather(this.agent, round);
    for (const financeItem of financeItems) {
      const item = this.tools.registry.add(financeItem, this.agent, round, financeItem.query || "financial quote");
      collected.push(item);
      this.noteEvidence(item);
    }
    if (financeItems.length) this.tools.emitEvidence();

    for (const query of plannedQueries) {
      this.tools.assertActive();
      let results: Awaited<ReturnType<SearchService["searchWeb"]>> = [];
      try {
        results = await this.tools.search.searchWeb(query, { agent: this.agent, round });
      } catch (error) {
        if (isAbortError(error)) throw error;
        this.tools.warn(`${this.label} search skipped for "${truncate(query, 90)}": ${formatErrorMessage(error)}`);
        this.searchLog.push({
          round,
          query,
          evidenceIds: [],
          createdAt: new Date().toISOString()
        });
        await this.tools.checkpoint(`after ${this.label} search failure in round ${round}`);
        continue;
      }
      const added: EvidenceItem[] = [];
      for (const result of preferNovelSources(results, this.agent, [...shared.evidence, ...collected])) {
        const item = this.tools.registry.add(result, this.agent, round, query);
        collected.push(item);
        added.push(item);
        this.noteEvidence(item);
      }
      this.searchLog.push({
        round,
        query,
        evidenceIds: added.map((item) => item.id),
        createdAt: new Date().toISOString()
      });
      this.tools.emitEvidence();
      await this.tools.checkpoint(`after ${this.label} searches in round ${round}`);
    }
    return selectBalancedEvidenceForSpeech(collected, shared.evidence, Math.max(5, this.config.searchCount * this.config.queriesPerAgent));
  }

  async speak(round: number, evidence: EvidenceItem[], opponentSpeech: string, shared: SharedDebateContext) {
    if (this.agent === "C") throw new Error("Moderator cannot use debater speak().");
    const side = this.agent === "A" ? "pro" : "con";
    const opponent = this.agent === "A" ? "con" : "pro";
    const systemPrompt = buildDebaterSystemPrompt(this.agent, shared.topic);
    const evidenceBlock = formatEvidenceForPrompt(evidence.length ? evidence : shared.evidence.slice(-10));
    const financeInstruction = detectFinancialTopic(shared.topic)
      ? "Strict financial-data rule: stock price, market cap, P/E, EPS, revenue, profit, and similar figures may only come from structured market evidence whose provider is bocha-ai-search-card or yahoo-finance-chart. State currency and date/retrieval time. Ordinary web search results may only be background material. If no structured market evidence exists, say current market evidence is insufficient and do not cite stale stock prices from webpage snippets."
      : "";
    const rigorInstruction = [
      topicLanguageInstruction(shared.topic),
      "Coverage requirement: cover at least 4 factor categories, choosing from factual data, costs and benefits, risks/failure modes, stakeholders, time horizon, executability, regulation/ethics, and counterexamples/boundary conditions.",
      "Integrity requirement: cite a source ID for every key factual claim; do not overstate evidence, turn correlation into causation, or selectively ignore evidence that hurts your side.",
      "Self-restraint: if the evidence only supports a weak conclusion, use conditional language such as 'possibly', 'under these conditions', or 'the evidence is limited'. Do not invent facts to win the debate."
    ].join("\n");
    const userPrompt = round === 1
      ? [
          `Give your opening argument for round ${round}.`,
          `Your stance: ${side}.`,
          formatUserGuidanceForPrompt(shared.guidance),
          formatModeratorGuidanceForPrompt(shared.moderatorGuidance),
          `Available evidence:\n${evidenceBlock}`,
          financeInstruction,
          rigorInstruction,
          "Requirements: cite at least 2 source IDs; if quantitative relationships are involved, write variables or formulas."
        ].join("\n\n")
      : [
          `Latest ${opponent} speech:\n${opponentSpeech}`,
          formatUserGuidanceForPrompt(shared.guidance),
          formatModeratorGuidanceForPrompt(shared.moderatorGuidance),
          `Available evidence:\n${evidenceBlock}`,
          financeInstruction,
          rigorInstruction,
          "First rebut the opponent's specific claims, then strengthen your stance. Explicitly answer the moderator's previous follow-up. Cite at least 2 source IDs; if quantitative relationships are involved, write variables or formulas."
        ].join("\n\n");

    this.history.push({ role: "user", content: userPrompt });
    const content = await this.tools.llm.call(systemPrompt, this.history, {
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      deepSeekThinking: false,
      debugLabel: `${this.label} speech`
    });
    const revised = await this.reviseIfNeeded(round, content, evidence, systemPrompt, financeInstruction, shared);
    this.history.push({ role: "assistant", content: revised });
    return revised;
  }

  async moderate(round: number, type: "commentary" | "final", shared: SharedDebateContext) {
    if (this.agent !== "C") throw new Error("Only moderator can moderate.");
    const systemPrompt = buildModeratorSystemPrompt(shared.topic);
    if (type !== "final") {
      const content = await this.tools.llm.call(systemPrompt, [{ role: "user", content: buildModeratorContext(round, type, 0, shared) }], {
        maxTokens: this.config.maxTokens,
        temperature: 0.55,
        deepSeekThinking: false,
        debugLabel: "Moderator inter-round commentary"
      });
      this.memory.push(truncate(content, 1200));
      return content;
    }
    try {
      return await this.callFinalModeratorReport(systemPrompt, round, 0, shared, {
        maxTokens: Math.max(2200, this.config.maxTokens),
        temperature: 0.35,
        deepSeekThinking: this.config.deepSeekFinalThinking,
        debugLabel: "Moderator final summary"
      });
    } catch (error) {
      this.tools.warn(`Initial final summary call failed: ${formatErrorMessage(error)}`);
      if (isRetryableFinalSummaryError(error, formatErrorMessage)) {
        try {
          return await this.callFinalModeratorReport(systemPrompt, round, 1, shared, {
            maxTokens: 1800,
            temperature: 0.3,
            deepSeekThinking: false,
            debugLabel: "Moderator final summary retry"
          });
        } catch (retryError) {
          this.tools.warn(`Final summary retry failed: ${formatErrorMessage(retryError)}`);
          return buildFinalSummaryFallbackMarkdown(error, retryError, shared);
        }
      }
      return buildFinalSummaryFallbackMarkdown(error, null, shared);
    }
  }

  private async generateSearchQueries(round: number, opponentSpeech: string, shared: SharedDebateContext) {
    if (this.mockMode) {
      return mockQueries(this.config, this.agent, round);
    }
    const side = this.agent === "A" ? "pro" : "con";
    const systemPrompt = [
      "You are a debate search planner. Output only a JSON string array, with no explanation.",
      "Each query must be suitable for web search and should cover data, cases, definitions, likely attacks from the other side, costs and benefits, risks, boundary conditions, counterexamples, and time trends.",
      "Write queries primarily in the same language and writing system as the topic. Add English or source-native terms only when they improve retrieval for authoritative sources.",
      "For non-English topics, create a balanced mix: about half the queries in the topic language and about half in English for international or English-language sources.",
      "Generate differentiated queries for this side's stance; avoid using exactly the same search terms and source types as the opposing side.",
      "Do not generate only stance-supporting queries. Include at least one query for weaknesses, counterexamples, or limiting conditions.",
      "If the topic involves stock price, market cap, financial reports, revenue, profit, P/E, EPS, or other financial data, queries must include ticker, exchange, currency, today/latest/delayed quote, Yahoo Finance/HKEX/Investing/TradingView, or similar source terms to avoid stale pages."
    ].join("\n");
    const userPrompt = [
      `Topic: ${shared.topic}`,
      `Stance: ${side}`,
      `Round: ${round}`,
      formatUserGuidanceForPrompt(shared.guidance),
      formatModeratorGuidanceForPrompt(shared.moderatorGuidance),
      `Avoid source domains already used by the opposing side: ${opponentDomains(this.agent, shared.evidence).join(", ") || "none"}`,
      opponentSpeech ? `Latest opposing speech: ${opponentSpeech}` : "The opposing side has not spoken yet.",
      `Generate ${this.config.queriesPerAgent} search queries.`
    ].join("\n\n");
    const text = await this.tools.llm.call(systemPrompt, [{ role: "user", content: userPrompt }], {
      maxTokens: 500,
      temperature: 0.2,
      deepSeekThinking: false,
      debugLabel: `${this.label} search planning`
    });
    const parsed = parseJsonArray(text).filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
    if (parsed.length) return uniqueStrings(parsed).slice(0, this.config.queriesPerAgent);
    return this.fallbackQueries(shared.topic);
  }

  private buildCoverageQueries(round: number, shared: SharedDebateContext) {
    const side = this.agent === "A" ? "pro" : "con";
    const opposite = this.agent === "A" ? "con" : "pro";
    const topic = shared.topic;
    const localTerms = localizedSearchTerms(topic, this.agent);
    const englishHints = englishSourceHints(topic);
    const queries = this.agent === "A"
      ? [
          `${topic} ${localTerms.support} ${localTerms.evidence} ${localTerms.benefit} ${localTerms.official}`,
          `${topic} pro supporting evidence benefits costs risks boundary conditions English-language sources ${englishHints}`,
          `${topic} pro quantitative data case study independent analysis international English sources ${englishHints}`,
          `${topic} ${localTerms.support} ${localTerms.quantitative} ${localTerms.caseStudy} ${localTerms.boundary}`
        ]
      : [
          `${topic} ${localTerms.oppose} ${localTerms.risk} ${localTerms.cost} ${localTerms.critical}`,
          `${topic} con risks failure cases costs limits regulation English-language sources ${englishHints}`,
          `${topic} con counterexamples negative impact tradeoff independent analysis international English sources ${englishHints}`,
          `${topic} ${localTerms.oppose} ${localTerms.counterexample} ${localTerms.boundary} ${localTerms.hiddenAssumption}`
        ];
    const guidance = latestGuidanceText(shared.guidance);
    if (guidance) queries.push(`${topic} ${side} user-added factors ${guidance} data counterexamples impact`);
    const moderatorGuidance = latestModeratorGuidanceText(shared.moderatorGuidance);
    if (moderatorGuidance) queries.push(`${topic} ${side} moderator follow-up ${moderatorGuidance} data evidence user behavior key variables`);
    if (round > 1) queries.push(`${topic} ${side} latest rebuttal evidence against ${opposite} source diversity`);
    return uniqueStrings(queries).slice(0, 4);
  }

  private fallbackQueries(topic: string) {
    const side = this.agent === "A" ? "supporting" : "opposing";
    return [
      `${topic} ${side} data research reports`,
      `${topic} ${side} cases controversy risks`
    ].slice(0, this.config.queriesPerAgent);
  }

  private async reviseIfNeeded(round: number, content: string, evidence: EvidenceItem[], systemPrompt: string, financeInstruction: string, shared: SharedDebateContext) {
    const issues = auditSpeech(content, evidence, shared);
    if (!issues.length) return content;
    this.auditLog.push({
      round,
      note: issues.join(" | "),
      createdAt: new Date().toISOString()
    });
    if (this.mockMode) {
      return `${content}\n\nSelf-check addendum: covered evidence, risks, costs/benefits, and boundary conditions; unverified numbers are not used as conclusions.`;
    }
    const evidenceBlock = formatEvidenceForPrompt(evidence);
    const revisionPrompt = [
      "Revise your previous speech to fix the following integrity and coverage issues:",
      issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n"),
      "",
      formatModeratorGuidanceForPrompt(shared.moderatorGuidance),
      "",
      topicLanguageInstruction(shared.topic),
      "",
      `Available evidence:\n${evidenceBlock}`,
      financeInstruction,
      "Revision requirements: keep your stance, but do not fabricate. Cover at least 4 factor categories. Cite a source ID for every key factual claim. If evidence is insufficient, say so clearly. Output only the revised speech."
    ].join("\n\n");
    const revised = await this.tools.llm.call(systemPrompt, [...this.history, { role: "assistant", content }, { role: "user", content: revisionPrompt }], {
      maxTokens: this.config.maxTokens,
      temperature: Math.min(0.4, this.config.temperature),
      deepSeekThinking: false,
      debugLabel: `${this.label} revision`
    });
    return revised || content;
  }

  private async callFinalModeratorReport(systemPrompt: string, round: number, compactLevel: number, shared: SharedDebateContext, options: any) {
    const initial = await this.tools.llm.callResult(systemPrompt, [{ role: "user", content: buildModeratorContext(round, "final", compactLevel, shared) }], options);
    return this.completeFinalReportIfNeeded(systemPrompt, round, compactLevel, shared, initial.content, initial.finishReason);
  }

  private async completeFinalReportIfNeeded(systemPrompt: string, round: number, compactLevel: number, shared: SharedDebateContext, initialContent: string, initialFinishReason: string) {
    let report = initialContent;
    let finishReason = initialFinishReason;
    for (let attempt = 1; attempt <= 2 && isFinalReportIncomplete(report, finishReason); attempt += 1) {
      this.tools.warn(`The final summary appears truncated; requesting continuation (attempt ${attempt}).`);
      const continuation = await this.tools.llm.callResult(systemPrompt, [
        { role: "user", content: buildModeratorContext(round, "final", Math.max(1, compactLevel), shared) },
        { role: "assistant", content: report },
        {
          role: "user",
          content: [
            "The previous final summary appears truncated. Continue from the cutoff point without repeating existing content.",
            topicLanguageInstruction(shared.topic),
            "Complete the Markdown tables, formulas/derivations, root disagreements, balanced assessment, final conclusion, and limitations.",
            "If the previous text ended inside a table, continue the remaining cells and later rows directly. Do not restart the whole report."
          ].join("\n")
        }
      ], {
        maxTokens: 1800,
        temperature: 0.25,
        deepSeekThinking: false,
        debugLabel: `Moderator final summary continuation ${attempt}`
      });
      report = mergeFinalReportContinuation(report, continuation.content);
      finishReason = continuation.finishReason;
    }
    return report;
  }

  private noteEvidence(item: EvidenceItem) {
    if (!this.privateEvidenceIds.includes(item.id)) this.privateEvidenceIds.push(item.id);
  }
}

export function buildDebaterSystemPrompt(agent: AgentId, topic: string) {
  const side = agent === "A" ? "pro" : "con";
  const stance = agent === "A" ? "support the proposition in the topic" : "oppose the proposition in the topic";
  const opponent = agent === "A" ? "con side" : "pro side";
  return [
    `You are debate agent ${agent} (${side}). Your task is to defend the ${side} stance on the topic.`,
    `Topic: ${topic}`,
    `Stance: ${stance}`,
    "",
    "Rules:",
    "1. Each speech must make clear claims supported by evidence, data, logic, cases, or formulas.",
    `2. From round 2 onward, rebut the ${opponent}'s specific prior claims before strengthening your own stance.`,
    "3. Only cite source IDs provided in the user message, such as [S1]. Do not fabricate sources.",
    "4. For quantitative relationships, write formulas or variable definitions, such as ROI=(benefit-cost)/cost.",
    "5. Financial and stock-price data may only come from structured market evidence, preferably providers bocha-ai-search-card or yahoo-finance-chart. Ordinary web results may only be background material and must not be treated as current stock prices.",
    "6. Do not report real-time stock price, market cap, P/E, EPS, revenue, profit, or similar figures from model memory. If no reliable current source exists, explicitly say the evidence is insufficient.",
    "7. Coverage: discuss evidence supporting your side, counterexamples or boundary conditions against your side, costs and benefits, risks, and time horizon. Do not focus on only one factor.",
    "8. Integrity: do not fabricate data, misquote sources, present old data as current, turn webpage summaries into official facts, or state correlation as causation.",
    "9. If the user message contains moderator follow-up/guidance, answer it in a separate paragraph and explain whether new evidence supports your stance.",
    "10. Be sharp but rational. No personal attacks.",
    `11. ${topicLanguageInstruction(topic)} Target 260-420 English-equivalent words, or a comparable length in the target language.`
  ].join("\n");
}

export function buildModeratorSystemPrompt(topic: string) {
  return [
    "You are the debate moderator (agent C). You are neutral, professional, and incisive.",
    `Topic: ${topic}`,
    "",
    "You have two modes:",
    "[Inter-round commentary] Summarize the current core disagreement, judge which side is more persuasive, and propose one new follow-up angle in about 150-220 words.",
    "[Final summary] Output a Markdown research report containing both sides' core arguments, key evidence, formulas/derivations, root disagreements, reconcilable disagreements, balanced assessment, final conclusion, and limitations.",
    "All citations must use source IDs such as [S1]. Do not fabricate evidence.",
    "For financial, stock-price, or market data, state currency, date/retrieval time, and source conflicts. Do not treat old data as real-time data.",
    "Also evaluate whether both sides were comprehensive and honest with evidence. Call out assertions that were not supported by evidence.",
    topicLanguageInstruction(topic)
  ].join("\n");
}

function auditSpeech(content: string, evidence: EvidenceItem[], shared: SharedDebateContext) {
  const issues: string[] = [];
  const citedIds = extractEvidenceIds(content);
  const availableIds = new Set((evidence || []).map((item) => item.id));
  const validCitations = citedIds.filter((id) => availableIds.has(id));
  if (validCitations.length < Math.min(2, (evidence || []).length)) {
    issues.push("Not enough valid citations. Cite at least 2 sources available in this round.");
  }
  const factorHits = [
    /data|evidence|fact|case|study|research|report|数据|证据|事实|案例|研究|报告/i,
    /cost|benefit|ROI|efficien|input|output|profit|revenue|成本|收益|效率|投入|产出|利润|收入/i,
    /risk|fail|side effect|uncertain|limit|boundary|counterexample|风险|失败|副作用|不确定|局限|边界|反例/i,
    /user|enterprise|employee|regulat|society|consumer|stakeholder|用户|企业|员工|监管|社会|消费者|利益相关/i,
    /short[- ]term|long[- ]term|trend|stage|time|cycle|短期|长期|趋势|阶段|时间|周期/i,
    /execution|implement|feasib|operation|organization|process|执行|落地|可行|操作|组织|流程/i
  ].filter((pattern) => pattern.test(content)).length;
  if (factorHits < 4) {
    issues.push("The argument is not broad enough. Cover at least 4 of factual data, costs/benefits, risk boundaries, stakeholders, time horizon, and execution feasibility.");
  }
  if (detectFinancialTopic(shared.topic) && /\d+(\.\d+)?\s*(港币|HKD|人民币|CNY|美元|USD|%|倍)/i.test(content)) {
    const financeIds = new Set((evidence || []).filter(isFinanceEvidence).map((item) => item.id));
    if (!citedIds.some((id) => financeIds.has(id))) {
      issues.push("Financial numbers appear without citing structured market evidence. Do not use ordinary webpage snippets or model memory as current market data.");
    }
  }
  if (/obvious|inevitable|certainly|completely|absolute|without doubt|显然|必然|一定|完全|绝对|毫无疑问/i.test(content) && !/condition|premise|limited evidence|possibly|depends|条件|前提|证据有限|可能|取决于/i.test(content)) {
    issues.push("The wording is too absolute. State the applicable conditions or evidence limits.");
  }
  if (latestModeratorGuidanceText(shared.moderatorGuidance) && !/moderator|follow-up|guidance|respond|answer|主持人|追问|引导|回应/i.test(content)) {
    issues.push("The speech does not explicitly answer the moderator's inter-round follow-up. Add a separate response explaining whether evidence supports the new direction.");
  }
  return issues;
}

function buildModeratorContext(round: number, type: "commentary" | "final", compactLevel: number, shared: SharedDebateContext) {
  const isFinal = type === "final";
  const messageLimit = isFinal ? (compactLevel > 0 ? 500 : 900) : 700;
  const evidenceLimit = isFinal ? (compactLevel > 0 ? 60 : 90) : 30;
  const evidenceSummaryLimit = isFinal ? (compactLevel > 0 ? 120 : 180) : 140;
  return [
    `Topic: ${shared.topic}`,
    topicLanguageInstruction(shared.topic),
    "",
    formatUserGuidanceForPrompt(shared.guidance),
    "",
    `Debate transcript through round ${round}${compactLevel > 0 ? " (compact version)" : ""}:`,
    formatDebateTranscriptForModerator(shared.messages, messageLimit),
    "",
    "Evidence pool:",
    formatEvidenceForModerator(selectEvidenceForModerator(shared, evidenceLimit), evidenceSummaryLimit),
    "",
    isFinal
      ? "Write the final summary as a Markdown research report in the required output language. Include both sides' core arguments, an evidence table, a formulas/derivations table, root disagreements, reconcilable disagreements, balanced assessment, final conclusion, and limitations."
      : "Write inter-round commentary in the required output language: summarize the core disagreement, identify which side is currently more persuasive, and propose the next follow-up angle."
  ].join("\n");
}

function buildFinalSummaryFallbackMarkdown(firstError: unknown, retryError: unknown, shared: SharedDebateContext) {
  const errors = [firstError, retryError].filter(Boolean).map(formatErrorMessage);
  const evidence = selectEvidenceForModerator(shared, 20);
  const labels = fallbackLabels(shared.topic);
  return [
    `# ${labels.title}`,
    "",
    labels.disclaimer,
    "",
    `## ${labels.failureReasons}`,
    "",
    ...errors.map((error) => `- ${error}`),
    "",
    `## ${labels.possibleCauses}`,
    "",
    ...labels.causes.map((cause) => `- ${cause}`),
    "",
    `## ${labels.availableEvidence}`,
    "",
    evidence.length
      ? evidence.map((item) => `- [${item.id}] ${item.title}${item.url ? ` ${item.url}` : ""}`).join("\n")
      : `- ${labels.noEvidence}`,
    "",
    `## ${labels.suggestionsTitle}`,
    "",
    ...labels.suggestions.map((suggestion) => `- ${suggestion}`)
  ].join("\n");
}

function fallbackLabels(topic: string) {
  switch (topicLanguageCode(topic)) {
    case "zh-Hans":
      return {
        title: "最终总结调用失败",
        disclaimer: "模型没有生成最终总结。以下内容是本地生成的失败说明，不代表主持人模型判断。",
        failureReasons: "失败原因",
        possibleCauses: "可能原因",
        causes: ["最终总结请求体过大，或服务商连接被中断。", "服务商超时、余额或资源不足，或临时限流。"],
        availableEvidence: "可用证据摘录",
        noEvidence: "没有可用证据。",
        suggestionsTitle: "建议",
        suggestions: ["减少辩论轮数或每次查询结果数量后重试。", "关闭 DeepSeek 最终总结思考模式后重试。"]
      };
    case "zh-Hant":
      return {
        title: "最終總結呼叫失敗",
        disclaimer: "模型沒有生成最終總結。以下內容是本地生成的失敗說明，不代表主持人模型判斷。",
        failureReasons: "失敗原因",
        possibleCauses: "可能原因",
        causes: ["最終總結請求體過大，或服務商連線被中斷。", "服務商逾時、餘額或資源不足，或暫時限流。"],
        availableEvidence: "可用證據摘錄",
        noEvidence: "沒有可用證據。",
        suggestionsTitle: "建議",
        suggestions: ["減少辯論輪數或每次查詢結果數量後重試。", "關閉 DeepSeek 最終總結思考模式後重試。"]
      };
    case "ja":
      return {
        title: "最終サマリー呼び出しに失敗しました",
        disclaimer: "モデルは最終サマリーを生成できませんでした。以下はローカルで生成した失敗メモであり、Moderator モデルの判断ではありません。",
        failureReasons: "失敗理由",
        possibleCauses: "考えられる原因",
        causes: ["最終サマリーのリクエストが大きすぎた、またはプロバイダー接続が中断されました。", "プロバイダーがタイムアウトした、残高やリソースが不足した、または一時的に rate limit されました。"],
        availableEvidence: "利用可能な証拠抜粋",
        noEvidence: "利用可能な証拠はありません。",
        suggestionsTitle: "提案",
        suggestions: ["討論ラウンド数またはクエリごとの結果数を減らして再試行してください。", "DeepSeek の最終サマリー thinking を無効にして再試行してください。"]
      };
    case "ko":
      return {
        title: "최종 요약 호출 실패",
        disclaimer: "모델이 최종 요약을 생성하지 못했습니다. 아래 내용은 로컬에서 생성한 실패 메모이며 Moderator 모델의 판단이 아닙니다.",
        failureReasons: "실패 이유",
        possibleCauses: "가능한 원인",
        causes: ["최종 요약 요청 본문이 너무 크거나 provider 연결이 중단되었습니다.", "provider가 timeout, 잔액 또는 리소스 부족, 임시 rate limit 상태였을 수 있습니다."],
        availableEvidence: "사용 가능한 근거 발췌",
        noEvidence: "사용 가능한 근거가 없습니다.",
        suggestionsTitle: "제안",
        suggestions: ["토론 라운드 수 또는 query당 결과 수를 줄인 뒤 다시 시도하세요.", "DeepSeek 최종 요약 thinking을 끄고 다시 시도하세요."]
      };
    default:
      return {
        title: "Final Summary Call Failed",
        disclaimer: "The model did not generate the final summary. The content below is a locally generated failure note and does not represent the moderator model's judgment.",
        failureReasons: "Failure Reasons",
        possibleCauses: "Possible Causes",
        causes: ["The final summary request body was too large, or the provider connection was interrupted.", "The provider timed out, had insufficient balance/resources, or temporarily rate-limited the request."],
        availableEvidence: "Available Evidence Excerpts",
        noEvidence: "No available evidence.",
        suggestionsTitle: "Suggestions",
        suggestions: ["Retry with fewer debate rounds or fewer results per query.", "Retry with DeepSeek thinking disabled for the final summary."]
      };
  }
}

export function formatUserGuidanceForPrompt(guidance: UserGuidance[]) {
  if (!Array.isArray(guidance) || guidance.length === 0) return "User-provided additional factors: none.";
  return [
    "User-provided additional factors (must be included in later search, rebuttal, and summary):",
    ...guidance.slice(-6).map((item) => `- ${item.id} (added in round ${item.round}): ${item.text}`)
  ].join("\n");
}

export function formatModeratorGuidanceForPrompt(guidance: ModeratorGuidance[]) {
  if (!Array.isArray(guidance) || guidance.length === 0) return "Moderator follow-up/guidance: none.";
  return [
    "Moderator follow-up/guidance (both sides must answer it next round and search accordingly):",
    ...guidance.slice(-3).map((item) => `- ${item.id} (moderator in round ${item.round}): ${item.content}`)
  ].join("\n");
}

function latestGuidanceText(guidance: UserGuidance[]) {
  if (!Array.isArray(guidance) || guidance.length === 0) return "";
  return guidance.slice(-3).map((item) => item.text).join("; ");
}

function latestModeratorGuidanceText(guidance: ModeratorGuidance[]) {
  if (!Array.isArray(guidance) || guidance.length === 0) return "";
  return guidance.slice(-2).map((item) => item.content).join("; ");
}

function opponentDomains(agent: AgentId, evidence: EvidenceItem[]) {
  const opponent = agent === "A" ? "B" : "A";
  return Array.from(new Set(
    evidence
      .filter((item) => evidenceUsedBy(item, opponent))
      .map((item) => hostnameOf(item.url))
      .filter(Boolean)
  )).slice(0, 8);
}

function planSearchQueries(coverageQueries: string[], generatedQueries: string[], queriesPerAgent: number) {
  const maxQueries = Math.max(4, Math.min(7, Number(queriesPerAgent || 2) + 3));
  return uniqueStrings([
    ...coverageQueries.slice(0, 2),
    ...generatedQueries,
    ...coverageQueries.slice(2)
  ]).slice(0, maxQueries);
}

function localizedSearchTerms(topic: string, agent: AgentId) {
  const code = topicLanguageCode(topic);
  if (code === "zh-Hant") {
    return {
      support: agent === "A" ? "正方 支持 證據" : "反方 批判 證據",
      oppose: "反方 風險 反例",
      evidence: "資料 研究 報告",
      benefit: "收益 效率 增長",
      official: "官方 研報 財報 權威來源",
      quantitative: "量化資料 指標",
      caseStudy: "案例研究",
      boundary: "邊界條件 限制",
      risk: "風險 失敗案例",
      cost: "成本 代價",
      critical: "批判分析",
      counterexample: "反例 負面影響",
      hiddenAssumption: "隱含假設 證據不足"
    };
  }
  if (code === "zh-Hans") {
    return {
      support: agent === "A" ? "正方 支持 证据" : "反方 批判 证据",
      oppose: "反方 风险 反例",
      evidence: "数据 研究 报告",
      benefit: "收益 效率 增长",
      official: "官方 研报 财报 权威来源",
      quantitative: "量化数据 指标",
      caseStudy: "案例研究",
      boundary: "边界条件 限制",
      risk: "风险 失败案例",
      cost: "成本 代价",
      critical: "批判分析",
      counterexample: "反例 负面影响",
      hiddenAssumption: "隐含假设 证据不足"
    };
  }
  if (code === "ja") {
    return {
      support: agent === "A" ? "賛成 根拠" : "反対 批判 根拠",
      oppose: "反対 リスク 反例",
      evidence: "データ 研究 レポート",
      benefit: "便益 効率 成長",
      official: "公式 レポート 権威ある出典",
      quantitative: "定量データ 指標",
      caseStudy: "ケーススタディ",
      boundary: "境界条件 限界",
      risk: "リスク 失敗事例",
      cost: "コスト",
      critical: "批判的分析",
      counterexample: "反例 悪影響",
      hiddenAssumption: "隠れた前提 証拠不足"
    };
  }
  if (code === "ko") {
    return {
      support: agent === "A" ? "찬성 근거" : "반대 비판 근거",
      oppose: "반대 위험 반례",
      evidence: "데이터 연구 보고서",
      benefit: "편익 효율 성장",
      official: "공식 보고서 권위 있는 출처",
      quantitative: "정량 데이터 지표",
      caseStudy: "사례 연구",
      boundary: "경계 조건 한계",
      risk: "위험 실패 사례",
      cost: "비용",
      critical: "비판 분석",
      counterexample: "반례 부정적 영향",
      hiddenAssumption: "숨은 가정 근거 부족"
    };
  }
  return {
    support: agent === "A" ? "pro supporting evidence" : "con critical evidence",
    oppose: "con risks counterexamples",
    evidence: "data research reports",
    benefit: "benefits efficiency growth",
    official: "official reports authoritative sources",
    quantitative: "quantitative data metrics",
    caseStudy: "case study",
    boundary: "boundary conditions limitations",
    risk: "risks failure cases",
    cost: "costs tradeoffs",
    critical: "critical analysis",
    counterexample: "counterexamples negative impact",
    hiddenAssumption: "hidden assumptions insufficient evidence"
  };
}

function englishSourceHints(topic: string) {
  if (detectFinancialTopic(topic)) {
    return "Reuters Bloomberg Financial Times Yahoo Finance MarketWatch SEC filing HKEX annual report";
  }
  return "Reuters AP BBC academic paper official report industry report";
}

function preferNovelSources<T extends { url?: string; title?: string; snippet?: string; summary?: string; query?: string }>(results: T[], agent: AgentId, evidence: EvidenceItem[]) {
  const opponent = agent === "A" ? "B" : "A";
  const opponentUrls = new Set(
    evidence
      .filter((item) => evidenceUsedBy(item, opponent))
      .map((item) => item.url)
      .filter(Boolean)
  );
  const fresh: T[] = [];
  const repeated: T[] = [];
  for (const result of results) {
    if (result.url && opponentUrls.has(result.url)) repeated.push(result);
    else fresh.push(result);
  }
  return interleaveBySourceLanguage([...fresh, ...repeated], evidence);
}

function evidenceUsedBy(item: EvidenceItem, agent: AgentId) {
  const uses = Array.isArray(item.uses) ? item.uses : [];
  return uses.some((use) => use.agent === agent) || item.agent === agent;
}

function selectBalancedEvidenceForSpeech(items: EvidenceItem[], existingEvidence: EvidenceItem[], limit: number) {
  const finance = items.filter(isFinanceEvidence);
  const rest = items.filter((item) => !isFinanceEvidence(item));
  const selected: EvidenceItem[] = [];
  for (const item of finance) {
    if (selected.length >= limit) break;
    if (!selected.some((existing) => existing.id === item.id)) selected.push(item);
  }
  for (const item of interleaveBySourceLanguage(rest, existingEvidence)) {
    if (selected.length >= limit) break;
    if (!selected.some((existing) => existing.id === item.id)) selected.push(item);
  }
  return selected;
}

function interleaveBySourceLanguage<T extends { title?: string; url?: string; snippet?: string; summary?: string; query?: string }>(items: T[], existingEvidence: EvidenceItem[] = []) {
  const groups = {
    zh: [] as T[],
    en: [] as T[],
    other: [] as T[],
    unknown: [] as T[]
  };
  for (const item of items) {
    groups[sourceLanguageBucket(item)].push(item);
  }
  const existingZh = existingEvidence.filter((item) => sourceLanguageBucket(item) === "zh").length;
  const existingEn = existingEvidence.filter((item) => sourceLanguageBucket(item) === "en").length;
  const order: Array<keyof typeof groups> = existingZh > existingEn ? ["en", "zh", "other", "unknown"] : ["zh", "en", "other", "unknown"];
  const output: T[] = [];
  while (output.length < items.length) {
    let moved = false;
    for (const bucket of order) {
      const item = groups[bucket].shift();
      if (item) {
        output.push(item);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return output;
}

function formatEvidenceForPrompt(items: EvidenceItem[]) {
  if (!items || items.length === 0) return "No evidence yet.";
  return items.map((item) => {
    const summary = item.summary || item.snippet || "No summary";
    const url = item.url ? `\nURL: ${item.url}` : "";
    return `[${item.id}] ${item.title}${url}\nSource: ${item.provider}; source time: ${item.publishedAt || "unknown"}; retrieved at: ${item.retrievedAt || "unknown"}; summary: ${truncate(summary, 520)}`;
  }).join("\n\n");
}

function formatDebateTranscriptForModerator(messages: DebateMessage[], messageLimit: number) {
  if (!messages || messages.length === 0) return "None yet.";
  return messages
    .filter((message) => message.type !== "error")
    .map((message) => `[${labelForMessage(message)} · round ${message.round}]\n${truncate(message.content, messageLimit)}`)
    .join("\n\n");
}

function selectEvidenceForModerator(shared: SharedDebateContext, limit: number) {
  const cited = new Set<string>();
  for (const message of shared.messages) {
    for (const id of [...(message.evidenceIds || []), ...extractEvidenceIds(message.content)]) {
      cited.add(id);
    }
  }
  return shared.evidence.map((item, index) => {
    let score = index / 1000;
    if (cited.has(item.id)) score += 100;
    if (isFinanceEvidence(item)) score += 60;
    if (/bocha-ai-search-card|yahoo-finance-chart/.test(item.provider || "")) score += 25;
    score += (Array.isArray(item.uses) ? item.uses.length : 0) * 4;
    score += Math.max(0, index - shared.evidence.length + 20);
    return { item, score };
  }).sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.item);
}

function formatEvidenceForModerator(items: EvidenceItem[], summaryLimit: number) {
  if (!items || items.length === 0) return "No evidence yet.";
  return items.map((item) => {
    const summary = item.summary || item.snippet || "No summary";
    const url = item.url ? `\nURL: ${item.url}` : "";
    return `[${item.id}] ${item.title}${url}\nSource: ${item.provider}; source time: ${item.publishedAt || "unknown"}; retrieved at: ${item.retrievedAt || "unknown"}; summary: ${truncate(summary, summaryLimit)}`;
  }).join("\n\n");
}

function labelForMessage(message: DebateMessage) {
  if (message.type === "error") return "Error";
  if (message.agent === "A") return "Pro A";
  if (message.agent === "B") return "Con B";
  if (message.agent === "C" && message.type === "final") return "Moderator C Final Summary";
  if (message.agent === "C") return "Moderator C";
  return "System";
}
