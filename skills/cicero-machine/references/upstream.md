# 上游与 ChatGPT 适配

- 项目：[TimeCracker/CiceroMachine](https://github.com/TimeCracker/CiceroMachine)。
- 阅读基线：`8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd`，2026-10-28 核对。
- 许可：MIT，Copyright (c) 2026 TimeCracker；保留根目录 LICENSE。
- 本技能是工作流的 ChatGPT 原生适配，不是原 Web 应用安装包或上游官方发布。

| 上游机制 | ChatGPT 适配 |
| --- | --- |
| 独立 A/B/C AgentRuntime | 隔离上下文的 GPT 正方、反方、主持人 agents |
| A→B 顺序发言 | 保留顺序，并确保 B 开场也直接收到 A 当前发言 |
| 开场、对抗、convergence | 保留三阶段，默认 3 轮 |
| steel-man、具体让步、边界 | 保留；无有效反证时允许明确不让步并给改判条件，防止虚假平衡 |
| 偶数非最终轮 C 点评，最后 C 报告 | 增强为每轮 C 审计，最后输出报告 |
| EvidenceRegistry URL 去重、全局 S 编号、uses | 主会话登记、去重、核验、映射和用途记录 |
| 多模型及外部搜索适配 | 仅当前 GPT agents + ChatGPT 内置搜索 |
| Bocha/Yahoo 金融数据服务 | 内置搜索读取一手资料并核对口径；缺失值保持未知 |
| SSE、暂停/继续、导出 | 对话进度、公开检查点、按需 Markdown |
| 进程内存会话恢复 | 复用可用 agent；跨会话只凭公开保存记录重建 |

上游默认 rounds=3、queriesPerAgent=2、回复硬字数限制关闭，搜索规划还会扩展至默认最多 5 条实际查询。本技能默认每方每轮 2 个针对性查询和简洁公开发言，按缺口追加；不声称成本或覆盖与原服务相同。

上游 pause 在 API 调用后的检查点生效，stop 中断且该 session 不可继续。本技能停止后的检查点重建续辩属于扩展。上游部分审计依赖关键词，本技能要求核验来源是否支持具体主张，不以关键词出现作为有效论证。

更新时优先核对以下文件；不运行外部服务配置：

- [README.md](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/README.md)：阶段、独立状态、报告结构。
- [agents.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/server/domain/agents.ts)：角色、查询、让步、审计、总结。
- [orchestrator.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/server/domain/orchestrator.ts)：调度、暂停、停止、导出。
- [evidenceRegistry.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/server/domain/evidenceRegistry.ts)：来源编号与归属。
- [config.ts](https://github.com/TimeCracker/CiceroMachine/blob/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd/src/config.ts)：默认值。

更新不能回退用户明确指定的 GPT 双方与内置搜索约束，除非用户重新指定。
