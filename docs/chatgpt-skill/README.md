# CiceroMachine：ChatGPT Skill 发布说明

本目录说明与原 TypeScript 应用并存的 ChatGPT Skill。Skill 入口为 [skills/cicero-machine/SKILL.md](../../skills/cicero-machine/SKILL.md)，各框架的加载目录和运行限制见 [INSTALLATION.md](INSTALLATION.md)。主 README 和英文 README 保留原文并增加 Skill 入口；其他语言 README、前后端、测试、依赖配置和图片保持原样。

本次整理日期：**2026-10-29（Asia/Shanghai）**。上游基线：[`8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd`](https://github.com/TimeCracker/CiceroMachine/tree/8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd)。本封装通过独立分支和 Pull Request 加入原仓库，不改变上游应用的版本号，也不代表已发布 GitHub Release。

## 已有内容的复用

已找到之前生成的 `cicero-machine-chatgpt-skill.zip`，并与当前已安装 Skill 对比：**7 个 Skill 文件全部逐字节相同**。本次直接复用这 7 个文件，不重建、不重装，也不改写辩论流程。

旧包以独立项目为根，包含自己的 `README.md`、`.gitignore`、`LICENSE` 和 `SHA256SUMS`。这些根文件不覆盖原仓库；新的发布说明集中在本目录。旧包 SHA-256 与逐文件来源记录见 [release-manifest.json](release-manifest.json)。

## 包的选择

| 文件 | 内容 | 适用方式 |
| --- | --- | --- |
| `CiceroMachine-github-release-2026-10-29.zip` | `CiceroMachine/` 下的完整原项目和新增目录 | 完整快照、审阅、备份 |
| `CiceroMachine-chatgpt-skill-additions-2026-10-29.zip` | 仅 `skills/cicero-machine/` 与 `docs/chatgpt-skill/` | 向已有仓库的新分支上传，推荐 |

上表是初次整理的下载快照：包含上游 **47 个文件**，对应递归树中的 **56 个路径（47 个文件、9 个目录）**；新增 **13 个文件**，当时原文件修改 0。后续仓库文档更新又增加本安装指南，并在主 README 和英文 README 增补入口；当前相对原始基线为 **14 个新增文件、2 个 README 文档修改，程序代码修改 0、删除 0**。早先 ZIP 不包含这次文档增补，当前内容以仓库为准。

## 文件导航

| 路径 | 用途 |
| --- | --- |
| [INSTALLATION.md](INSTALLATION.md) | ChatGPT、Codex、Claude Code、DeepSeek Harness 等加载步骤与运行适配边界 |
| [SKILL.md](../../skills/cicero-machine/SKILL.md) | 运行契约、预算、串行调度、证据纪律、暂停恢复 |
| [roles.md](../../skills/cicero-machine/references/roles.md) | A/B/C 约束及公开消息包 |
| [report-template.md](../../skills/cicero-machine/references/report-template.md) | 八部分最终报告和来源附件 |
| [upstream.md](../../skills/cicero-machine/references/upstream.md) | 既有 Skill 的上游映射；保留原核对日期 2026-10-28 |
| [openai.yaml](../../skills/cicero-machine/agents/openai.yaml) | 展示元数据、默认提示、图标路径 |
| [CAPABILITY-MAPPING.md](CAPABILITY-MAPPING.md) | 保留、重实现、不能完整复现及刻意变更的能力 |
| [FILE-DIFF.md](FILE-DIFF.md) | 原项目与封装的完整文件差异清单 |
| [VALIDATION.md](VALIDATION.md) | 实际检查结果及验证边界 |
| [release-manifest.json](release-manifest.json) | 固定提交、来源、原文件 Git blob SHA、SHA-256 与新增清单 |
| [verify_release.py](verify_release.py) | 无第三方依赖的离线包完整性与引用检查 |

## 初次下载包的上传方式

这一节仅适用于尚未添加 Skill 的仓库。Skill 已通过 PR #1 加入本仓库 main，无需重新上传早先 ZIP；后续安装说明通过单独的文档 PR 更新。

1. 解压**仅新增文件包**。包内的 `skills/`、`docs/` 对应原仓库根目录，不能多套一层项目文件夹。
2. 在 `TimeCracker/CiceroMachine` 的当前 main 基础上建立新分支，例如 `add/chatgpt-skill`。
3. 上传 `skills/cicero-machine/` 和 `docs/chatgpt-skill/`，保留子目录。若这些目标文件已经存在，先核对差异；不要覆盖新版本。
4. 查看变更清单：应只有这两个目录的 **13 个新增文件**。根 README、`src/`、`server/`、`package.json`、锁文件和原图片均不应显示修改或删除。
5. 在该分支运行下方验证命令，然后通过 Pull Request 审阅。是否合入 main 由仓库维护者决定。

也可以在本地新分支完成复制后执行：

```bash
git add -- skills/cicero-machine docs/chatgpt-skill
git diff --cached --name-status
git diff --cached --stat
```

确认均为预期新增后再自行提交、推送。若 main 已晚于上述基线，保留新 main 的代码；本包的“原文件完全一致”检查会指出与旧快照的差异，这不自动意味着新代码有错。此时先用 `--overlay` 检查新增封装，再审阅与当前 main 的 Git 差异。不要把完整快照整仓覆盖到更新后的 main。

上述 ZIP 是上传前的下载快照。仓库内版本沿用相同的 7 个 Skill 文件，补充本说明；当前分支和合并状态以 GitHub 上对应的 Pull Request 为准。

## 安装和运行

完整的环境对照、复制命令、调用方法与尚未实现的适配项见 [INSTALLATION.md](INSTALLATION.md)。格式可加载不代表满足本 Skill 的 GPT/ChatGPT 内置搜索契约。

安装单元是整个 `skills/cicero-machine/` 文件夹，须保留其中 7 个文件。使用目标环境实际提供的技能加载/导入流程；GitHub 上传本身不会让所有 ChatGPT 会话自动拥有该技能。当前已经安装的同版技能无需重复安装。

运行前必须具备：

- 读取 Skill 及相对参考文件的能力。
- 真正创建、继续和调度 GPT 子代理的能力，且能隔离上下文。
- ChatGPT 内置搜索和网页读取能力。

`agents/openai.yaml` 中的产品列表只是既有展示元数据，并非 ChatGPT、Codex、API、Atlas 的逐平台兼容性测试或工具可用性保证。没有子代理工具时不能声称执行了独立多 Agent 辩论；只有用户明确要求才能做标明降级的角色模拟。子代理没有搜索时可由主会话执行其查询并原样回传；整个会话都无搜索时，须先取得用户对离线分析的明确接受。

Skill 使用当前环境的 GPT 模型，不要求外部 API Key，不启动 Express/Vite，不调用 Bocha、Tavily、Yahoo 行情 API 或第三方模型。原 Web 应用仍按原 README 的方式运行，两种入口互相独立。

## 示例

```text
使用 CiceroMachine 辩论：一个 20 人的软件团队，未来一年是否应优先采用
模块化单体，而不是拆分微服务？进行 3 轮，评判标准为交付速度、可靠性
和运维成本。正反方都搜索反证，只使用 ChatGPT 内置搜索。
最后给出成立条件、反转条件和可点击来源。
```

支持 `$cicero-machine` 调用语法的环境也可使用这个名称。默认中文、3 轮、每方每轮 2 个针对性查询，必要时按证据缺口追加；默认公开发言约 300–600 汉字。用户指定参数优先。

```text
暂停。补充因素：团队只有两名运维人员。先保存公开进度。
```

用户明确说“继续”后复用可用代理；如前提发生实质变化，说明哪些旧结论失效并从受影响阶段重做。跨会话续辩需要已保存或用户提供的公开记录，不能保证恢复原代理私有上下文。

```text
把已完成研究导出为 Markdown，包含参数、最终报告、来源表、查询日志、
公开逐轮发言和主持人审计，不包含隐藏思维链或完整代理私有历史。
```

## 本地验证

完整包解压后，在 `CiceroMachine/` 执行（Python 3.9+）：

```bash
python3 docs/chatgpt-skill/verify_release.py
```

仅新增文件包解压后，在包含 `skills/`、`docs/` 的目录执行：

```bash
python3 docs/chatgpt-skill/verify_release.py --overlay
```

完整模式核验未改动的原文件、清单明确列出的 README 更新及新增文件；overlay 模式仅核验新增文件，不能证明原项目或 README 更新完整。两者均检查相对文件引用、Skill 入口与元数据引用。清单不对自身做散列，也不是数字签名；Git blob SHA 用于内容核对，不构成下载渠道的身份认证。

## 许可

保留 [原项目 MIT LICENSE](../../LICENSE) 与 [Skill 随附 LICENSE](../../skills/cicero-machine/LICENSE)，Copyright (c) 2026 TimeCracker。两份许可证逐字节一致。
