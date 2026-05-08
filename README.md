<p align="right">
  <a href="./README.md">简体中文</a> | <a href="./README.zh-TW.md">繁體中文</a> | <a href="./README.en.md">English</a> | <a href="./README.ja.md">日本語</a> | <a href="./README.ko.md">한국어</a>
</p>

<div align="center">
  <img src="./docs/assets/cicero-machine-senate.png" alt="八位机像素风格的两个西塞罗在罗马元老院中辩论" width="100%" />

  <h1>Cicero Machine</h1>

  <p>
    <em>"In disputando veritas gignitur."</em><br />
    真理在辩论中诞生——西塞罗（Marcus Tullius Cicero）
  </p>

  <p>
    <strong>后端三独立 Agent 辩论工作台</strong><br />
    让正反双方按发言顺序联网检索和辩论，再由主持人汇总证据、公式与最终结论。
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

## 这是什么？

Cicero Machine 是一个“后端 Agent 服务 + 前端工作台”的研究与辩论工具。你输入辩题和 API Key 后，后端会创建一次内存中的辩论会话，并运行三个独立的 AgentRuntime：

| Agent | 角色 | 独立状态 | 做什么 |
| --- | --- | --- | --- |
| A | 正方 | 独立 history、memory、source pool、search log | 轮到自己发言前检索支持性证据，构造正方论点，回应反方挑战 |
| B | 反方 | 独立 history、memory、source pool、search log | 在看到 A 当前轮发言后检索反例和风险证据，攻击正方假设 |
| C | 主持人 | 独立 memory、guidance、audit log | 轮间点评、提出下一步追问，并在最后生成 Markdown 研究报告 |

A/B/C 不共享私有对话历史，只通过后端 orchestrator 交换公开发言、全局 source ID、用户补充因素和主持人 guidance。一个 DeepSeek 或其他 LLM API Key 可以同时供三名 agent 使用。

它适合用来做：

- 投资观点的多角度拆解
- 产品策略或技术路线辩论
- 政策、商业、组织问题的证据化讨论
- 需要保留来源链接和推导公式的研究记录

## 功能亮点

- **三套独立 AgentRuntime**：A/B/C 在后端分别维护自己的 history、memory、证据池、搜索记录和审计状态。
- **按发言顺序串行检索**：每轮 A 先查再讲，B 看到 A 当前轮发言后再查再反驳，降低搜索 API 并发触发限流的概率。
- **联网检索证据**：支持博查 API、Tavily API、OpenAI/Anthropic 原生搜索和混合模式。
- **DeepSeek 适配**：默认支持 DeepSeek OpenAI-compatible Chat Completions，可复用同一个 API Key。
- **全局来源编号**：后端 `EvidenceRegistry` 统一分配 `S1/S2/S3...`，URL 全局去重，并记录每个 source 由哪个 agent、哪一轮、哪个 query 发现或引用。
- **来源可点击**：正文里的 `[S1]`、`[S2]` 会渲染成可点击来源链接。
- **主持人引导进入下一轮**：C 的轮间追问会被广播给 A/B，并注入下一轮检索和发言任务。
- **暂停继续**：用户可以暂停辩论，补充新的考虑因素，再让 agent 继续。
- **最终结论 Markdown 渲染**：标题、列表、表格、链接、source 引用都能在线预览。
- **截断自动续写和失败 fallback**：最终总结如果被截断会自动续写；两次模型调用失败时会生成明确标注的本地 fallback Markdown。
- **导出 Markdown**：辩论完成后可导出最终报告、证据 URL、来源归属和完整辩论记录。

## Demo 截图

<table>
  <tr>
    <td width="38%" valign="top">
      <a href="./docs/assets/demo-workbench.jpg">
        <img src="./docs/assets/demo-workbench.jpg" alt="Cicero Machine full debate workbench demo screenshot" width="360" />
      </a>
      <br />
      <sub>完整辩论工作台：配置、A/B/C 发言、source 引用、证据池与最终结论。</sub>
    </td>
    <td width="62%" valign="top">
      <a href="./docs/assets/demo-final-report.jpg">
        <img src="./docs/assets/demo-final-report.jpg" alt="Cicero Machine rendered final markdown report demo screenshot" width="720" />
      </a>
      <br />
      <sub>最终结论 Markdown 渲染：表格、列表、source chip 和后续研究建议。</sub>
    </td>
  </tr>
</table>

## 工作流

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

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动本地开发服务

```bash
npm run dev
```

这个命令会同时启动：

- Express 后端：`http://127.0.0.1:8787`
- Vite 前端：`http://127.0.0.1:8000/debate.html`

### 3. 配置 API Key

在页面中填入：

- LLM API Key：例如 DeepSeek API Key
- 搜索 API Key：例如博查 API Key 或 Tavily API Key
- 模型名：默认 `deepseek-v4-flash`

API Key 保存在当前浏览器的 `localStorage`，开始辩论时只发送给本次后端内存 session。后端不写入数据库，也不会持久化保存 Key。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 同时启动后端和 Vite 前端，并打开 `/debate.html` |
| `npm run dev:server` | 只启动 Express 后端 TypeScript watcher |
| `npm run dev:web` | 只启动 Vite 前端，`/api` 代理到后端 |
| `npm run check` | TypeScript 类型检查 |
| `npm run test` | 运行 Vitest 单元测试 |
| `npm run build` | 构建前端生产产物并做类型检查 |
| `npm start` | 生产模式启动 Express 后端，并托管 `dist/` |
| `npm run preview` | 仅预览 Vite 静态构建，不运行后端 agent API |

## 部署

当前版本不再是纯静态前端，生产部署需要一个能长期运行 Node.js 的服务。构建后由 Express 后端托管 `dist/`，并提供 `/api/debates` 与 SSE 事件流。

```bash
npm install
npm run build
npm start
```

默认生产地址：

```text
http://127.0.0.1:8787/debate.html
```

可以通过环境变量修改端口：

```bash
PORT=3000 npm start
```

部署选项：

| 场景 | 建议 |
| --- | --- |
| 本机或内网使用 | 直接 `npm start`，用 Nginx/Caddy 做反向代理可选 |
| VPS / 云服务器 | 安装 Node.js，运行 `npm run build && npm start`，前面放 HTTPS 反向代理 |
| Render / Railway / Fly.io 等 Node 平台 | Build Command: `npm install && npm run build`; Start Command: `npm start` |
| Vercel / Netlify 静态托管 | 不适合作为纯静态部署，因为需要 Express API 和 SSE |
| GitHub Pages | 不适合当前架构，只能托管前端，不能运行后端 agent 服务 |

## 安全与费用注意

当前调用链是：

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

这意味着：

- 不要在代码中硬编码 API Key。
- 后端不持久化 API Key，但公开部署时用户的 Key 会传到你部署的服务器，因此必须使用 HTTPS，并确保用户信任该服务。
- 当前没有用户系统、数据库和租户隔离；如果要公开给多人长期使用，需要补充认证、限流、日志脱敏、费用控制和 session 清理策略。
- 搜索 API 可能有频率限制。当前实现已按发言顺序串行检索，并对单次搜索失败做降级，但账号额度耗尽仍会返回 provider warning。

## 项目结构

```text
.
├── debate.html                 # Vite HTML 入口，保留 /debate.html
├── src                         # 前端工作台
│   ├── main.ts                 # DOM 绑定、SSE event apply、渲染和导出触发
│   ├── config.ts               # Provider 预设和默认配置
│   ├── types.ts                # 前后端共享核心类型
│   ├── services                # 前端 debateClient 与轻量 HTTP helper
│   └── ui                      # 图标、Markdown 渲染、source 链接
├── server                      # 后端 agent 服务
│   ├── index.ts                # Express API、SSE、生产静态资源托管
│   ├── domain
│   │   ├── agents.ts           # A/B/C AgentRuntime
│   │   ├── orchestrator.ts     # 轮次调度、暂停继续、停止、导出
│   │   └── evidenceRegistry.ts # 全局 source 编号、URL 去重、uses 归属
│   ├── services                # LLM、搜索、金融行情、HTTP 超时
│   └── mock.ts                 # ?mock=1 回归测试数据
├── docs/assets                 # README 视觉素材
├── vite.config.ts              # Vite dev server 和 /api proxy
└── package.json
```

## 后端 API

| API | 用途 |
| --- | --- |
| `POST /api/debates` | 创建并启动一次辩论 session |
| `GET /api/debates/:id/events` | 通过 SSE 推送状态、消息、证据、最终报告和错误 |
| `POST /api/debates/:id/pause` | 请求在当前 API 调用结束后暂停 |
| `POST /api/debates/:id/resume` | 提交用户补充因素并继续 |
| `POST /api/debates/:id/stop` | 停止当前辩论 |
| `GET /api/debates/:id/export` | 导出当前 Markdown 报告 |

SSE event 类型包括 `status`、`progress`、`message`、`evidence`、`warning`、`paused`、`finalReport`、`complete`、`error`。

## 支持的 Provider

### LLM

- DeepSeek
- OpenAI-compatible 自定义服务
- Anthropic Messages
- Qwen / DashScope
- Moonshot / Kimi
- 智谱 GLM
- 豆包 / Volcengine
- 硅基流动
- OpenRouter

### Search

- 博查 API
- Tavily API
- LLM 原生搜索
- 混合模式

## 开发说明

核心设计目标是保持“可解释、可追溯、可导出”：

- 三个 agent 的私有 history 不互相污染，只共享公开 transcript、source ID 和 guidance。
- 所有证据统一为 `EvidenceItem`，并由后端分配全局 source ID。
- A/B 的发言必须引用已提供的 source ID，减少模型伪造来源。
- 财务/行情数据优先使用结构化证据，普通网页搜索只能作为背景材料。
- 主持人最终报告只以渲染后的 Markdown 形式展示，同时保留原始 Markdown 供导出。
- `?mock=1` 可在没有真实 API Key 的情况下跑通 1 到 10 轮回归测试。

## License

本项目基于 [MIT License](./LICENSE) 开源。
