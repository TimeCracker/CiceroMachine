import './styles.css';
import { DEFAULT_CONFIG, PROVIDERS, STORE_KEY } from './config';
import { mountIcons } from './ui/icons';
import { renderInlineMarkdown as renderInlineMarkdownHtml, renderMarkdown as renderMarkdownHtml } from './ui/markdown';
import {
  createDebateSession,
  fetchDebateSession,
  fetchDebateMarkdown,
  openDebateEvents,
  pauseDebate,
  resumeDebateSession,
  stopDebateSession
} from './services/debateClient';
import type { AppState, DebateMessage, DebateRecord, DebateSessionEvent, Elements, EvidenceItem } from './types';

declare global {
  interface Window {
    DebateApp: Record<string, unknown>;
  }
}

const getEl = <T extends HTMLElement = any>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing DOM element #${id}`);
  return element as T;
};

const isMockMode = new URLSearchParams(window.location.search).has("mock");
const SESSION_KEY = "cicero_machine_last_session_v1";

const state: AppState = {
  config: { ...DEFAULT_CONFIG },
  running: false,
  paused: false,
  pauseRequested: false,
  debate: null,
  currentDebateId: "",
  eventSource: null
};

const collapsedMessageIds = new Set<string>();
let finalReportCollapsed = false;
let activityText = "Waiting to start.";

const els: Elements = {
  mockPill: getEl("mockPill"),
  providerSelect: getEl("providerSelect"),
  apiFormatSelect: getEl("apiFormatSelect"),
  baseUrlInput: getEl("baseUrlInput"),
  apiKeyInput: getEl("apiKeyInput"),
  modelInput: getEl("modelInput"),
  modelSuggestions: getEl("modelSuggestions"),
  deepSeekOptions: getEl("deepSeekOptions"),
  deepSeekFinalThinkingInput: getEl("deepSeekFinalThinkingInput"),
  maxTokensInput: getEl("maxTokensInput"),
  responseWordLimitEnabledInput: getEl("responseWordLimitEnabledInput"),
  responseWordLimitInput: getEl("responseWordLimitInput"),
  searchProviderSelect: getEl("searchProviderSelect"),
  searchApiKeyInput: getEl("searchApiKeyInput"),
  searchCountInput: getEl("searchCountInput"),
  freshnessSelect: getEl("freshnessSelect"),
  queriesPerAgentInput: getEl("queriesPerAgentInput"),
  summaryInput: getEl("summaryInput"),
  configWarning: getEl("configWarning"),
  topicInput: getEl("topicInput"),
  roundsSelect: getEl("roundsSelect"),
  temperatureInput: getEl("temperatureInput"),
  timeoutInput: getEl("timeoutInput"),
  startBtn: getEl("startBtn"),
  pauseBtn: getEl("pauseBtn"),
  resumeBtn: getEl("resumeBtn"),
  stopBtn: getEl("stopBtn"),
  guidanceInput: getEl("guidanceInput"),
  pauseHint: getEl("pauseHint"),
  newDebateBtn: getEl("newDebateBtn"),
  exportBtn: getEl("exportBtn"),
  statusText: getEl("statusText"),
  progressText: getEl("progressText"),
  progressBar: getEl("progressBar"),
  collapseRepliesBtn: getEl("collapseRepliesBtn"),
  messages: getEl("messages"),
  finalReportSection: getEl("finalReportSection"),
  finalReportToggleBtn: getEl("finalReportToggleBtn"),
  finalReportPreview: getEl("finalReportPreview"),
  evidenceList: getEl("evidenceList"),
  sourceDock: getEl("sourceDock"),
  roundMetric: getEl("roundMetric"),
  messageMetric: getEl("messageMetric"),
  evidenceMetric: getEl("evidenceMetric"),
  runMeta: getEl("runMeta")
};

init();

function init() {
  mountIcons();
  els.mockPill.classList.toggle("active", isMockMode);
  populateProviders();
  loadConfig();
  writeConfigToUI();
  bindEvents();
  refreshProviderUI();
  refreshSearchUI();
  updateStartState();
  exposeDebugApi();
  restoreLastSession().catch(() => {
    localStorage.removeItem(SESSION_KEY);
  });
}

function populateProviders() {
  els.providerSelect.innerHTML = Object.entries(PROVIDERS).map(([value, item]) => {
    return `<option value="${escapeHtml(value)}">${escapeHtml(item.label)}</option>`;
  }).join("");
}

function bindEvents() {
  els.providerSelect.addEventListener("change", () => {
    const providerKey = els.providerSelect.value;
    const provider = PROVIDERS[providerKey] || PROVIDERS.custom;
    state.config.provider = providerKey;
    if (providerKey !== "custom") {
      state.config.apiFormat = provider.apiFormat;
      state.config.baseURL = provider.baseURL;
      state.config.model = provider.model;
    }
    writeConfigToUI();
    refreshProviderUI();
    saveConfigFromUI();
  });

  [
    els.apiFormatSelect,
    els.baseUrlInput,
    els.apiKeyInput,
    els.modelInput,
    els.deepSeekFinalThinkingInput,
    els.maxTokensInput,
    els.responseWordLimitEnabledInput,
    els.responseWordLimitInput,
    els.searchProviderSelect,
    els.searchApiKeyInput,
    els.searchCountInput,
    els.freshnessSelect,
    els.queriesPerAgentInput,
    els.summaryInput,
    els.topicInput,
    els.roundsSelect,
    els.temperatureInput,
    els.timeoutInput
  ].forEach((el) => {
    el.addEventListener("input", () => {
      saveConfigFromUI();
      refreshProviderUI();
      refreshSearchUI();
      refreshReplyLimitUI();
      updateStartState();
    });
    el.addEventListener("change", () => {
      saveConfigFromUI();
      refreshProviderUI();
      refreshSearchUI();
      refreshReplyLimitUI();
      updateStartState();
    });
  });

  els.startBtn.addEventListener("click", () => {
    runDebate().catch(handleRunError);
  });
  els.pauseBtn.addEventListener("click", requestPause);
  els.resumeBtn.addEventListener("click", resumeDebate);
  els.stopBtn.addEventListener("click", stopDebate);
  els.newDebateBtn.addEventListener("click", () => resetDebateView());
  els.exportBtn.addEventListener("click", exportMarkdown);
  els.collapseRepliesBtn.addEventListener("click", toggleAllReplies);
  els.finalReportToggleBtn.addEventListener("click", toggleFinalReport);
  els.messages.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("[data-message-collapse]");
    if (!button) return;
    const id = button.dataset.messageId;
    if (!id) return;
    if (collapsedMessageIds.has(id)) collapsedMessageIds.delete(id);
    else collapsedMessageIds.add(id);
    renderMessages(false);
  });
}

function loadConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    state.config = { ...DEFAULT_CONFIG, ...stored };
  } catch {
    state.config = { ...DEFAULT_CONFIG };
  }
}

function writeConfigToUI() {
  const cfg = state.config;
  els.providerSelect.value = cfg.provider;
  els.apiFormatSelect.value = cfg.apiFormat;
  els.baseUrlInput.value = cfg.baseURL;
  els.apiKeyInput.value = cfg.apiKey;
  els.modelInput.value = cfg.model;
  els.deepSeekFinalThinkingInput.checked = Boolean(cfg.deepSeekFinalThinking);
  els.maxTokensInput.value = String(cfg.maxTokens);
  els.responseWordLimitEnabledInput.checked = Boolean(cfg.responseWordLimitEnabled);
  els.responseWordLimitInput.value = String(cfg.responseWordLimit);
  refreshReplyLimitUI();
  els.searchProviderSelect.value = cfg.searchProvider;
  els.searchApiKeyInput.value = cfg.searchApiKey;
  els.searchCountInput.value = String(cfg.searchCount);
  els.freshnessSelect.value = cfg.freshness;
  els.queriesPerAgentInput.value = String(cfg.queriesPerAgent);
  els.summaryInput.checked = Boolean(cfg.summary);
  els.topicInput.value = cfg.topic;
  els.roundsSelect.value = String(cfg.rounds);
  if (els.roundsSelect.value !== String(cfg.rounds)) els.roundsSelect.value = String(DEFAULT_CONFIG.rounds);
  els.temperatureInput.value = String(cfg.temperature);
  els.timeoutInput.value = String(cfg.timeoutSeconds);
}

function saveConfigFromUI() {
  state.config = {
    provider: els.providerSelect.value,
    apiFormat: els.apiFormatSelect.value as any,
    baseURL: els.baseUrlInput.value.trim(),
    apiKey: els.apiKeyInput.value.trim(),
    model: stripDeprecatedNote(els.modelInput.value.trim()),
    maxTokens: clampNumber(els.maxTokensInput.value, 256, 16000, DEFAULT_CONFIG.maxTokens),
    responseWordLimitEnabled: els.responseWordLimitEnabledInput.checked,
    responseWordLimit: clampNumber(els.responseWordLimitInput.value, 120, 2000, DEFAULT_CONFIG.responseWordLimit),
    temperature: clampNumber(els.temperatureInput.value, 0, 2, DEFAULT_CONFIG.temperature),
    timeoutSeconds: clampNumber(els.timeoutInput.value, 15, 180, DEFAULT_CONFIG.timeoutSeconds),
    deepSeekFinalThinking: els.deepSeekFinalThinkingInput.checked,
    searchProvider: els.searchProviderSelect.value as any,
    searchApiKey: els.searchApiKeyInput.value.trim(),
    searchCount: clampNumber(els.searchCountInput.value, 1, 10, DEFAULT_CONFIG.searchCount),
    freshness: els.freshnessSelect.value,
    summary: els.summaryInput.checked,
    queriesPerAgent: clampNumber(els.queriesPerAgentInput.value, 1, 4, DEFAULT_CONFIG.queriesPerAgent),
    rounds: clampNumber(els.roundsSelect.value, 1, 10, DEFAULT_CONFIG.rounds),
    topic: els.topicInput.value.trim()
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(state.config));
}

function refreshProviderUI() {
  const providerKey = els.providerSelect.value;
  const provider = PROVIDERS[providerKey] || PROVIDERS.custom;
  const isDeepSeek = providerKey === "deepseek" || /deepseek\.com/i.test(els.baseUrlInput.value);
  const isCustom = providerKey === "custom";

  els.apiFormatSelect.disabled = !isCustom;
  els.baseUrlInput.readOnly = !isCustom;
  els.deepSeekOptions.classList.toggle("hidden", !isDeepSeek);
  els.modelSuggestions.innerHTML = (provider.models || []).map((model) => `<option value="${escapeHtml(model)}"></option>`).join("");

  const warnings = [];
  if (isDeepSeek) {
    warnings.push("DeepSeek uses the OpenAI-compatible format by default: Base URL https://api.deepseek.com, endpoint /chat/completions. deepseek-chat and deepseek-reasoner are marked deprecated on 2026-07-24; deepseek-v4-flash or deepseek-v4-pro is recommended.");
  }
  if (!isMockMode) {
    warnings.push("API keys are saved in this browser's localStorage, then sent only to the local backend session.");
  }
  if (els.searchProviderSelect.value === "llm-native" && !supportsNativeSearch()) {
    warnings.push("The current LLM provider does not support standard native LLM search. Use Bocha or Tavily with DeepSeek.");
  }
  els.configWarning.textContent = warnings.join(" ");
}

function refreshSearchUI() {
  const provider = els.searchProviderSelect.value;
  const needsSearchKey = provider === "bocha" || provider === "tavily" || provider === "hybrid";
  els.searchApiKeyInput.disabled = !needsSearchKey;
  els.searchApiKeyInput.placeholder = provider === "tavily" ? "Tavily API Key" : "Bocha API Key";
  els.freshnessSelect.disabled = provider === "tavily" || provider === "llm-native";
  els.summaryInput.disabled = provider === "tavily" || provider === "llm-native";
}

function refreshReplyLimitUI() {
  els.responseWordLimitInput.disabled = !els.responseWordLimitEnabledInput.checked;
}

function updateStartState() {
  const cfg = readCurrentConfig();
  const missingLLM = !cfg.apiKey || !cfg.model || !cfg.baseURL || !cfg.topic;
  const needsSearchKey = cfg.searchProvider === "bocha" || cfg.searchProvider === "tavily" || cfg.searchProvider === "hybrid";
  const missingSearch = needsSearchKey && !cfg.searchApiKey;
  const unsupportedNative = cfg.searchProvider === "llm-native" && !supportsNativeSearch();
  els.startBtn.disabled = state.running || (!isMockMode && (missingLLM || missingSearch || unsupportedNative));
  els.pauseBtn.disabled = !state.running || state.paused || state.pauseRequested;
  els.resumeBtn.disabled = !state.paused;
  els.stopBtn.disabled = !state.running && !state.paused;
  els.guidanceInput.disabled = !state.running && !state.paused;
  els.pauseHint.textContent = state.paused
    ? "Paused. Enter additional factors, then click Resume debate."
    : (state.pauseRequested ? "Pause requested. The debate will pause after the current API call finishes." : "Pause takes effect at the next safe point after the current API call finishes.");
}

function readCurrentConfig() {
  saveConfigFromUI();
  return { ...state.config };
}

async function runDebate() {
  const cfg = readCurrentConfig();
  resetDebateView({ keepTopic: true, keepConfig: true });
  state.running = true;
  state.paused = false;
  state.pauseRequested = false;
  setStatus("Creating backend debate session.");
  updateStartState();
  const snapshot = await createDebateSession(cfg, isMockMode);
  state.currentDebateId = snapshot.id;
  localStorage.setItem(SESSION_KEY, snapshot.id);
  state.debate = snapshot.debate;
  connectEventStream(snapshot.id);
  renderAll();
}

function connectEventStream(id: string) {
  if (state.eventSource) state.eventSource.close();
  state.eventSource = openDebateEvents(id, applyDebateEvent, () => {
    if (state.running) {
      setStatus("Event stream interrupted. The backend may still be running.");
    }
  });
}

function applyDebateEvent(event: DebateSessionEvent) {
  if (event.type === "status") {
    setStatus(event.message);
  } else if (event.type === "progress") {
    if (state.debate) state.debate.currentRound = event.round;
    updateProgress(event.done, event.total);
  } else if (event.type === "message") {
    if (state.debate && !state.debate.messages.some((message) => message.id === event.message.id)) {
      state.debate.messages.push(event.message);
    }
  } else if (event.type === "evidence") {
    if (state.debate) state.debate.evidence = event.evidence;
  } else if (event.type === "warning") {
    if (state.debate) state.debate.warnings = event.warnings;
  } else if (event.type === "paused") {
    state.paused = true;
    state.pauseRequested = false;
  } else if (event.type === "finalReport") {
    if (state.debate) state.debate.finalReport = event.finalReport;
  } else if (event.type === "complete") {
    state.debate = event.debate;
    state.running = false;
    state.paused = false;
    state.pauseRequested = false;
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
    }
  } else if (event.type === "error") {
    if (event.debate) state.debate = event.debate;
    state.running = false;
    state.paused = false;
    state.pauseRequested = false;
    setStatus(`Debate interrupted: ${event.message}`);
  }
  renderAll();
  updateStartState();
}

async function requestPause() {
  if (!state.running || state.paused || !state.currentDebateId) return;
  state.pauseRequested = true;
  setStatus("Pause requested. The debate will pause after the current API call finishes.");
  updateStartState();
  await pauseDebate(state.currentDebateId);
}

async function resumeDebate() {
  if (!state.paused || !state.currentDebateId) return;
  const guidance = els.guidanceInput.value.trim();
  els.guidanceInput.value = "";
  state.paused = false;
  state.pauseRequested = false;
  updateStartState();
  await resumeDebateSession(state.currentDebateId, guidance);
}

async function stopDebate() {
  if (state.currentDebateId) {
    await stopDebateSession(state.currentDebateId);
  }
  state.running = false;
  state.paused = false;
  state.pauseRequested = false;
  updateStartState();
}

function handleRunError(error: unknown) {
  state.running = false;
  state.paused = false;
  state.pauseRequested = false;
  setStatus(`Debate interrupted: ${formatErrorMessage(error)}`);
  if (state.debate) {
    state.debate.messages.push({
      id: `M${state.debate.messages.length + 1}`,
      createdAt: new Date().toISOString(),
      agent: "system",
      round: state.debate.currentRound || 0,
      type: "error",
      content: formatErrorMessage(error),
      evidenceIds: []
    });
  }
  updateStartState();
  renderAll();
}

async function exportMarkdown() {
  if (!state.currentDebateId || !state.debate) return;
  const filename = `debate-${safeFileName(state.debate.topic)}.md`;
  els.exportBtn.disabled = true;
  try {
    let markdown = "";
    try {
      markdown = await fetchDebateMarkdown(state.currentDebateId);
    } catch (error) {
      markdown = buildClientMarkdown(state.debate);
      setStatus(`Backend export unavailable; downloaded the browser snapshot instead: ${formatErrorMessage(error)}`);
    }
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    setStatus(`Export failed: ${formatErrorMessage(error)}`);
  } finally {
    updateStartState();
  }
}

function buildClientMarkdown(debate: DebateRecord) {
  const lines: string[] = [];
  lines.push(`# Debate Report: ${debate.topic}`);
  lines.push("");
  lines.push(`- Started: ${debate.startedAt}`);
  lines.push(`- Ended: ${debate.endedAt || "incomplete"}`);
  lines.push(`- LLM: ${debate.configSummary.provider} / ${debate.configSummary.model}`);
  lines.push(`- API format: ${debate.configSummary.apiFormat}`);
  lines.push(`- Search mode: ${debate.configSummary.searchProvider}`);
  if (debate.configSummary.responseWordLimitEnabled) {
    lines.push(`- Reply limit except final: ${debate.configSummary.responseWordLimit}`);
  }
  lines.push("");
  if (debate.finalReport) {
    lines.push("## Final Conclusion");
    lines.push("");
    lines.push(debate.finalReport);
    lines.push("");
  }
  if (debate.guidance.length) {
    lines.push("## User Factors");
    lines.push("");
    for (const item of debate.guidance) {
      lines.push(`- ${item.id} · round ${item.round} · ${item.createdAt}: ${item.text}`);
    }
    lines.push("");
  }
  if (debate.moderatorGuidance.length) {
    lines.push("## Moderator Guidance");
    lines.push("");
    for (const item of debate.moderatorGuidance) {
      lines.push(`- ${item.id} · round ${item.round} · ${item.createdAt}: ${item.content}`);
    }
    lines.push("");
  }
  lines.push("## Debate Transcript");
  lines.push("");
  for (const message of debate.messages) {
    lines.push(`### ${labelForMessage(message)} · round ${message.round} · ${message.createdAt}`);
    lines.push("");
    lines.push(message.content);
    lines.push("");
    if (message.evidenceIds.length) {
      lines.push(`Sources: ${message.evidenceIds.map((id) => `[${id}]`).join(" ")}`);
      lines.push("");
    }
  }
  lines.push("## Evidence");
  lines.push("");
  for (const item of debate.evidence) {
    lines.push(`- [${item.id}] ${item.title}`);
    lines.push(`  - URL: ${item.url || "none"}`);
    lines.push(`  - Provider: ${item.provider}`);
    lines.push(`  - Found by: ${formatEvidenceUses(item)}`);
    if (item.summary || item.snippet) lines.push(`  - Summary: ${item.summary || item.snippet}`);
  }
  return lines.join("\n");
}

async function restoreLastSession() {
  if (state.debate || state.running || state.currentDebateId) return;
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return;
  const snapshot = await fetchDebateSession(id);
  state.currentDebateId = snapshot.id;
  state.debate = snapshot.debate;
  state.running = Boolean(snapshot.running);
  state.paused = Boolean(snapshot.paused);
  state.pauseRequested = Boolean(snapshot.pauseRequested);
  if (state.running || state.paused) {
    setStatus(state.paused ? "Restored a paused debate session." : "Restored a running debate session.");
    connectEventStream(snapshot.id);
  } else {
    setStatus(snapshot.debate.endedAt ? "Restored the latest completed debate session." : "Restored the latest debate session.");
  }
  updateProgress(snapshot.debate.currentRound || 0, snapshot.debate.totalRounds || 0);
  renderAll();
  updateStartState();
}

function renderAll() {
  renderMessages();
  renderFinalReport();
  renderEvidence();
  renderMetrics();
  setRunMeta();
  els.exportBtn.disabled = !state.debate || (!state.debate.messages.length && !state.debate.finalReport);
}

function renderMessages(scrollToEnd = true) {
  const messages = state.debate ? visibleDebateMessages(state.debate.messages) : [];
  renderCollapseRepliesControl(messages);
  const workingMarker = renderWorkingMarker();
  if (!state.debate || messages.length === 0) {
    els.messages.innerHTML = [
      '<div class="empty-state">The pro side, con side, and moderator messages will appear here after the debate starts.</div>',
      workingMarker
    ].filter(Boolean).join("");
    mountIcons();
    return;
  }
  els.messages.innerHTML = messages.map((message) => {
    const cls = message.type === "error" ? "error" : `agent-${String(message.agent).toLowerCase()}`;
    const label = labelForMessage(message);
    const collapsed = collapsedMessageIds.has(message.id);
    const tags = (message.evidenceIds || []).map((id) => {
      const evidence = state.debate?.evidence.find((item) => item.id === id);
      const title = evidence ? `${id} · ${evidence.title}` : id;
      return renderSourceChip(evidence || null, id, title);
    }).join("");
    return [
      `<article class="message ${cls}${collapsed ? " collapsed" : ""}">`,
      '<div class="message-head">',
      `<span class="badge">${escapeHtml(label)}</span>`,
      '<div class="message-actions">',
      `<span class="time">${escapeHtml(formatTime(message.createdAt))}</span>`,
      `<button class="ghost compact message-toggle" type="button" data-message-collapse data-message-id="${escapeAttr(message.id)}" aria-expanded="${collapsed ? "false" : "true"}" title="${collapsed ? "Expand reply" : "Collapse reply"}"><i data-lucide="${collapsed ? "chevron-down" : "chevron-up"}"></i><span>${collapsed ? "Expand" : "Collapse"}</span></button>`,
      '</div>',
      '</div>',
      `<div class="content">${renderInlineMarkdown(message.content)}</div>`,
      tags ? `<div class="evidence-tags">${tags}</div>` : "",
      '</article>'
    ].join("");
  }).join("") + workingMarker;
  mountIcons();
  if (scrollToEnd) {
    requestAnimationFrame(() => {
      const last = els.messages.lastElementChild;
      if (last) last.scrollIntoView({ block: "nearest" });
    });
  }
}

function renderWorkingMarker() {
  if (!state.debate || !state.running || state.paused) return "";
  const text = activityText || "Generating next reply.";
  return [
    '<div class="working-marker" role="status" aria-live="polite">',
    '<span class="breathing-dot" aria-hidden="true"></span>',
    `<span class="working-text">${escapeHtml(text)}</span>`,
    '<span class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>',
    '</div>'
  ].join("");
}

function renderCollapseRepliesControl(messages: DebateMessage[]) {
  const hasMessages = messages.length > 0;
  const allCollapsed = hasMessages && messages.every((message) => collapsedMessageIds.has(message.id));
  els.collapseRepliesBtn.disabled = !hasMessages;
  els.collapseRepliesBtn.innerHTML = allCollapsed
    ? '<i data-lucide="chevrons-down"></i><span>Expand replies</span>'
    : '<i data-lucide="chevrons-up"></i><span>Collapse replies</span>';
}

function toggleAllReplies() {
  const messages = state.debate ? visibleDebateMessages(state.debate.messages) : [];
  if (!messages.length) return;
  const allCollapsed = messages.every((message) => collapsedMessageIds.has(message.id));
  for (const message of messages) {
    if (allCollapsed) collapsedMessageIds.delete(message.id);
    else collapsedMessageIds.add(message.id);
  }
  renderMessages(false);
}

function visibleDebateMessages(messages: DebateMessage[]) {
  return (messages || []).filter((message) => !(message.agent === "C" && message.type === "final"));
}

function renderFinalReport() {
  const report = state.debate && state.debate.finalReport;
  if (!report) {
    els.finalReportSection.classList.add("hidden");
    els.finalReportPreview.parentElement?.classList.remove("hidden");
    els.finalReportPreview.innerHTML = "";
    finalReportCollapsed = false;
    renderFinalReportToggle();
    return;
  }
  els.finalReportSection.classList.remove("hidden");
  renderFinalReportToggle();
  if (finalReportCollapsed) {
    els.finalReportPreview.parentElement?.classList.add("hidden");
    els.finalReportPreview.classList.add("hidden");
    els.finalReportPreview.innerHTML = "";
    mountIcons();
    return;
  }
  els.finalReportPreview.parentElement?.classList.remove("hidden");
  els.finalReportPreview.classList.remove("hidden");
  els.finalReportPreview.innerHTML = renderMarkdown(report);
  mountIcons();
}

function renderFinalReportToggle() {
  els.finalReportToggleBtn.setAttribute("aria-expanded", finalReportCollapsed ? "false" : "true");
  els.finalReportToggleBtn.innerHTML = finalReportCollapsed
    ? '<i data-lucide="chevron-down"></i><span>Expand</span>'
    : '<i data-lucide="chevron-up"></i><span>Collapse</span>';
}

function toggleFinalReport() {
  finalReportCollapsed = !finalReportCollapsed;
  renderFinalReport();
}

function renderMarkdown(markdown: string) {
  return renderMarkdownHtml(markdown, renderInlineSourceReference);
}

function renderInlineMarkdown(text: string) {
  return renderInlineMarkdownHtml(text, renderInlineSourceReference);
}

function renderInlineSourceReference(match: string) {
  const id = match.slice(1, -1);
  const evidence = state.debate && state.debate.evidence.find((item) => item.id === id);
  const title = evidence ? `${id} · ${evidence.title}` : id;
  if (!evidence || !evidence.url) {
    return `<span class="inline-source disabled" title="${escapeAttr(title)}: no navigable URL">${escapeHtml(match)}</span>`;
  }
  return `<a class="inline-source" href="${escapeAttr(evidence.url)}" target="_blank" rel="noreferrer" title="${escapeAttr(title)}">${escapeHtml(match)}</a>`;
}

function renderEvidence() {
  if (!state.debate || state.debate.evidence.length === 0) {
    renderSourceDock();
    els.evidenceList.innerHTML = '<div class="empty-state">Web search results will be collected here.</div>';
    return;
  }
  renderSourceDock();
  els.evidenceList.innerHTML = state.debate.evidence.map((item) => {
    const title = escapeHtml(item.title);
    const link = item.url
      ? `<a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${title}</a>`
      : `<span>${title}</span>`;
    const snippet = item.summary || item.snippet || "No summary.";
    return [
      '<article class="evidence">',
      '<div class="evidence-title">',
      `<span class="evidence-id">${escapeHtml(item.id)}</span>`,
      link,
      '</div>',
      `<p class="evidence-snippet">${escapeHtml(truncate(snippet, 220))}</p>`,
      `<div class="evidence-meta">${escapeHtml(item.provider)} · found/used: ${escapeHtml(formatEvidenceUses(item))} · source time: ${escapeHtml(item.publishedAt || "unknown")} · retrieved: ${escapeHtml(formatDateTime(item.retrievedAt))} · query: ${escapeHtml(truncate(item.query, 80))}</div>`,
      '</article>'
    ].join("");
  }).join("");
}

function renderSourceDock() {
  const evidence = state.debate ? state.debate.evidence.filter((item) => item.url) : [];
  if (!evidence.length) {
    els.sourceDock.innerHTML = '<div class="source-strip-title">Source icons · S1/S2 are source IDs</div><div class="empty-state">Clickable source icons will appear after search.</div>';
    return;
  }
  els.sourceDock.innerHTML = [
    '<div class="source-strip-title">Source icons · S1/S2 are source IDs</div>',
    renderSourceGroup("Pro A", evidence, "A"),
    renderSourceGroup("Con B", evidence, "B"),
    renderSourceGroup("Moderator C", evidence, "C")
  ].join("");
}

function renderSourceGroup(label: string, evidence: EvidenceItem[], agent: string) {
  const items = evidence.filter((item) => evidenceUsedBy(item, agent));
  if (!items.length) return "";
  return [
    `<div class="source-strip-title">${escapeHtml(label)} sources</div>`,
    ...items.map((item) => renderSourceIcon(item, agent))
  ].join("");
}

function renderSourceIcon(item: EvidenceItem, agent: string) {
  const agentUses = agent && Array.isArray(item.uses) ? item.uses.filter((use) => use.agent === agent) : [];
  const useText = agentUses.length ? `\n${agentUses.map((use) => `Round ${use.round}: ${use.query}`).join("\n")}` : "";
  const title = `${item.id} · ${item.title}\n${item.url}${useText}`;
  const favicon = item.favicon || faviconForUrl(item.url);
  const fallback = sourceInitial(item);
  const image = favicon ? `<img src="${escapeAttr(favicon)}" alt="" loading="lazy" onerror="this.remove()">` : "";
  return [
    `<a class="source-icon" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">`,
    `<span class="source-icon-fallback">${escapeHtml(fallback)}</span>`,
    image,
    `<span class="source-icon-id">${escapeHtml(item.id)}</span>`,
    '</a>'
  ].join("");
}

function renderSourceChip(item: EvidenceItem | null, id: string, title: string) {
  const favicon = item && (item.favicon || faviconForUrl(item.url));
  const fallback = sourceInitial(item) || id;
  const image = favicon ? `<img src="${escapeAttr(favicon)}" alt="" loading="lazy" onerror="this.remove()">` : `<span class="source-icon-fallback">${escapeHtml(fallback)}</span>`;
  if (!item || !item.url) {
    return [
      `<span class="source-chip disabled" title="${escapeAttr(title)}: no navigable URL" aria-label="${escapeAttr(title)}: no navigable URL">`,
      image,
      `<span>${escapeHtml(id)}</span>`,
      '</span>'
    ].join("");
  }
  return [
    `<a class="source-chip" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">`,
    image,
    `<span>${escapeHtml(id)}</span>`,
    '</a>'
  ].join("");
}

function renderMetrics() {
  const debate = state.debate;
  els.roundMetric.textContent = debate ? String(debate.currentRound || 0) : "0";
  els.messageMetric.textContent = debate ? String(debate.messages.length) : "0";
  els.evidenceMetric.textContent = debate ? String(debate.evidence.length) : "0";
}

function updateProgress(done: number, total: number) {
  const pct = total ? Math.min(100, Math.max(0, (done / total) * 100)) : 0;
  els.progressBar.style.width = `${pct}%`;
  els.progressText.textContent = `${done} / ${total || 0}`;
}

function setStatus(text: string) {
  activityText = text;
  els.statusText.textContent = text;
}

function setRunMeta() {
  if (!state.debate) {
    els.runMeta.textContent = "Not run yet.";
    return;
  }
  const cfg = state.debate.configSummary;
  const warningText = state.debate.warnings && state.debate.warnings.length ? ` · warnings ${state.debate.warnings.length}` : "";
  const agentText = state.debate.agentStates ? " · 3 backend agents" : "";
  const replyLimitText = cfg.responseWordLimitEnabled ? ` · reply cap ${cfg.responseWordLimit}` : "";
  els.runMeta.textContent = `${cfg.provider} · ${cfg.model} · search: ${cfg.searchProvider} · ${state.debate.totalRounds} rounds${replyLimitText}${agentText}${warningText}`;
}

function resetDebateView(options: { keepTopic?: boolean; keepConfig?: boolean } = {}) {
  if (state.running && state.currentDebateId) {
    stopDebateSession(state.currentDebateId).catch(() => {});
  }
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  const topic = els.topicInput.value;
  state.running = false;
  state.paused = false;
  state.pauseRequested = false;
  state.currentDebateId = "";
  state.debate = null;
  localStorage.removeItem(SESSION_KEY);
  collapsedMessageIds.clear();
  finalReportCollapsed = false;
  if (!options.keepTopic) els.topicInput.value = topic;
  if (!options.keepConfig) saveConfigFromUI();
  setStatus("Waiting to start.");
  updateProgress(0, 0);
  renderAll();
  updateStartState();
}

function supportsNativeSearch() {
  const provider = els.providerSelect.value || state.config.provider;
  const format = els.apiFormatSelect.value || state.config.apiFormat;
  return (provider === "openai" && format === "openai") || (provider === "anthropic" && format === "anthropic");
}

function evidenceUsedBy(item: EvidenceItem, agent: string) {
  const uses = Array.isArray(item.uses) ? item.uses : [];
  return uses.some((use) => use.agent === agent) || item.agent === agent;
}

function formatEvidenceUses(item: EvidenceItem) {
  const uses = Array.isArray(item.uses) ? item.uses : [];
  if (!uses.length) return `${item.agent}${item.round}`;
  return uses.map((use) => `${use.agent}${use.round}`).join(", ");
}

function labelForMessage(message: DebateMessage) {
  if (message.type === "error") return "Error";
  if (message.agent === "A") return "Pro A";
  if (message.agent === "B") return "Con B";
  if (message.agent === "C" && message.type === "final") return "Moderator C Final Summary";
  if (message.agent === "C") return "Moderator C";
  return "System";
}

function sourceInitial(item: EvidenceItem | null) {
  if (!item) return "?";
  try {
    if (item.url) return new URL(item.url).hostname.replace(/^www\./, "").slice(0, 1).toUpperCase();
  } catch {
    // Fall through to title/provider initials.
  }
  const text = item.title || item.provider || "?";
  return String(text).trim().slice(0, 1).toUpperCase() || "?";
}

function faviconForUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
  } catch {
    return "";
  }
}

function stripDeprecatedNote(model: string) {
  return model.replace(/（.*?废弃）|\s*\(deprecated .*?\)/gi, "").trim();
}

function clampNumber(value: string, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function truncate(text: string, max: number) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function formatErrorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error ? String((error as Error).message) : String(error);
}

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function formatDateTime(iso?: string) {
  if (!iso) return "unknown";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return "unknown";
  }
}

function safeFileName(text: string) {
  return String(text || "debate")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "debate";
}

function escapeHtml(value: unknown) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value: unknown) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function exposeDebugApi() {
  window.DebateApp = {
    state,
    createDebateSession,
    stop: stopDebate,
    exportMarkdown
  };
}
