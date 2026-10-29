# 原项目与 ChatGPT Skill 的能力映射

核对日期：2026-10-29（Asia/Shanghai）。原项目基线：[`8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd`](https://github.com/TimeCracker/CiceroMachine/tree/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd)。Skill 复用已存在的 7 个文件，运行入口见 [SKILL.md](../../skills/cicero-machine/SKILL.md)。

这里的“保留”指研究机制和输出要求保留；不表示执行载体、模型输出、检索覆盖、延迟、成本或容错保证等价。Skill 是由宿主执行的指令包，不是 TypeScript 代码的编译结果，也没有内置新的 agent 服务。

## 主要能力

| 能力 | 上游实际实现 | Skill 的实现与边界 | 分类 |
| --- | --- | --- | --- |
| A/B/C 独立角色 | `AgentRuntime` 各有 history、memory、source pool、search/audit log；由 `DebateSession` 创建 | 主会话创建 3 个真正的隔离 GPT 子代理，复用 agent ID，只交换公开信息；各角色可能使用同一基础模型 | 机制保留，宿主重实现 |
| 发言顺序 | orchestrator 先执行 A，再将 A 当前发言交给 B 的取证与发言方法 | A→登记→B→登记/核验→C，禁止同轮 A/B 最终发言并行 | 保留并明确协议 |
| 三阶段 | `speak()` 首轮 opening、中间 clash、末轮 convergence；上游仅 1 轮时走 opening | 开场、对抗、收束；明确 1/2 轮短流程 | 保留，短流程有扩展 |
| Steel-man 与让步 | `buildDebaterSystemPrompt()` 要求复述最强论点、每次必须让步，不能答“无” | 复述对方最强论点、承认有效证据；无有效反证时允许不让步并提出改判条件 | 刻意变更，避免虚假平衡 |
| 主持人审计 | 非最终偶数轮点评，最终轮报告 | 每轮 C 审计，最后审计后出报告 | 增强，不是相同频率 |
| Guidance 回流 | C 的盲区和追问被提取，进入下一轮检索/发言上下文 | 主会话广播 C 的公开 guidance，A/B 后续回应 | 保留，消息调度重实现 |
| 独立取证 | 每个角色规划查询，覆盖类查询与生成查询合并 | A/B 都查支持和反证；B 读 A 当前发言后规划查询 | 保留；查询覆盖不相同 |
| 模型与搜索调用 | `LLMService`、`SearchService` 提供多模型与 Bocha/Tavily/模型原生/混合搜索 | 只用当前 GPT 子代理与 ChatGPT 内置搜索/网页读取，不调用这些服务 | 替换实现 |
| 全局来源编号 | `EvidenceRegistry` 分配 S 编号、规范化 URL、记录 uses；无 URL 时可退到标题键 | 主会话唯一分配 S 编号，局部 ID 映射、URL 去重、原文核验、用途与查询记录 | 机制保留，登记算法不逐项等价 |
| 来源真实性检查 | ID 校验、关键词启发式、自动修订；部分证据材料来自摘要 | 要求核验主张与原文的支持关系，区分全文/摘要/未核实；根代理引用子代理来源前自己打开 | 语义要求加强；非程序式强保证 |
| 最终报告 | 固定八部分研究报告、条件性结论、公式与来源 | 同样八部分，区分事实/推论/情景/未知，条件与反转证据齐全 | 保留 |
| 暂停、补因素、继续 | API 调用后检查点 pause，resume 注入 guidance；stop 中止并使该 session 不可继续 | 对话停止派发、按工具能力中断、保存公开 cursor，继续时复用代理；停止后可凭记录重建 | 重新实现，语义不完全等价 |
| Markdown 导出 | 后端 `buildMarkdown()`，前端可用快照 fallback | 按需生成报告、来源、查询日志、公开逐轮过程 | 内容保留，导出通路重实现 |
| 默认预算 | rounds=3、queriesPerAgent=2、字数硬限制默认关闭；查询规划默认最多 5 条实际查询 | 3 轮、每方每轮 2 查询、约 300–600 汉字，缺证可追加 | 默认参数部分相同，成本不同 |

## 无法完整复现或明确不提供的部分

| 原版功能 | Skill 的限制 |
| --- | --- |
| Vite/Express 网站、SSE、折叠面板、source chip、配置 UI、实时连接状态 | 对话进度与链接无法复现这些界面/协议；原应用源码完整保留，可另行运行 |
| 外部模型选择、API endpoint、token/temperature/timeout、DeepSeek thinking 控制 | 继承宿主可用 GPT，不保证这些调用参数可控；独立角色不保证模型多样性 |
| Bocha 结构化卡片、Yahoo chart 延迟行情 | 不调用行情接口；仅用内置搜索读取可核验一手材料；实时性和字段完整性无保证，缺失值保留未知 |
| 后端内存 session 与浏览器重连 | 无相同进程内存/会话 ID；跨会话只凭公开检查点重建，不恢复私有历史 |
| 程序控制的请求 abort、timeout、重试、队列限流 | 依赖宿主工具实际支持的操作，不能承诺相同中断时机、延迟和吞吐 |
| 回复硬字数检查与自动压缩、最终输出截断续写和本地 fallback | Skill 使用指令和返回检查，请 C 续写；失败交付明确标注的部分结果，没有同一套确定性本地 fallback 代码 |
| 原应用 Vitest 测试及 mock 服务 | 测试验证 TypeScript 实现，不能替代 ChatGPT 多 Agent 端到端运行测试；文件保留但本次未运行 |
| 任意 ChatGPT 会话即插即用 | 必须具备 Skill 加载、子代理和内置搜索工具；元数据不能授予这些能力 |
| 双语查询配比、按来源语言交错排序 | Skill 可按语言和证据需要检索，但没有逐项复刻上游的中英文查询搭配及证据排序算法 |

## 需要特别披露的行为差异

1. **B 的开场上下文。** 上游 orchestrator 把 A 当前发言传入 B 的检索和 `speak()` 参数，但 `speak()` 的 opening 用户提示没有直接嵌入 `opponentSpeech`；该内容用于先前查询规划。Skill 明确要求把 A 当前公开发言直接交给 B，并在 B 发言前阅读。
2. **审计不是每轮同频复刻。** 上游 `round === rounds ? final : round % 2 === 0 ? commentary : null`。Skill 对所有完成轮次要求 C 审计。
3. **单轮不等于三阶段。** 上游一轮只执行开场与最终报告。Skill 在同一轮内额外安排简短回应和收束，复用该轮预算，披露缺少多轮追问。
4. **计数式约束被语义核验替代。** 上游有至少两条 source ID、四类因素覆盖、让步/steel-man 关键词检查；Skill 不强制凑足来源或因素数量，也不把关键词当推理正确性的证明。
5. **财务取证政策变化。** 上游要求财务数字来自指定结构化 provider。Skill 改为内置搜索访问一手财报/披露等资料、标明期间和口径；无法核验的行情仍为未知，不能宣称等价行情覆盖。
6. **去重并非逐项移植。** 上游 URL 去片段并排序查询参数；Skill 只去明确追踪项与用于去重的片段，保留资源身份参数、原始链接与定位，且不合并不同版本。
7. **共识定义更严格。** 上游报告提示包含双方未争议事实；Skill 要求认可且核验，未被质疑不自动成为事实共识。
8. **停止后重建是扩展。** 原 stop 后的同一个 session 不能继续。Skill 可从公开记录重建新代理，必须说明丢失私有上下文，不能把它说成恢复原 session。

## 辩论流程一致性

| 轮数 | 公开执行顺序 |
| --- | --- |
| 1 | A 开场 → B 开场与回应 → A 简短回应与收束 → B 简短收束 → C 审计与报告；后两次发言不另算轮 |
| 2 | R1：A 开场 → B 开场与回应 → C；R2：A 反驳/收束 → B 反驳/收束 → C 审计与报告 |
| 3 | R1 开场、R2 对抗、R3 收束；每轮 A→B→C，最后 C 报告 |
| 5 | R1 开场、R2–R4 对抗、R5 收束；每轮 A→B→C，最后 C 报告 |

每次 A/B 完成后由主会话登记局部来源、回传 S 编号；C 只依据公开发言和核验状态。B 必须收到 A 同轮发言，A 从第二轮起收到 B 上轮发言。暂停后不自动恢复；无工具和 agent 失败不得编造已完成步骤。角色细则以 [roles.md](../../skills/cicero-machine/references/roles.md) 为准。

C 主动请求补充检索时，同样受 SKILL.md 的全局来源登记和核验规则约束；不能跳过主会话登记，把未编号的新来源直接写入最终报告。现有角色文件的 C 专用返回字段没有再次列出 `new_evidence/search_log`，属于可在未来版本进一步明确的非阻断项，本次保持已有 Skill 原样。

## 核对依据

以下链接固定到本次基线，不跟随未来 main 漂移：

- [orchestrator.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/server/domain/orchestrator.ts)：创建角色、A/B 顺序、C 频率、暂停停止、导出。
- [agents.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/server/domain/agents.ts)：`speak()`、`moderate()`、`auditSpeech()`、`planSearchQueries()`、角色提示和报告。
- [evidenceRegistry.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/server/domain/evidenceRegistry.ts) 与 [utils.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/server/domain/utils.ts)：全局编号、URL、uses。
- [search.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/server/services/search.ts)、[finance.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/server/services/finance.ts)、[llm.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/server/services/llm.ts)：外部适配。
- [config.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/src/config.ts) 与 [index.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/server/index.ts)：默认值、API、内存 session。

本表基于代码与 Skill 的静态对照，不声称已完成在线检索、多 Agent 调度、跨会话恢复或行情覆盖的端到端验证。
