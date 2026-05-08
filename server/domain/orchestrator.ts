import type { Response } from "express";
import type { AgentId, Config, DebateMessage, DebateRecord, DebateSessionEvent, DebateSessionSnapshot, EvidenceItem, ModeratorGuidance, UserGuidance } from "../../src/types";
import { isAbortError, escapeMdTable, extractEvidenceIds, formatErrorMessage, safeFileName, topicLanguageCode, truncate } from "./utils";
import { createFetchWithTimeout } from "../services/http";
import { LLMService } from "../services/llm";
import { SearchService } from "../services/search";
import { FinanceService } from "../services/finance";
import { AgentRuntime, SharedDebateContext } from "./agents";
import { EvidenceRegistry } from "./evidenceRegistry";

export class DebateSession {
  readonly id: string;
  readonly record: DebateRecord;
  private readonly clients = new Set<Response>();
  private readonly controller = new AbortController();
  private readonly registry = new EvidenceRegistry();
  private readonly agents: Record<"A" | "B" | "C", AgentRuntime>;
  private paused = false;
  private pauseRequested = false;
  private pauseResolver: null | (() => void) = null;
  private stopped = false;
  private running = false;

  constructor(readonly config: Config, readonly mockMode: boolean) {
    this.id = `D${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    this.record = {
      topic: config.topic,
      totalRounds: config.rounds,
      currentRound: 0,
      startedAt: new Date().toISOString(),
      endedAt: "",
      configSummary: {
        provider: config.provider,
        apiFormat: config.apiFormat,
        baseURL: config.baseURL,
        model: config.model,
        searchProvider: config.searchProvider,
        searchCount: config.searchCount,
        freshness: config.freshness,
        queriesPerAgent: config.queriesPerAgent
      },
      messages: [],
      evidence: this.registry.list(),
      guidance: [],
      moderatorGuidance: [],
      warnings: [],
      finalReport: "",
      agentStates: {}
    };

    const fetchWithTimeout = createFetchWithTimeout(
      () => this.config.timeoutSeconds,
      () => this.controller.signal
    );
    const llm = new LLMService(config, fetchWithTimeout, mockMode);
    const toolset = {
      llm,
      registry: this.registry,
      emitEvidence: () => this.emitEvidence(),
      warn: (message: string) => this.addWarning(message),
      checkpoint: (label: string) => this.checkpointPause(label),
      assertActive: () => this.assertActive()
    };
    const search = new SearchService(config, fetchWithTimeout, llm, mockMode, (message) => this.appendSystemError(message));
    const finance = new FinanceService(config, fetchWithTimeout, search, mockMode, (message) => this.addWarning(message));
    this.agents = {
      A: new AgentRuntime("A", "pro", config, { ...toolset, search, finance }, mockMode),
      B: new AgentRuntime("B", "con", config, { ...toolset, search, finance }, mockMode),
      C: new AgentRuntime("C", "moderator", config, { ...toolset, search, finance }, mockMode)
    };
    this.syncAgentStates();
  }

  snapshot(): DebateSessionSnapshot {
    this.syncAgentStates();
    return {
      id: this.id,
      debate: this.record
    };
  }

  addClient(response: Response) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.write("\n");
    this.clients.add(response);
    response.on("close", () => {
      this.clients.delete(response);
    });
    this.send(response, { type: "status", message: this.running ? "Connected to running debate session." : "Connected to debate session." });
    this.send(response, { type: "evidence", evidence: this.record.evidence });
  }

  async start() {
    if (this.running) return;
    this.running = true;
    try {
      for (let round = 1; round <= this.config.rounds; round += 1) {
        this.assertActive();
        this.record.currentRound = round;
        this.emit({ type: "progress", done: round - 1, total: this.config.rounds, round });
        await this.checkpointPause(`before round ${round}`);

        const latestB = this.latestMessageByAgent("B");
        this.emit({ type: "status", message: `Round ${round}: pro agent A is searching for evidence.` });
        const aEvidence = await this.agents.A.gatherEvidence(round, latestB ? latestB.content : "", this.sharedContext());
        this.emit({ type: "status", message: `Round ${round}: pro agent A is composing its argument.` });
        const aContent = await this.agents.A.speak(round, aEvidence, latestB ? latestB.content : "", this.sharedContext());
        this.appendMessage({
          agent: "A",
          round,
          type: "speech",
          content: aContent,
          evidenceIds: mergeEvidenceIds(aEvidence, aContent)
        });
        await this.checkpointPause(`after pro agent A speaks in round ${round}`);

        this.emit({ type: "status", message: `Round ${round}: con agent B is searching for rebuttal evidence.` });
        const bEvidence = await this.agents.B.gatherEvidence(round, aContent, this.sharedContext());
        this.emit({ type: "status", message: `Round ${round}: con agent B is preparing its rebuttal.` });
        const bContent = await this.agents.B.speak(round, bEvidence, aContent, this.sharedContext());
        this.appendMessage({
          agent: "B",
          round,
          type: "speech",
          content: bContent,
          evidenceIds: mergeEvidenceIds(bEvidence, bContent)
        });
        await this.checkpointPause(`after con agent B speaks in round ${round}`);

        const moderatorType = round === this.config.rounds ? "final" : (round % 2 === 0 ? "commentary" : null);
        if (moderatorType) {
          this.emit({ type: "status", message: moderatorType === "final" ? "Moderator C is generating the final research report." : "Moderator C is writing inter-round commentary." });
          const cContent = await this.agents.C.moderate(round, moderatorType, this.sharedContext());
          if (moderatorType === "final") {
            this.record.finalReport = cContent;
            this.emit({ type: "finalReport", finalReport: cContent });
          } else {
            this.appendMessage({
              agent: "C",
              round,
              type: moderatorType,
              content: cContent,
              evidenceIds: mergeEvidenceIds(this.record.evidence.slice(-8), cContent)
            });
            this.rememberModeratorGuidance(round, cContent);
          }
          await this.checkpointPause(`after ${moderatorType === "final" ? "the final summary" : "moderator commentary"}`);
        }

        this.emit({ type: "progress", done: round, total: this.config.rounds, round });
      }
      this.record.endedAt = new Date().toISOString();
      this.running = false;
      this.emit({ type: "status", message: "Debate complete." });
      this.emit({ type: "complete", debate: this.snapshot().debate });
    } catch (error) {
      this.running = false;
      if (isAbortError(error) || this.stopped) {
        this.appendMessage({
          agent: "system",
          round: this.record.currentRound || 0,
          type: "error",
          content: "The user stopped the current debate.",
          evidenceIds: []
        });
        this.emit({ type: "status", message: "Debate stopped." });
        this.emit({ type: "complete", debate: this.snapshot().debate });
      } else {
        const message = formatErrorMessage(error);
        this.appendSystemError(message);
        this.emit({ type: "error", message, debate: this.snapshot().debate });
      }
    }
  }

  pause() {
    if (!this.running || this.paused) return;
    this.pauseRequested = true;
    this.emit({ type: "status", message: "Pause requested. The debate will pause after the current API call finishes." });
  }

  resume(guidanceText?: string) {
    if (guidanceText && guidanceText.trim()) {
      this.appendUserGuidance(guidanceText.trim());
    }
    if (this.pauseResolver) this.pauseResolver();
  }

  stop() {
    this.stopped = true;
    this.pauseRequested = false;
    this.paused = false;
    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
    }
    this.controller.abort();
  }

  exportMarkdown() {
    return buildMarkdown(this.record);
  }

  exportFileName() {
    return `debate-${safeFileName(this.record.topic)}.md`;
  }

  private async checkpointPause(label: string) {
    this.assertActive();
    if (!this.pauseRequested) return;
    this.pauseRequested = false;
    this.paused = true;
    this.emit({ type: "paused", label });
    this.emit({ type: "status", message: `Paused: ${label}. You can add new factors, then resume.` });
    await new Promise<void>((resolve) => {
      this.pauseResolver = resolve;
    });
    this.assertActive();
    this.paused = false;
    this.pauseResolver = null;
    this.emit({ type: "status", message: "Resuming debate." });
  }

  private assertActive() {
    if (this.stopped || this.controller.signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  }

  private appendMessage(message: Omit<DebateMessage, "id" | "createdAt"> | DebateMessage) {
    const record: DebateMessage = {
      id: `M${this.record.messages.length + 1}`,
      createdAt: new Date().toISOString(),
      evidenceIds: [],
      ...message
    };
    this.record.messages.push(record);
    this.syncAgentStates();
    this.emit({ type: "message", message: record });
  }

  private appendSystemError(content: string) {
    this.appendMessage({
      agent: "system",
      round: this.record.currentRound || 0,
      type: "error",
      content,
      evidenceIds: []
    });
  }

  private appendUserGuidance(text: string) {
    const item: UserGuidance = {
      id: `G${this.record.guidance.length + 1}`,
      text,
      round: this.record.currentRound || 0,
      createdAt: new Date().toISOString()
    };
    this.record.guidance.push(item);
    this.appendMessage({
      agent: "system",
      round: item.round,
      type: "guidance",
      content: `User-provided additional factors (${item.id}): ${text}`,
      evidenceIds: []
    });
  }

  private rememberModeratorGuidance(round: number, content: string) {
    const item: ModeratorGuidance = {
      id: `C${this.record.moderatorGuidance.length + 1}`,
      round,
      content: extractModeratorGuidance(content),
      createdAt: new Date().toISOString()
    };
    if (!item.content) return;
    this.record.moderatorGuidance.push(item);
  }

  private addWarning(message: string) {
    if (!message || this.record.warnings.includes(message)) return;
    this.record.warnings.push(message);
    this.emit({ type: "warning", warning: message, warnings: [...this.record.warnings] });
  }

  private emitEvidence() {
    this.record.evidence = this.registry.list();
    this.emit({ type: "evidence", evidence: this.record.evidence });
  }

  private latestMessageByAgent(agent: AgentId) {
    for (let i = this.record.messages.length - 1; i >= 0; i -= 1) {
      if (this.record.messages[i].agent === agent) return this.record.messages[i];
    }
    return null;
  }

  private sharedContext(): SharedDebateContext {
    return {
      topic: this.record.topic,
      messages: this.record.messages,
      evidence: this.record.evidence,
      guidance: this.record.guidance,
      moderatorGuidance: this.record.moderatorGuidance
    };
  }

  private syncAgentStates() {
    this.record.agentStates = {
      A: this.agents?.A.snapshot(),
      B: this.agents?.B.snapshot(),
      C: this.agents?.C.snapshot()
    };
  }

  private emit(event: DebateSessionEvent) {
    this.syncAgentStates();
    for (const client of this.clients) {
      this.send(client, event);
    }
  }

  private send(response: Response, event: DebateSessionEvent) {
    response.write(`event: ${event.type}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function extractModeratorGuidance(content: string) {
  const text = String(content || "").trim();
  const match = text.match(/(?:next(?:\s+question|\s+focus|\s+angle)?|follow-up|下一步(?:追问|关注|检验)?(?:角度|方向|问题)?|追问角度|后续(?:追问|检验|关注))(?:[:：\s]*)([\s\S]+)$/i);
  const extracted = match ? match[1] : text;
  return truncate(
    extracted
      .replace(/^#+\s*/gm, "")
      .replace(/\*\*/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    900
  );
}

function mergeEvidenceIds(evidenceItems: EvidenceItem[], text: string) {
  const fromEvidence = (evidenceItems || []).map((item) => item && item.id).filter(Boolean);
  return Array.from(new Set([...fromEvidence, ...extractEvidenceIds(text)]));
}

function buildMarkdown(debate: DebateRecord) {
  const labels = exportLabels(debate.topic);
  const lines: string[] = [];
  lines.push(`# ${labels.reportTitle}: ${debate.topic}`);
  lines.push("");
  lines.push(`- ${labels.started}: ${debate.startedAt}`);
  lines.push(`- ${labels.ended}: ${debate.endedAt || labels.incomplete}`);
  lines.push(`- LLM: ${debate.configSummary.provider} / ${debate.configSummary.model}`);
  lines.push(`- ${labels.apiFormat}: ${debate.configSummary.apiFormat}`);
  lines.push(`- ${labels.searchMode}: ${debate.configSummary.searchProvider}`);
  lines.push("");
  if (debate.finalReport) {
    lines.push(`## ${labels.finalConclusion}`);
    lines.push("");
    lines.push(debate.finalReport);
    lines.push("");
  }
  if (Array.isArray(debate.guidance) && debate.guidance.length) {
    lines.push(`## ${labels.userFactors}`);
    lines.push("");
    for (const item of debate.guidance) {
      lines.push(`- ${item.id} · ${labels.round} ${item.round} · ${item.createdAt}: ${item.text}`);
    }
    lines.push("");
  }
  if (Array.isArray(debate.moderatorGuidance) && debate.moderatorGuidance.length) {
    lines.push(`## ${labels.moderatorGuidance}`);
    lines.push("");
    for (const item of debate.moderatorGuidance) {
      lines.push(`- ${item.id} · ${labels.round} ${item.round} · ${item.createdAt}: ${item.content}`);
    }
    lines.push("");
  }
  if (Array.isArray(debate.warnings) && debate.warnings.length) {
    lines.push(`## ${labels.warnings}`);
    lines.push("");
    for (const warning of debate.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }
  lines.push(`## ${labels.evidenceTable}`);
  lines.push("");
  lines.push(`| ID | Provider | ${labels.title} | URL | ${labels.sourceTime} | ${labels.retrievedAt} | ${labels.summary} |`);
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const item of debate.evidence) {
    lines.push(`| ${item.id} | ${escapeMdTable(item.provider)} | ${escapeMdTable(item.title)} | ${escapeMdTable(item.url)} | ${escapeMdTable(item.publishedAt || "unknown")} | ${escapeMdTable(item.retrievedAt || "unknown")} | ${escapeMdTable(item.summary || item.snippet)} |`);
  }
  lines.push("");
  lines.push(`## ${labels.sourceAttribution}`);
  lines.push("");
  lines.push(`| ${labels.source} | ${labels.foundUsedBy} | Query |`);
  lines.push("| --- | --- | --- |");
  for (const item of debate.evidence) {
    const uses = Array.isArray(item.uses) && item.uses.length ? item.uses : [{ agent: item.agent, round: item.round, query: item.query }];
    for (const use of uses) {
      lines.push(`| ${item.id} | ${escapeMdTable(`${use.agent} ${labels.round} ${use.round}`)} | ${escapeMdTable(use.query)} |`);
    }
  }
  lines.push("");
  lines.push(`## ${labels.fullTranscript}`);
  lines.push("");
  for (const message of debate.messages.filter((item) => !(item.agent === "C" && item.type === "final"))) {
    lines.push(`### ${labelForMessage(message, labels)} · ${labels.round} ${message.round}`);
    lines.push("");
    lines.push(message.content);
    lines.push("");
  }
  return lines.join("\n");
}

function labelForMessage(message: DebateMessage, labels = exportLabels("")) {
  if (message.type === "error") return labels.error;
  if (message.agent === "A") return labels.proA;
  if (message.agent === "B") return labels.conB;
  if (message.agent === "C" && message.type === "final") return labels.moderatorFinal;
  if (message.agent === "C") return labels.moderatorC;
  return labels.system;
}

function exportLabels(topic: string) {
  switch (topicLanguageCode(topic)) {
    case "zh-Hans":
      return {
        reportTitle: "辩论研究报告",
        started: "开始时间",
        ended: "结束时间",
        incomplete: "未完成",
        apiFormat: "API 格式",
        searchMode: "搜索模式",
        finalConclusion: "主持人最终结论",
        userFactors: "用户补充因素",
        moderatorGuidance: "主持人轮间引导",
        warnings: "运行警告",
        evidenceTable: "证据表",
        title: "标题",
        sourceTime: "来源时间",
        retrievedAt: "检索时间",
        summary: "摘要",
        sourceAttribution: "来源归属",
        source: "来源",
        foundUsedBy: "发现/使用方",
        fullTranscript: "完整辩论记录",
        round: "轮次",
        error: "错误",
        proA: "正方 A",
        conB: "反方 B",
        moderatorFinal: "主持人 C 最终总结",
        moderatorC: "主持人 C",
        system: "系统"
      };
    case "zh-Hant":
      return {
        reportTitle: "辯論研究報告",
        started: "開始時間",
        ended: "結束時間",
        incomplete: "未完成",
        apiFormat: "API 格式",
        searchMode: "搜尋模式",
        finalConclusion: "主持人最終結論",
        userFactors: "使用者補充因素",
        moderatorGuidance: "主持人輪間引導",
        warnings: "執行警告",
        evidenceTable: "證據表",
        title: "標題",
        sourceTime: "來源時間",
        retrievedAt: "檢索時間",
        summary: "摘要",
        sourceAttribution: "來源歸屬",
        source: "來源",
        foundUsedBy: "發現/使用方",
        fullTranscript: "完整辯論記錄",
        round: "輪次",
        error: "錯誤",
        proA: "正方 A",
        conB: "反方 B",
        moderatorFinal: "主持人 C 最終總結",
        moderatorC: "主持人 C",
        system: "系統"
      };
    case "ja":
      return {
        reportTitle: "討論リサーチレポート",
        started: "開始",
        ended: "終了",
        incomplete: "未完了",
        apiFormat: "API 形式",
        searchMode: "検索モード",
        finalConclusion: "Moderator 最終結論",
        userFactors: "ユーザー追加要素",
        moderatorGuidance: "Moderator ラウンド間 guidance",
        warnings: "実行警告",
        evidenceTable: "証拠表",
        title: "タイトル",
        sourceTime: "出典時刻",
        retrievedAt: "取得時刻",
        summary: "要約",
        sourceAttribution: "出典 attribution",
        source: "出典",
        foundUsedBy: "発見/使用者",
        fullTranscript: "全討論 transcript",
        round: "round",
        error: "エラー",
        proA: "賛成 A",
        conB: "反対 B",
        moderatorFinal: "Moderator C 最終要約",
        moderatorC: "Moderator C",
        system: "システム"
      };
    case "ko":
      return {
        reportTitle: "토론 리서치 보고서",
        started: "시작",
        ended: "종료",
        incomplete: "미완료",
        apiFormat: "API 형식",
        searchMode: "검색 모드",
        finalConclusion: "Moderator 최종 결론",
        userFactors: "사용자 추가 요소",
        moderatorGuidance: "Moderator 라운드 간 guidance",
        warnings: "실행 경고",
        evidenceTable: "근거 표",
        title: "제목",
        sourceTime: "출처 시간",
        retrievedAt: "검색 시간",
        summary: "요약",
        sourceAttribution: "출처 귀속",
        source: "출처",
        foundUsedBy: "발견/사용자",
        fullTranscript: "전체 토론 기록",
        round: "round",
        error: "오류",
        proA: "찬성 A",
        conB: "반대 B",
        moderatorFinal: "Moderator C 최종 요약",
        moderatorC: "Moderator C",
        system: "시스템"
      };
    default:
      return {
        reportTitle: "Debate Research Report",
        started: "Started",
        ended: "Ended",
        incomplete: "Incomplete",
        apiFormat: "API format",
        searchMode: "Search mode",
        finalConclusion: "Moderator Final Conclusion",
        userFactors: "User-Provided Additional Factors",
        moderatorGuidance: "Moderator Inter-Round Guidance",
        warnings: "Run Warnings",
        evidenceTable: "Evidence Table",
        title: "Title",
        sourceTime: "Source Time",
        retrievedAt: "Retrieved At",
        summary: "Summary",
        sourceAttribution: "Source Attribution",
        source: "Source",
        foundUsedBy: "Found/Used By",
        fullTranscript: "Full Debate Transcript",
        round: "round",
        error: "Error",
        proA: "Pro A",
        conB: "Con B",
        moderatorFinal: "Moderator C Final Summary",
        moderatorC: "Moderator C",
        system: "System"
      };
  }
}
