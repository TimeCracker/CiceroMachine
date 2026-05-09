import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../src/types";
import { DEFAULT_CONFIG } from "../src/config";
import { DebateSession } from "./domain/orchestrator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT || 8787);

const app = express();
const sessions = new Map<string, DebateSession>();

app.use(express.json({ limit: "2mb" }));

app.post("/api/debates", (req, res) => {
  const config = normalizeConfig(req.body && req.body.config);
  const mock = Boolean(req.body && req.body.mock);
  const session = new DebateSession(config, mock);
  sessions.set(session.id, session);
  res.json(session.snapshot());
  setTimeout(() => {
    session.start().catch((error) => {
      console.error("Debate session failed", error);
    });
  }, 0);
});

app.get("/api/debates/:id/events", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Debate session not found." });
    return;
  }
  session.addClient(res);
});

app.get("/api/debates/:id", (req, res) => {
  const session = getSession(req.params.id, res);
  if (!session) return;
  res.json(session.snapshot());
});

app.post("/api/debates/:id/pause", (req, res) => {
  const session = getSession(req.params.id, res);
  if (!session) return;
  session.pause();
  res.json({ ok: true });
});

app.post("/api/debates/:id/resume", (req, res) => {
  const session = getSession(req.params.id, res);
  if (!session) return;
  session.resume(typeof req.body?.guidance === "string" ? req.body.guidance : "");
  res.json({ ok: true });
});

app.post("/api/debates/:id/stop", (req, res) => {
  const session = getSession(req.params.id, res);
  if (!session) return;
  session.stop();
  res.json({ ok: true });
});

app.get("/api/debates/:id/export", (req, res) => {
  const session = getSession(req.params.id, res);
  if (!session) return;
  const filename = session.exportFileName();
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", contentDispositionAttachment(filename));
  res.send(session.exportMarkdown());
});

app.use(express.static(distDir));
app.get("/", (_req, res) => {
  res.redirect("/debate.html");
});
app.get("/debate.html", (_req, res) => {
  res.sendFile(path.join(distDir, "debate.html"));
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Cicero Machine backend listening at http://127.0.0.1:${port}`);
});

function getSession(id: string, res: express.Response) {
  const session = sessions.get(id);
  if (!session) {
    res.status(404).json({ error: "Debate session not found." });
    return null;
  }
  return session;
}

function normalizeConfig(input: Partial<Config> | undefined): Config {
  return {
    ...DEFAULT_CONFIG,
    ...(input || {}),
    apiKey: String(input?.apiKey || ""),
    searchApiKey: String(input?.searchApiKey || ""),
    model: String(input?.model || DEFAULT_CONFIG.model),
    baseURL: String(input?.baseURL || DEFAULT_CONFIG.baseURL),
    topic: String(input?.topic || "").trim(),
    maxTokens: clampNumber(input?.maxTokens, 256, 16000, DEFAULT_CONFIG.maxTokens),
    responseWordLimitEnabled: Boolean(input?.responseWordLimitEnabled ?? DEFAULT_CONFIG.responseWordLimitEnabled),
    responseWordLimit: clampNumber(input?.responseWordLimit, 120, 2000, DEFAULT_CONFIG.responseWordLimit),
    temperature: clampNumber(input?.temperature, 0, 2, DEFAULT_CONFIG.temperature),
    timeoutSeconds: clampNumber(input?.timeoutSeconds, 15, 180, DEFAULT_CONFIG.timeoutSeconds),
    searchCount: clampNumber(input?.searchCount, 1, 10, DEFAULT_CONFIG.searchCount),
    queriesPerAgent: clampNumber(input?.queriesPerAgent, 1, 4, DEFAULT_CONFIG.queriesPerAgent),
    rounds: clampNumber(input?.rounds, 1, 10, DEFAULT_CONFIG.rounds)
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function contentDispositionAttachment(filename: string) {
  const fallback = String(filename || "debate.md")
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 120) || "debate.md";
  const encoded = encodeURIComponent(filename || "debate.md")
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
