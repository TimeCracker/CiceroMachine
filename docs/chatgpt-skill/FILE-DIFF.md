# CiceroMachine 发布包文件差异清单

整理日期：2026-10-29（Asia/Shanghai）。对照原仓库固定提交 `8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd`。

**当前相对原始基线：45 个原文件字节不变，2 个 README 保留原文并增加 Skill 说明，新增 14 个文件；程序代码修改 0、删除 0、重命名 0。**

初次下载包与已合并 PR #1 的范围是新增 13 个文件、原文件修改 0。本次文档增补基于 PR #1 的合并提交 `88cd5a4037387cb79f1ad374a10583d79ef74b97`，新增安装指南并更新中英文 README、相关清单与验证资料；7 个 Skill 文件继续保持原样。

GitHub 递归树的“56 个路径”包含 47 个文件和 9 个目录，不是 56 个文件。原始 TypeScript 项目与 Skill 封装共存，目录和运行载体不同。

## 新增文件（A）

| 路径 | 内容来源/用途 |
| --- | --- |
| `docs/chatgpt-skill/CAPABILITY-MAPPING.md` | 原版/Skill 能力差异与源码依据 |
| `docs/chatgpt-skill/FILE-DIFF.md` | 本差异清单 |
| `docs/chatgpt-skill/INSTALLATION.md` | 各宿主加载目录、复制步骤及运行时适配边界 |
| `docs/chatgpt-skill/README.md` | 新增的安装、使用与新分支上传说明 |
| `docs/chatgpt-skill/VALIDATION.md` | 实际检查结果及边界 |
| `docs/chatgpt-skill/release-manifest.json` | 文件清单、基线、来源与内容哈希 |
| `docs/chatgpt-skill/verify_release.py` | 离线包验证脚本，Python 标准库 |
| `skills/cicero-machine/LICENSE` | 随技能分发的 MIT 许可，原样复用 |
| `skills/cicero-machine/SKILL.md` | 现有技能入口，原样复用 |
| `skills/cicero-machine/agents/openai.yaml` | 展示/调用元数据，原样复用 |
| `skills/cicero-machine/assets/icon.svg` | 图标，原样复用 |
| `skills/cicero-machine/references/report-template.md` | 八部分报告模板，原样复用 |
| `skills/cicero-machine/references/roles.md` | 角色与公开消息协议，原样复用 |
| `skills/cicero-machine/references/upstream.md` | 既有上游映射，原样复用 |

## 与先前 ChatGPT 发布包的差异

发现已有 `cicero-machine-chatgpt-skill.zip`，其 7 个 Skill 文件与当前已安装版本一致；本次继续逐字节复用，未重复创建技能。

| 旧包内容 | 本次处理 |
| --- | --- |
| `skills/cicero-machine/` 的 7 个文件 | 原路径层级复用，无内容变化 |
| 旧包根 `README.md` | 不覆盖原 README；按并存发布场景整理到 `docs/chatgpt-skill/README.md` |
| 旧包根 `.gitignore` | 不导入；原仓库 `.gitignore` 保持原样 |
| 旧包根 `LICENSE` | 原仓库已有相同许可，保持原文件；Skill 内许可仍随目录分发 |
| 旧包根 `SHA256SUMS` | 不复用过期范围；新 manifest 覆盖当前完整内容清单 |
| 原 TypeScript 应用 | 旧包没有包含；此次完整包补入固定提交的全部原文件 |

先前 ZIP 的 SHA-256：`105313d0270fafaf2c30600420c14d34a36b67e9065738f57b31101ea447bed9`。

## 原文件状态（= / M）

原始内容的 SHA-256/Git blob SHA 保留在 `release-manifest.json` 的 `upstream_files`；当前两个 README 的内容哈希单独列在 `modified_upstream_files`。其余 45 个原文件继续与上游基线逐字节一致。

| 原路径 | 状态 |
| --- | --- |
| `.gitignore` | = 字节不变 |
| `LICENSE` | = 字节不变 |
| `README.en.md` | M 保留原文，增加应用/Skill 双入口和安装位置表 |
| `README.ja.md` | = 字节不变 |
| `README.ko.md` | = 字节不变 |
| `README.md` | M 保留原文，增加 Skill 入口、安装与兼容性说明 |
| `README.zh-CN.md` | = 字节不变 |
| `README.zh-TW.md` | = 字节不变 |
| `debate.html` | = 字节不变 |
| `docs/assets/cicero-machine-hero.svg` | = 字节不变 |
| `docs/assets/cicero-machine-icon.png` | = 字节不变 |
| `docs/assets/cicero-machine-senate.png` | = 字节不变 |
| `docs/assets/demo-final-report.jpg` | = 字节不变 |
| `docs/assets/demo-workbench-and-final-report.jpg` | = 字节不变 |
| `docs/assets/demo-workbench.jpg` | = 字节不变 |
| `package-lock.json` | = 字节不变 |
| `package.json` | = 字节不变 |
| `server/domain/agents.test.ts` | = 字节不变 |
| `server/domain/agents.ts` | = 字节不变 |
| `server/domain/evidenceRegistry.test.ts` | = 字节不变 |
| `server/domain/evidenceRegistry.ts` | = 字节不变 |
| `server/domain/orchestrator.test.ts` | = 字节不变 |
| `server/domain/orchestrator.ts` | = 字节不变 |
| `server/domain/utils.ts` | = 字节不变 |
| `server/index.ts` | = 字节不变 |
| `server/mock.ts` | = 字节不变 |
| `server/services/finance.ts` | = 字节不变 |
| `server/services/http.ts` | = 字节不变 |
| `server/services/llm.ts` | = 字节不变 |
| `server/services/search.ts` | = 字节不变 |
| `src/config.ts` | = 字节不变 |
| `src/domain/errors.test.ts` | = 字节不变 |
| `src/domain/errors.ts` | = 字节不变 |
| `src/domain/finalReport.test.ts` | = 字节不变 |
| `src/domain/finalReport.ts` | = 字节不变 |
| `src/domain/llm.test.ts` | = 字节不变 |
| `src/domain/llm.ts` | = 字节不变 |
| `src/main.ts` | = 字节不变 |
| `src/services/debateClient.ts` | = 字节不变 |
| `src/services/http.ts` | = 字节不变 |
| `src/styles.css` | = 字节不变 |
| `src/types.ts` | = 字节不变 |
| `src/ui/icons.ts` | = 字节不变 |
| `src/ui/markdown.test.ts` | = 字节不变 |
| `src/ui/markdown.ts` | = 字节不变 |
| `tsconfig.json` | = 字节不变 |
| `vite.config.ts` | = 字节不变 |

## 上传范围

最初的增量 ZIP 只含 13 个新增文件，不包含这次 README 与安装指南增补。当前更新以文档 PR 的文件差异为准；原程序代码与 Skill 均不作改写。

下载包生成时尚未推送。本目录通过独立分支和 Pull Request 加入原仓库；是否合并以 GitHub 状态为准。具体用法与验证命令见 `docs/chatgpt-skill/README.md`。

## 验证边界

完成 Skill 基础格式校验、静态流程与引用审核、文件哈希核验；未执行真实联网多 Agent 辩论，也未运行原 TypeScript 测试/构建。不会把静态检查说成端到端测试通过。
