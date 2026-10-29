# 发布整理验证记录

日期：2026-10-29（Asia/Shanghai）。检查对象为现有 ChatGPT Skill 与上游固定提交 `8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd` 的并存发布目录。

## 初次发布包已完成的检查（历史记录）

| 检查 | 结果与依据 |
| --- | --- |
| GitHub 基线与本地快照 | 初次打包时 GitHub main 返回上述提交；当时本地 checkout HEAD 一致。递归 tree 完整返回，47 个 blob、9 个 tree，共 56 路径，没有原生 SKILL.md |
| 原文件保护 | 将全部 47 个原文件重新计算 Git blob SHA-1，与 GitHub 返回的 blob SHA 逐一比对通过；再记录 SHA-256；包括全部 README、源码、测试和二进制图片 |
| 旧 Skill 复用 | 先前 `cicero-machine-chatgpt-skill.zip` 中的 `skills/cicero-machine/` 与当前已安装 Skill 的 7 个文件逐字节一致；发布目录继续原样复制 |
| 官方 Skill 基础校验 | 对已安装原 Skill 运行当前 skill-creator 随附 `quick_validate.py`，结果为 `Skill is valid!`；检查 YAML frontmatter、必需字段与命名等基础规则 |
| 引用与展示资源 | 三个入口参考文件存在；YAML 可解析，两个图标路径有效，SVG XML 可解析；元数据不是工具可用性或逐平台兼容性保证 |
| 许可证 | Skill 与原项目 LICENSE 逐字节一致，保留 MIT 与 TimeCracker 版权声明 |
| 公开消息协议 | 检查任务卡、局部证据 ID→全局 S ID、公开信息边界、B 收到 A 同轮发言、C guidance 回流、失败与恢复路径 |
| 轮次边界 | 静态展开 1/2/3/5 轮，分别具备 1/2/3/5 次 C 审计；单轮内例外与常规 A→B→C 无矛盾 |
| 八部分报告 | 事实共识、事实分歧、价值分歧、证据/公式、条件性结论、未解决问题、结论、方法限制，顺序与模板一致 |
| 独立复核 | 另一隔离审阅代理只读取 Skill 与上游原始文件进行静态检查，未发现必须修正才能发布的实质问题 |

流程与能力对照的具体依据见 [CAPABILITY-MAPPING.md](CAPABILITY-MAPPING.md)，所有文件变更见 [FILE-DIFF.md](FILE-DIFF.md)。

## 已记录但不改写旧 Skill 的非阻断事项

- C 的专用返回字段没有再次列举 `new_evidence/search_log`；全局来源纪律仍然适用。C 补充来源必须经主会话登记、核验与编号，发布映射已明确该点。
- 上游双语查询及来源语言交错排序没有逐项移植，已在能力映射列为差异。
- 展示元数据保留既有产品列表和 YAML 表达形式；没有据此声称所有 ChatGPT、Codex、API、Atlas 会话都能运行。

## 本次没有验证的内容

- 没有执行真实在线辩论，没有以真实搜索结果完成 A/B/C 多轮往返。
- 没有实测子代理隔离强度、搜索覆盖、工具权限、耗时、成本、暂停中断时机或跨会话恢复。
- 没有调用 Bocha/Tavily/Yahoo 或外部模型，不声明实时行情完整性。
- 没有运行原 TypeScript 的 npm 安装、Vitest、类型检查或前端构建；原项目无代码改动，以逐文件内容一致性验证其保留情况。这不表示已对上游本身的正确性或依赖安全作背书。
- 下载包整理阶段没有写入 GitHub；后续仓库提交沿用相同的 Skill 并更新发布说明，提交前重新执行离线校验。没有做所有目标环境的导入测试。

基础格式校验、哈希核验和流程静态复核均不等于端到端测试通过。

## 离线包核验

随包 [verify_release.py](verify_release.py) 使用 Python 标准库核验原文件 Git blob/SHA-256、新增文件 SHA-256、相对引用、固定上游链接、图标和报告结构。manifest 因自引用不能记录自身散列，且该清单不是签名。

最终打包时的实际核验输出记录在下方。使用者也可按 [发布说明](README.md) 在解压后的目录重复执行。

### 初次下载 ZIP 的离线核验结果（历史记录）

完整包：

```json
{
  "mode": "full-release",
  "upstream_commit": "8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd",
  "upstream_files_verified": 47,
  "added_files_present": 13,
  "files_hash_checked": 59,
  "local_links_checked": 67,
  "pinned_upstream_links_checked": 14,
  "icon_references_checked": 2,
  "manifest_self_hash_excluded": true,
  "live_debate_tested": false,
  "errors": [],
  "status": "PASS"
}
```

仅新增文件范围：

```json
{
  "mode": "additions-only",
  "upstream_commit": "8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd",
  "upstream_files_verified": 0,
  "added_files_present": 13,
  "files_hash_checked": 12,
  "local_links_checked": 24,
  "pinned_upstream_links_checked": 14,
  "icon_references_checked": 2,
  "manifest_self_hash_excluded": true,
  "live_debate_tested": false,
  "errors": [],
  "status": "PASS"
}
```

两个 ZIP 均在打包后检查 CRC、文件集合和逐文件字节，并解压到独立目录重新运行对应模式；全部通过才交付。

## 安装文档增补（当前仓库）

本次基于已合并 PR #1 的提交 `88cd5a4037387cb79f1ad374a10583d79ef74b97`，在主 README 和英文 README 原文前增加 Skill 入口，并新增 [INSTALLATION.md](INSTALLATION.md)。现有 7 个 Skill 文件及全部 TypeScript 程序、测试和依赖配置仍与 PR #1 相同。

安装目录依据 OpenAI、Claude Code、DeepSeek Harness 与 OpenCode 的官方文档核对。复制命令区分用户级和项目级目录，目标已存在时不覆盖；跨框架加载步骤明确不等于完成 GPT/ChatGPT 专用契约的运行适配。

当前清单保留原始基线哈希，并用 `modified_upstream_files` 明确列出两个 README 的预期更新内容，未放宽其他原文件的完整性校验。旧 ZIP 仍是初次下载快照，不能把其中的“原文件修改 0”用于当前文档 PR。

本次只做文档、清单与验证工具维护；没有新建或修改 Skill，没有实际安装到本机 Codex/Claude/DeepSeek Harness，也没有声称跨框架在线运行测试已通过。

### 当前仓库离线核验结果

```json
[
  {
    "mode": "full-release",
    "upstream_commit": "8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd",
    "upstream_files_verified": 47,
    "unchanged_upstream_files_verified": 45,
    "modified_upstream_files_verified": 2,
    "added_files_present": 14,
    "files_hash_checked": 60,
    "local_links_checked": 80,
    "pinned_upstream_links_checked": 14,
    "icon_references_checked": 2,
    "manifest_self_hash_excluded": true,
    "live_debate_tested": false,
    "errors": [],
    "status": "PASS"
  },
  {
    "mode": "additions-only",
    "upstream_commit": "8c9ebf608f5d9c9e3838c2149efc561ea7e7c8dd",
    "upstream_files_verified": 0,
    "unchanged_upstream_files_verified": 0,
    "modified_upstream_files_verified": 0,
    "added_files_present": 14,
    "files_hash_checked": 13,
    "local_links_checked": 30,
    "pinned_upstream_links_checked": 14,
    "icon_references_checked": 2,
    "manifest_self_hash_excluded": true,
    "live_debate_tested": false,
    "errors": [],
    "status": "PASS"
  }
]
```
