# 安装与框架兼容性

核对日期：2026-10-29。当前仓库提供 **1 个 Skill：`cicero-machine`**，A/B/C 是该 Skill 调度的三个角色。

## 先区分“加载文件”和“能执行工作流”

`skills/cicero-machine/` 使用通用 Agent Skills 文件格式；其中的 [SKILL.md](../../skills/cicero-machine/SKILL.md) 仍明确规定使用 GPT 子代理和 ChatGPT 内置搜索。这是原始需求保留的运行契约，并未因 GitHub 发布而变成通用模型版本。

| 环境 | 如何加载 | 当前版本的运行状态 |
| --- | --- | --- |
| 支持 Skill 的 ChatGPT 环境 | 使用当前环境提供的技能管理流程，导入完整目录 | 目标环境；仍需实际具备 GPT 子代理及内置搜索，未完成真实多轮端到端验证 |
| Codex CLI / IDE | `.agents/skills/cicero-machine/` 或 `~/.agents/skills/cicero-machine/` | 可发现该文件格式；仅当模型和工具满足当前契约时才能按原样执行 |
| Claude Code 本地会话 | `.claude/skills/cicero-machine/` 或 `~/.claude/skills/cicero-machine/` | 可加载文件；Claude 模型及其搜索工具不符合当前 GPT/ChatGPT 搜索限定，需先适配 |
| DeepSeek Harness | `.dsh/skills/cicero-machine/`、`~/.dsh/skills/cicero-machine/`；也支持 `.agents/skills/` | 可加载文件；运行须适配宿主模型、子代理、搜索及引用方式 |
| OpenCode（包括接入 DeepSeek 模型） | `.opencode/skills/cicero-machine/` 或 `~/.config/opencode/skills/cicero-machine/` | 可加载文件；同样需要运行时适配 |

**以下目录复制步骤只安装指令文件，不代表本仓库已经提供 Claude / DeepSeek 可直接执行的适配版。** 当前也没有 `cicero-machine-claude` 或 `cicero-machine-deepseek` 这两个 Skill。

## ChatGPT：安装完整目录

取得整个 `skills/cicero-machine/`，通过当前产品和账户实际提供的 Skill 创建/导入能力安装。具备 skill-creator 的环境可以使用这样的请求：

```text
安装 https://github.com/TimeCracker/CiceroMachine 中的 skills/cicero-machine，
保留所有参考文件，并先确认真实 GPT 子代理与内置搜索工具可用。
如果已安装同版，不要重复创建。
```

安装后自然语言指定 CiceroMachine，或用环境提供的技能选择器。GitHub 上出现文件不会自动把它装入所有 ChatGPT 会话。只粘贴入口 Markdown 会遗漏角色协议、报告模板和上游说明。

## 本地框架：目录复制

先取得源码：

```bash
git clone https://github.com/TimeCracker/CiceroMachine.git
cd CiceroMachine
```

已有仓库时使用现有 checkout；不要重复克隆覆盖它。以下示例适用于 macOS/Linux，源路径相对于仓库根目录。

根据目标宿主，**只选一个**安装根目录：

| 目标 | 用户级安装根目录的 shell 赋值 |
| --- | --- |
| Codex | `cicero_skills_dir="$HOME/.agents/skills"` |
| Claude Code | `cicero_skills_dir="$HOME/.claude/skills"` |
| DeepSeek Harness | `cicero_skills_dir="${DSH_HOME:-$HOME/.dsh}/skills"` |
| OpenCode | `cicero_skills_dir="$HOME/.config/opencode/skills"` |

设置所选变量后执行下面的公共复制步骤。目标已存在时只提示，不覆盖：

```bash
if [ -z "${cicero_skills_dir:-}" ]; then
  printf '%s\n' '请先按表格设置 cicero_skills_dir。'
elif [ -e "$cicero_skills_dir/cicero-machine" ] || [ -L "$cicero_skills_dir/cicero-machine" ]; then
  printf '%s\n' '目标已存在，请先比较版本；本命令不覆盖。'
else
  mkdir -p "$cicero_skills_dir" &&
  cp -R skills/cicero-machine "$cicero_skills_dir/cicero-machine"
fi
```

若只希望当前项目可见，把表中的根目录改为 `$PWD/.agents/skills`、`$PWD/.claude/skills`、`$PWD/.dsh/skills` 或 `$PWD/.opencode/skills`，再执行同一段复制命令。不要把仓库根的 `skills/` 默认当作所有宿主都会扫描的目录。

复制后，`SKILL.md` 应直接位于所选根目录的 `cicero-machine/` 内。完整目录应含 7 个文件：入口、LICENSE、`agents/openai.yaml`、图标与三个参考文件。

## 各环境如何检查和调用

### Codex CLI / IDE

可通过 `/skills` 查找，或在提示中写 `$cicero-machine`。本地发现目录依据 [OpenAI 官方文档](https://learn.chatgpt.com/docs/build-skills)。ChatGPT 托管技能管理与本地文件扫描是不同入口，不要把本机路径当作 ChatGPT 账户的通用安装接口。

先确认当前会话能创建和继续三个真实 GPT 子代理，并有符合 Skill 限定的内置搜索/网页读取工具。仅有文件读取、终端、第三方 MCP 搜索或更换成其他模型，不足以满足原契约；不要仅因客户端名为 Codex 就声称已支持。

### Claude Code

本地目录与 `/cicero-machine` 调用方式见 [Claude Code Skills 文档](https://code.claude.com/docs/en/skills)。本文目录步骤针对本地会话；云端/Cowork 等入口有各自的技能管理规则。

Claude Code 本身具备子代理机制，问题不在于它不能处理 Skill，而在于这份 Skill 的模型与工具限定。真正适配时需要让主会话用该版本的 Agent/续接消息能力调度三个角色，并使用可用的 WebSearch/WebFetch 或明确配置的搜索工具；具体能力与权限依据 [Claude Code 子代理文档](https://code.claude.com/docs/en/sub-agents)。仅增加 `context: fork` 不能自动得到完整的 A→B→C 多轮调度。

### DeepSeek Harness

这里特指 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。其本地技能提供器默认扫描项目 `.dsh/skills/`、`.agents/skills/` 以及用户级技能目录。用户 DSH 根可由 `DSH_HOME` 改写，默认 `~/.dsh`；共享 agent 根可由 `DSH_AGENTS_HOME` 改写，默认 `~/.agents`。自定义部署可禁用默认扫描根或配置额外目录，以实际配置为准。

启动对应 workspace 的会话，让代理加载 `cicero-machine` 并先核对运行条件。根据 [Skills 文档](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills)，技能通过宿主的 skill 能力按需加载；文件目录只解决发现问题。多角色调度需映射到 [Subagents 能力](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/subagent)，搜索需接到实际启用的检索和网页读取工具。DeepSeek 的 Search/Fetch 与 ChatGPT 内置搜索不是同一运行接口。

如果你说的其实是“Claude Code 接 DeepSeek API”，安装路径仍属于 Claude Code；如果是“OpenCode 接 DeepSeek”，则按 OpenCode 的目录安装。模型供应商与负责文件扫描、工具、会话的 harness 是两个配置层。后者的路径依据 [OpenCode Skills 文档](https://opencode.ai/docs/skills/)。

## 跨框架执行还需要改什么

以下是后续适配方案，不是当前仓库已经实现的功能：

| 项目 | 当前 ChatGPT 版本 | Claude / DeepSeek 适配需完成 |
| --- | --- | --- |
| 模型约束 | GPT 子代理 | 明确允许所选模型，并披露实际模型，不能沿用“GPT 已执行”的表述 |
| 角色调度 | 宿主提供的隔离创建、follow-up、消息与中断 | 映射该 harness 的真实子代理接口，保留 A/B/C 的独立上下文、顺序与续接记录 |
| 搜索 | 仅 ChatGPT 内置搜索/网页读取 | 声明所用搜索后端与读取工具，记录真实查询、URL、日期和访问层级 |
| 引用 | 当前 ChatGPT 工具的原生引用＋S 编号 | 保留可导出的 S 编号与 URL，把平台专属原生引用换成宿主支持的表示 |
| 暂停/失败恢复 | 对话检查点、工具中断、公开记录重建 | 验证宿主的取消、续接和部分结果语义，不能假定完全相同 |
| 验证 | 已有格式、文件与流程静态检查 | 在目标环境实际跑多轮、来源登记、反证检索、暂停/继续与失败处理 |

适配宜保留当前 ChatGPT 版本，另设明确标识的适配目录或经过验证的运行配置，避免悄悄放宽原来的 GPT/内置搜索约束。仅把 SKILL.md 中的产品名字替换掉，并不能证明工作流正确。

如果需要立即用 DeepSeek 等外部模型，原 TypeScript 应用已有独立模型与搜索配置路径，可按 [原应用快速开始](../../README.md#快速开始) 操作；它与本目录所说的 Skill 安装不同。

## 先检查，再发起辩论

加载后可以先发：

```text
读取 cicero-machine 的运行契约，列出当前真实可用的子代理创建/续接工具、
模型和搜索/网页读取工具，逐项说明是否匹配。先不要启动辩论；
若不匹配，指出需适配之处，不要把单会话角色模拟说成独立多 Agent。
```

本仓库尚未对上述所有环境进行导入或在线端到端测试；安装目录经过文档核对不等于已完成平台运行验证。已有具体检查结果见 [VALIDATION.md](VALIDATION.md)。
