<p align="right">
  <a href="./README.md">简体中文</a> | <a href="./README.zh-TW.md">繁體中文</a> | <a href="./README.en.md">English</a> | <a href="./README.ja.md">日本語</a> | <a href="./README.ko.md">한국어</a>
</p>

<div align="center">
  <img src="./docs/assets/cicero-machine-senate.png" alt="8-bit pixel art of two Ciceros debating in the Roman senate" width="100%" />

  <h1>Cicero Machine</h1>

  <p>
    <em>"In disputando veritas gignitur."</em><br />
    Truth is born in debate—Cicero（Marcus Tullius Cicero）
  </p>

  <p>
    <strong>Evidence-grounded three-agent adversarial-convergence workbench</strong><br />
    Conflict is the method for surfacing information; convergence is the goal for approaching truth.
  </p>

  <p>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript&logoColor=white" />
    <img alt="Vite" src="https://img.shields.io/badge/Vite-5.x-646cff?style=flat-square&logo=vite&logoColor=white" />
    <img alt="Express" src="https://img.shields.io/badge/Express-backend-111827?style=flat-square&logo=express&logoColor=white" />
    <img alt="SSE" src="https://img.shields.io/badge/Streaming-SSE-7c3aed?style=flat-square" />
    <img alt="DeepSeek" src="https://img.shields.io/badge/DeepSeek-ready-0f9f6e?style=flat-square" />
    <img alt="Bocha" src="https://img.shields.io/badge/Search-Bocha%20%2F%20Tavily%20%2F%20Native-2563eb?style=flat-square" />
  </p>
</div>

## What is this?

Cicero Machine is a research and debate tool built as a backend agent service plus a frontend workbench. After you enter a topic and API keys, the backend creates an in-memory debate session and runs three independent AgentRuntime instances. Its core design philosophy is: **make adversarial pressure long enough to surface information, then converge precisely enough to approach truth.**

The frontend workbench handles configuration, pause/resume, SSE rendering, source links, collapsible replies, final-report preview, and Markdown export. The backend handles three-agent orchestration, web search, evidence registration, audits, convergence, and report generation.

| Agent | Role | Private state | What it does |
| --- | --- | --- | --- |
| A | Pro | Independent history, memory, source pool, search log | Searches supporting evidence before its turn, builds the affirmative case, responds to challenges, and concedes what it cannot fully refute |
| B | Con | Independent history, memory, source pool, search log | Searches counter-evidence after reading A's current speech, attacks assumptions, and states the boundary conditions of its own position |
| C | Moderator | Independent memory, guidance, audit log | Audits each round, identifies blind spots, proposes next-round questions, and produces a structured Markdown research report |

A/B/C do not share private conversation history. They only exchange public speeches, global source IDs, user-added factors, and moderator guidance through the backend orchestrator. One DeepSeek or other LLM API key can be shared by all three agents.

## Debate Mechanics

The debate runs in three phases:

| Phase | Purpose | Rules |
| --- | --- | --- |
| Opening round | Establish each side's initial analytical frame | A/B search evidence, state core variables, formulas, and initial boundaries, and make a necessary concession |
| Clash rounds | Keep conflict long enough to expose missing information and reasoning errors | Each speech steel-mans the opponent's strongest point before rebutting; every speech ends with a concrete concession; the moderator audits core disagreement, logic, shared blind spots, and the next follow-up angle |
| Convergence round | Map the exact boundary of each position | A/B stop pure attack, answer when the opponent would be correct, state when their own position holds, and name the unresolved factual question that would decide the issue |

The final moderator report uses a fixed structure: factual consensus, factual disputes, value and stance disputes, evidence and formula table, conditional conclusions, unresolved questions, balanced assessment and final conclusion, and methodology limitations. Every factual judgment must cite source IDs such as `[S1]` and `[S2]`.

Use it for:

- Breaking down investment theses from multiple angles
- Debating product strategy or technical direction
- Evidence-based discussion of policy, business, or organizational questions
- Research notes that need source links and formulas preserved

## Highlights

- **Three independent AgentRuntime instances**: A/B/C keep separate history, memory, evidence pools, search logs, and audit state on the backend.
- **Serial search by speaking order**: In each round, A searches and speaks first; B reads A's current speech, then searches and rebuts. This reduces the chance of hitting search API concurrency limits.
- **Steel-man plus mandatory concessions**: A/B must restate the opponent's strongest point before rebutting, and every speech must acknowledge one opposing argument it cannot fully refute.
- **Moderator logic audit**: C's inter-round commentary always covers core disagreement, logic audit, shared blind spot, and follow-up angle; the blind spot and follow-up feed the next round.
- **Final-round conditional convergence**: A/B must state when each side would be correct, preventing complex questions from collapsing into absolute victory claims.
- **Web evidence search**: Supports Bocha API, Tavily API, OpenAI/Anthropic native search, and hybrid mode.
- **DeepSeek ready**: Defaults to DeepSeek OpenAI-compatible Chat Completions, and one API key can power all agents.
- **Global source IDs**: The backend `EvidenceRegistry` assigns `S1/S2/S3...`, deduplicates URLs globally, and records which agent, round, and query discovered or cited each source.
- **Clickable sources**: Inline `[S1]`, `[S2]` references render as source links.
- **Moderator guidance feeds the next round**: C's follow-up questions are broadcast to A/B and injected into the next search and speech tasks.
- **Search-planning fallback**: If the LLM call that plans search queries fails, local fallback queries keep the debate moving instead of interrupting the session.
- **Pause and resume**: Pause the debate, add new factors, then continue.
- **Same-backend session recovery**: After a browser refresh, the frontend tries to reconnect to the latest backend in-memory session; if the backend process is still running, the completed report can still be collected.
- **Live working indicator**: While a new reply is being generated, a breathing marker appears after the latest content so the user can see that the system is still active.
- **Collapsible reading**: Every A/B/C reply has its own collapse button, Final Conclusion can be collapsed independently, and all non-final replies can be collapsed with one control.
- **Optional reply length limit**: `Reply word limit except final` is off by default; when enabled, it constrains each complete non-final A/B/C reply. Final Conclusion is not limited.
- **Rendered final Markdown**: Headings, lists, tables, links, and source references render in-app.
- **Continuation and fallback**: If the final report is truncated, it continues automatically; if both model calls fail, the app renders an explicitly labeled local fallback Markdown.
- **Robust Markdown export**: Export the final report, evidence URLs, source ownership, and full transcript. If the backend export endpoint is unavailable, the frontend generates Markdown from the current browser snapshot.

## Workflow

```mermaid
flowchart TD
  UI[Frontend workbench] -->|POST /api/debates| Server[Express backend]
  Server --> Session[DebateSession]
  Session --> A[Pro Agent A runtime]
  Session --> B[Con Agent B runtime]
  Session --> C[Moderator Agent C runtime]

  A -->|private search plan| SearchA[A searches when its turn starts]
  SearchA -->|S1/S2...| Registry[Global EvidenceRegistry]
  A -->|public speech| Transcript[Public transcript]

  Transcript --> B
  B -->|search after reading A speech| SearchB[B searches rebuttal evidence]
  SearchB --> Registry
  B -->|public rebuttal| Transcript

  Transcript --> C
  Registry --> C
  C -->|guidance or final report| Session
  Session -->|SSE events| UI
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start the local dev server

```bash
npm run dev
```

This starts both services:

- Express backend: `http://127.0.0.1:8787`
- Vite frontend: `http://127.0.0.1:8000/debate.html`

### 3. Configure API keys

Fill in the page settings:

- LLM API key, for example a DeepSeek API key
- Search API key, for example Bocha or Tavily
- Model name, default `deepseek-v4-flash`

API keys are stored in the current browser's `localStorage` and sent only to the current backend in-memory session when a debate starts. The backend does not write keys to a database or persist them.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start backend and Vite frontend together, then open `/debate.html` |
| `npm run dev:awake` | On macOS, start dev services and prevent system sleep for long debates |
| `npm run dev:server` | Start only the Express backend TypeScript watcher |
| `npm run dev:web` | Start only the Vite frontend; `/api` proxies to the backend |
| `npm run check` | TypeScript type check |
| `npm run test` | Run Vitest unit tests |
| `npm run build` | Build frontend production assets and run type checks |
| `npm start` | Start the production Express backend and serve `dist/` |
| `npm run start:awake` | On macOS, start production mode and prevent system sleep |
| `npm run preview` | Preview the Vite static build only; it does not run the backend agent API |

## Deployment

Production requires a long-running Node.js service. After build, the Express backend serves `dist/` and provides `/api/debates` plus the SSE event stream.

```bash
npm install
npm run build
npm start
```

Default production URL:

```text
http://127.0.0.1:8787/debate.html
```

Set a different port with:

```bash
PORT=3000 npm start
```

| Scenario | Recommendation |
| --- | --- |
| Local or intranet use | Run `npm start`; optionally put Nginx/Caddy in front |
| VPS / cloud server | Install Node.js, run `npm run build && npm start`, and add an HTTPS reverse proxy |
| Render / Railway / Fly.io style Node hosts | Build Command: `npm install && npm run build`; Start Command: `npm start` |
| Vercel / Netlify static hosting | Not suitable as a static-only deploy because Express API and SSE are required |
| GitHub Pages | Not suitable for the current architecture because it cannot run the backend agent service |

## Security and Cost Notes

Current call chain:

```mermaid
sequenceDiagram
  participant Browser as Browser
  participant Server as Express Backend
  participant A as Agent A
  participant B as Agent B
  participant C as Agent C
  participant Providers as LLM/Search Providers

  Browser->>Server: POST /api/debates with config and user API keys
  Server-->>Browser: SSE status/message/evidence/finalReport events
  Server->>A: private runtime task
  Server->>B: private runtime task
  Server->>C: private runtime task
  A->>Providers: LLM and search calls
  B->>Providers: LLM and search calls
  C->>Providers: LLM final report call
  Providers-->>Server: responses
```

This means:

- Do not hard-code API keys in source code.
- The backend does not persist API keys, but on a public deployment user keys are still sent to the server you operate. Use HTTPS and make sure users trust that deployment.
- Sessions live in backend process memory, not in a database. A browser refresh can recover a session in the same backend process; a backend restart cannot recover a running debate.
- If the computer enters system sleep, the Node process and provider requests may be suspended. For long runs on macOS, use `npm run dev:awake` or `npm run start:awake`.
- There is no user system, database, or tenant isolation yet. For long-running public use, add authentication, rate limits, redacted logs, cost controls, and session cleanup.
- Search APIs may rate-limit or run out of quota. The current implementation searches serially by speaking turn and degrades individual search failures, but exhausted provider quota will still surface as warnings.

## Project Structure

```text
.
├── debate.html                 # Vite HTML entry, keeps /debate.html
├── src                         # Frontend workbench
│   ├── main.ts                 # DOM binding, SSE event apply, rendering, export trigger
│   ├── config.ts               # Provider presets and default config
│   ├── types.ts                # Shared frontend/backend core types
│   ├── services                # Frontend debateClient and lightweight HTTP helper
│   └── ui                      # Icons, Markdown rendering, source links
├── server                      # Backend agent service
│   ├── index.ts                # Express API, SSE, production static hosting
│   ├── domain
│   │   ├── agents.ts           # A/B/C AgentRuntime
│   │   ├── orchestrator.ts     # Round scheduling, pause/resume/stop, export
│   │   └── evidenceRegistry.ts # Global source numbering, URL dedupe, uses attribution
│   ├── services                # LLM, search, finance, HTTP timeout
│   └── mock.ts                 # ?mock=1 regression data
├── docs/assets                 # README visual assets
├── vite.config.ts              # Vite dev server and /api proxy
└── package.json
```

## Backend API

| API | Purpose |
| --- | --- |
| `POST /api/debates` | Create and start a debate session |
| `GET /api/debates/:id` | Fetch the current session snapshot for refresh recovery |
| `GET /api/debates/:id/events` | Stream status, messages, evidence, final report, and errors over SSE |
| `POST /api/debates/:id/pause` | Request pause after the current API call finishes |
| `POST /api/debates/:id/resume` | Submit user-added factors and continue |
| `POST /api/debates/:id/stop` | Stop the current debate |
| `GET /api/debates/:id/export` | Export the current Markdown report |

SSE event types include `status`, `progress`, `message`, `evidence`, `warning`, `paused`, `finalReport`, `complete`, and `error`.

## Supported Providers

### LLM

- DeepSeek
- OpenAI-compatible custom services
- Anthropic Messages
- Qwen / DashScope
- Moonshot / Kimi
- Zhipu GLM
- Doubao / Volcengine
- SiliconFlow
- OpenRouter

### Search

- Bocha API
- Tavily API
- LLM native search
- Hybrid mode

## Development Notes

The core design goal is to stay explainable, traceable, and exportable:

- The three agents' private histories do not contaminate each other; they only share the public transcript, source IDs, and guidance.
- All sources become `EvidenceItem` objects with backend-assigned global source IDs.
- A/B speeches must cite provided source IDs to reduce hallucinated references.
- Financial and market data should come from structured evidence; plain web pages are background only.
- The moderator final report is displayed only as rendered Markdown while the raw Markdown remains exportable.
- `Reply word limit except final` is optional and off by default; when enabled it uses prompts, audit, compression, and local fallback clamping to constrain non-final replies.
- Frontend export prefers backend Markdown, and falls back to Markdown generated from the current browser snapshot when the backend endpoint is unavailable.
- `?mock=1` can run 1 to 10 regression rounds without real API keys.

## License

This project is open-sourced under the [MIT License](./LICENSE).
