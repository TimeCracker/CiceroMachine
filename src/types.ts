export type AgentId = "A" | "B" | "C" | "system";
export type ApiFormat = "openai" | "anthropic";
export type SearchProvider = "bocha" | "tavily" | "llm-native" | "hybrid";
export type MessageType = "speech" | "commentary" | "final" | "error" | "guidance";

export interface ProviderPreset {
  label: string;
  apiFormat: ApiFormat;
  baseURL: string;
  model: string;
  models: string[];
}

export interface Config {
  provider: string;
  apiFormat: ApiFormat;
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  responseWordLimitEnabled: boolean;
  responseWordLimit: number;
  temperature: number;
  timeoutSeconds: number;
  deepSeekFinalThinking: boolean;
  searchProvider: SearchProvider;
  searchApiKey: string;
  searchCount: number;
  freshness: string;
  summary: boolean;
  queriesPerAgent: number;
  rounds: number;
  topic: string;
}

export interface EvidenceUse {
  agent: AgentId;
  round: number;
  query: string;
  provider?: string;
  usedAt?: string;
}

export interface EvidenceItem {
  id: string;
  provider: string;
  title: string;
  url: string;
  favicon?: string;
  snippet?: string;
  summary?: string;
  publishedAt?: string;
  retrievedAt?: string;
  score?: number | null;
  query: string;
  agent: AgentId;
  round: number;
  uses: EvidenceUse[];
  raw?: unknown;
  contentType?: string;
}

export interface DebateMessage {
  id: string;
  createdAt: string;
  agent: AgentId;
  round: number;
  type: MessageType;
  content: string;
  evidenceIds: string[];
}

export interface UserGuidance {
  id: string;
  text: string;
  round: number;
  createdAt: string;
}

export interface ModeratorGuidance {
  id: string;
  round: number;
  content: string;
  createdAt: string;
}

export interface DebateRecord {
  topic: string;
  totalRounds: number;
  currentRound: number;
  startedAt: string;
  endedAt: string;
  configSummary: Pick<Config, "provider" | "apiFormat" | "baseURL" | "model" | "searchProvider" | "searchCount" | "freshness" | "queriesPerAgent" | "responseWordLimitEnabled" | "responseWordLimit">;
  messages: DebateMessage[];
  evidence: EvidenceItem[];
  guidance: UserGuidance[];
  moderatorGuidance: ModeratorGuidance[];
  warnings: string[];
  finalReport: string;
  agentStates?: Partial<Record<Exclude<AgentId, "system">, AgentRuntimeState>>;
}

export interface AgentRuntimeState {
  agent: Exclude<AgentId, "system">;
  label: string;
  role: "pro" | "con" | "moderator";
  historyLength: number;
  privateEvidenceIds: string[];
  searchLog: Array<{ round: number; query: string; evidenceIds: string[]; createdAt: string }>;
  auditLog: Array<{ round: number; note: string; createdAt: string }>;
  memory: string[];
}

export type DebateSessionEvent =
  | { type: "status"; message: string }
  | { type: "progress"; done: number; total: number; round: number }
  | { type: "message"; message: DebateMessage }
  | { type: "evidence"; evidence: EvidenceItem[] }
  | { type: "warning"; warning: string; warnings: string[] }
  | { type: "paused"; label: string }
  | { type: "finalReport"; finalReport: string }
  | { type: "complete"; debate: DebateRecord }
  | { type: "error"; message: string; debate?: DebateRecord };

export interface DebateSessionSnapshot {
  id: string;
  debate: DebateRecord;
  running?: boolean;
  paused?: boolean;
  pauseRequested?: boolean;
}

export interface AppState {
  config: Config;
  running: boolean;
  paused: boolean;
  pauseRequested: boolean;
  debate: DebateRecord | null;
  currentDebateId: string;
  eventSource: EventSource | null;
}

export interface Elements {
  mockPill: HTMLElement;
  providerSelect: HTMLSelectElement;
  apiFormatSelect: HTMLSelectElement;
  baseUrlInput: HTMLInputElement;
  apiKeyInput: HTMLInputElement;
  modelInput: HTMLInputElement;
  modelSuggestions: HTMLDataListElement;
  deepSeekOptions: HTMLElement;
  deepSeekFinalThinkingInput: HTMLInputElement;
  maxTokensInput: HTMLInputElement;
  responseWordLimitEnabledInput: HTMLInputElement;
  responseWordLimitInput: HTMLInputElement;
  searchProviderSelect: HTMLSelectElement;
  searchApiKeyInput: HTMLInputElement;
  searchCountInput: HTMLInputElement;
  freshnessSelect: HTMLSelectElement;
  queriesPerAgentInput: HTMLInputElement;
  summaryInput: HTMLInputElement;
  configWarning: HTMLElement;
  topicInput: HTMLTextAreaElement;
  roundsSelect: HTMLSelectElement;
  temperatureInput: HTMLInputElement;
  timeoutInput: HTMLInputElement;
  startBtn: HTMLButtonElement;
  pauseBtn: HTMLButtonElement;
  resumeBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
  guidanceInput: HTMLTextAreaElement;
  pauseHint: HTMLElement;
  newDebateBtn: HTMLButtonElement;
  exportSimplifiedInput: HTMLInputElement;
  exportBtn: HTMLButtonElement;
  statusText: HTMLElement;
  progressText: HTMLElement;
  progressBar: HTMLElement;
  collapseRepliesBtn: HTMLButtonElement;
  messages: HTMLElement;
  finalReportSection: HTMLElement;
  finalReportToggleBtn: HTMLButtonElement;
  finalReportPreview: HTMLElement;
  evidenceList: HTMLElement;
  sourceDock: HTMLElement;
  roundMetric: HTMLElement;
  messageMetric: HTMLElement;
  evidenceMetric: HTMLElement;
  runMeta: HTMLElement;
}
