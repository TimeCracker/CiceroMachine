import type { Config, DebateSessionEvent, DebateSessionSnapshot } from "../types";

export async function createDebateSession(config: Config, mock: boolean): Promise<DebateSessionSnapshot> {
  const response = await fetch("/api/debates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config, mock })
  });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

export async function fetchDebateSession(id: string): Promise<DebateSessionSnapshot> {
  const response = await fetch(`/api/debates/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

export function openDebateEvents(id: string, onEvent: (event: DebateSessionEvent) => void, onError: (error: Event) => void) {
  const source = new EventSource(`/api/debates/${encodeURIComponent(id)}/events`);
  const eventTypes: DebateSessionEvent["type"][] = [
    "status",
    "progress",
    "message",
    "evidence",
    "warning",
    "paused",
    "finalReport",
    "complete",
    "error"
  ];
  for (const type of eventTypes) {
    source.addEventListener(type, (message) => {
      onEvent(JSON.parse((message as MessageEvent).data));
    });
  }
  source.onerror = onError;
  return source;
}

export async function pauseDebate(id: string) {
  await postJson(`/api/debates/${encodeURIComponent(id)}/pause`, {});
}

export async function resumeDebateSession(id: string, guidance: string) {
  await postJson(`/api/debates/${encodeURIComponent(id)}/resume`, { guidance });
}

export async function stopDebateSession(id: string) {
  await postJson(`/api/debates/${encodeURIComponent(id)}/stop`, {});
}

export async function fetchDebateMarkdown(id: string) {
  const response = await fetch(`/api/debates/${encodeURIComponent(id)}/export`);
  if (!response.ok) throw new Error(await errorText(response));
  return response.text();
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await errorText(response));
}

async function errorText(response: Response) {
  const text = await response.text();
  return text || `${response.status} ${response.statusText}`;
}
