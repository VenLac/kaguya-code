# Claude Code（本机）渠道

状态：已实现。

## 目标

- 在 Kaguya Code 里直接使用本机已安装、已登录的 Claude Code，**界面与原生工具完全一致**：写入/编辑带 diff 统计，读取/命令/搜索是原生卡片，权限、提问、计划审批用原生面板，文件改动可撤销。
- Kaguya 不做 Claude 登录、不读取/保存/转发任何 Claude 凭证；认证和额度完全由本机 `claude` 决定。
- 不使用订阅 OAuth token 调 Anthropic API（不符合 Anthropic 使用条款）；API key 用户本来就能用已有的 `anthropic-messages` 来源。

## 非目标

- 不加 `@anthropic-ai/claude-agent-sdk` 依赖：它为每个平台附带一份原生 claude 二进制（可选依赖）并要求额外 peer 依赖，而我们本来就用用户本机的 `claude`。这里直接讲 SDK 底层使用的同一套 `claude -p --input-format stream-json --output-format stream-json` 协议。
- 不重写 Claude 的工具、权限判定、compact：这些由 Claude 自己执行，Kaguya 只负责**记录与展示**。
- 不另做「Claude 历史会话浏览/导入」：仓库已有 `session/claude-native/*` 导入链路与设置里的迁移卡片，读取同一份 `~/.claude/projects/**/*.jsonl`。

## 设计演进（为什么不是「把工具渲染成文字」）

第一版把 Claude 的工具活动渲染成 markdown 文本：历史干净，但界面里只有一段代码块，没有文件内容/diff/命令卡片。参照 codex-host「把 harness 的流式、工具状态、diff、审批、提问映射成宿主**原生条目**」的做法，改为：

> **一条 Claude assistant 消息 ＝ 一个 Kaguya 原生模型步骤；其中的 `tool_use` ＝ Kaguya 原生工具调用；`tool_result`（含 Claude 回传的结构化 `tool_use_result`）被翻译成 Kaguya 原生输出形状。**

Kaguya 的内置工具集本就对齐 Claude Code（`Write`/`Edit`/`Read`/`Bash`/`Glob`/`Grep`/`WebFetch`/`WebSearch`/`TodoWrite`/`AskUserQuestion`/`ExitPlanMode` 同名同形，Write/Edit 的输出 schema 与 Claude 的 `structuredPatch` 结果几乎同构），所以翻译层很薄，却能让消息片段、事件、历史、展示卡片、文件变更追踪与撤销全部走原生链路，历史对任何其他模型也是合法的 tool-call/tool-result 配对。

## 架构

```text
设置卡片 ─> IClaudeCodeService (services/host)           检测本机 claude；注册「Claude Code（本机）」个人模型来源（哨兵 baseUrl）

core turn loop ──模型步骤──> ClaudeCodeLanguageModel (adapters)
   ▲                           │  一个 ClaudeRun = 一个后台 claude 进程，跨步骤存活（按 Kaguya 会话登记）
   │                           │  每个步骤读取队列里的下一条 assistant 消息 → text / reasoning / tool-input-* / tool-call
   │ finish=tool-calls         │  读到 tool_use 就登记到 ExternalToolRegistry；读到 tool_result 就翻译并交付
   │                           ▼
tool executor ──claim(toolCallId)──> ExternalToolRegistry (实现 contracts 的 ExternalToolExecutionPort)
   不跑本地 handler / 不走本地权限；发 ToolCallStarted、等待外部结果、发 ToolCallResult|Error；展示卡片由「工具名+输出形状」决定

claude can_use_tool ──> 权限处理（等工具行出现后）──> PermissionBroker(+补发 permission.requested/resolved) ──> 原生权限/提问/计划审批面板
```

### 状态所有者

| 状态                                           | 唯一所有者                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| 对话、工具循环、compact、权限规则、会话 jsonl  | Claude Code                                                               |
| 消息片段、事件、序号、历史、文件变更追踪、重放 | Kaguya core（与其他 provider 完全相同）                                   |
| 进行中的 claude 进程与未交付的工具结果         | `ClaudeCodeRuntime`（模型执行层持有，模型对象每次请求新建，它跨步骤存活） |
| 工具权限的最终决定                             | 用户，经原生 PermissionBroker；Claude 的 `can_use_tool` 是唯一的确认入口  |
| 会话映射                                       | 无需存储：`sess_<uuid>` 去前缀即 Claude 会话 id；非 UUID 用 UUIDv5 派生   |

### 步骤划分与续接

- 步骤结束：含可见 tool_use 的消息在 `message_stop` 处以 `finishReason=tool-calls` 结束；最终消息在 `result` 到达时以 `stop` 结束。只含 Claude 内部元工具（`ToolSearch`）的消息不结束步骤。
- core 执行完工具后发起下一步，prompt 最后一条是 `tool` 消息 → 续接同一个 run；是新的用户输入 → 结束遗留 run、按计划起新进程；没有存活 run 却要续接 → 抛 `CLAUDE_PROTOCOL_ERROR`（不乱起新进程）。
- 取消：abort → SIGTERM（宽限期后 SIGKILL），未出结果的工具调用统一收口为失败；正常结束不打断 claude 写 jsonl。

### 工具映射

- `tool-mapping.ts`：入参只保留 Kaguya schema 认识的字段并用原生 Zod schema 校验，通过则按原生工具名下发；对不上（或 Kaguya 里语义不同，如 `Task`→`ClaudeTask`）则改名为 `Claude<Name>`/原名并标记 `dynamic`，避免被 AI SDK 的本地校验判为非法。
- 结果翻译：`Write`/`Edit`（`structuredPatch` 原样带过去 → 自动得到 `file_diff` 卡片）、`Bash`（`stdout/stderr/interrupted`，非零退出码保留为「执行完成但失败」）、`Read`、`Glob`、`Grep`、`WebFetch`、`WebSearch`、`TodoWrite`、`AskUserQuestion`（答案）、`ExitPlanMode`。拿不到结构化结果时回退为只带文本的输出，卡片仍会出现。
- 隐藏：`ToolSearch`（Claude 的内部检索管线）不转发。子 agent 内部活动不展示，只展示发起它的 `ClaudeTask` 与最终结果。
- thinking 作为原生 reasoning 片段下发（换模型时由现有 `removeCrossModelReasoning` 清理，不会回放给别家）。

### 请求映射

- 主回合：对应 jsonl 已存在 → `--resume <id>`，只发最后一条 assistant 之后的用户输入；不存在 → `--session-id <id>` 新建，已有历史则转写在前。
- 辅助请求（标题、摘要、子 agent）：一次性 `--no-session-persistence --tools ""`；system 提示写 0600 临时文件经 `--system-prompt-file` 作为**真正的 system prompt**（塞进用户消息会被 Claude 当成注入而拒答）；文本缓冲到结果后一次发出，并剥掉「整段被代码围栏包裹」的围栏。
- 过滤 Kaguya 注入的整块 `<system-reminder>`（技能列表、环境信息、项目指令）：对 claude 无用且会被当成「藏在用户消息里的指令」。
- 协作模式：plan（`planEnabled` 优先）→ `plan`、edit → `acceptEdits`、yolo → `bypassPermissions`、auto → `auto`；build 不传参。模式在 run 创建时确定。
- 思考强度 `low/medium/high` → `--effort`；图片作为 base64 块透传。

### 权限、提问、计划

- claude 以 `--permission-prompt-tool stdio` 运行；只读工具自动放行，其余经 PermissionBroker；没有 broker 或 broker 抛错一律**拒绝**。
- 权限请求等待工具行出现（executor 调 `markStarted`）后再弹，保证确认卡片锚定在对应的工具行；超时 10 秒兜底放行请求。
- v4（Web/手机重放链路）的确认卡片由 `permission.requested` 事件投影，外部工具不经 executor，所以 bootstrap 用 `createEventedPermissionBroker` 在同一个 broker 调用前后补发事件（core 新增 `recordExternalPermissionRequested/Resolved`）；requested 写入失败则不调 broker。`AskUserQuestion` / `ExitPlanMode` 由现有投影直接转成结构化提问/计划审批卡片，答案经 broker 的 `modify`/`allow` 回给 claude。

### 时序与投递语义

desktop-continuous 与 web-remote-replayable 消费的是同一组 session 事件（消息片段、`tool_call_*`、`permission_*`），本渠道位于 provider 层之下，不改 stream/snapshot/queue/重连。已在真实 Web 页面（replayable）验证；desktop-continuous 路径经 `interaction/requestPermission`/`requestUserInput` 在协议层验证，未在 Electron 窗口里实测。

## 认证与状态检测

`IClaudeCodeService`（host）：`getStatus`/`enable`/`syncModels`/`disable`。`enable` 要求本机已安装且已登录，否则拒绝并说明原因。状态来自 `claude --version` 与 `claude auth status`（不耗额度），只取 loggedIn/authMethod/subscriptionType，不读取邮箱、组织。稳定错误码：`CLAUDE_NOT_FOUND`、`CLAUDE_AUTH_REQUIRED`（401）、`CLAUDE_WORKSPACE_MISSING`、`CLAUDE_SPAWN_FAILED`、`CLAUDE_EXITED_ABNORMALLY`（带退出码与 stderr 尾部）、`CLAUDE_RUN_FAILED`、`CLAUDE_PROTOCOL_ERROR`。工作目录：claude 以 workspace 路径为 cwd 运行（远程 workspace 则是 agent 所在主机上的路径）。请求前先确认该目录存在，不存在直接抛 `CLAUDE_WORKSPACE_MISSING` 并在 `details.cwd` 带上路径——Node 对「cwd 不存在」报的是 `spawn <claude> ENOENT`，不先检查会被误判成找不到 claude。`CLAUDE_SPAWN_FAILED` 保留系统错误：消息带 errno 代码（如 `EACCES`）与 `cwd`，`details` 含 `errno/syscall/cwd`，`cause` 保留原始错误，不再只剩「无法启动」。远程 workspace 的 claude 可执行文件与登录态取决于 agent 所在主机，设置卡片只探测本机，远程没有预检。

`claude` 的位置：PATH（Windows 按 PATHEXT）→ `~/.local/bin`、`~/.claude/local`、`~/.npm-global/bin`、`~/bin`；远程 workspace 在 agent 所在主机解析。

## 模型与上下文

- 不再写死 `sonnet/opus/haiku` 别名和 200k 上下文。启用或点「同步模型」时，对每个别名向本机 claude 发一次最小请求（`--output-format json --tools "" --no-session-persistence`），从 `modelUsage` 读取**真实模型 id、`contextWindow`、`maxOutputTokens`**，并据此注册/更新模型（例如 sonnet→`claude-sonnet-5-5` 1M/128k，haiku→`claude-haiku-4-5-20251001` 200k/32k）。
- 旧版本留下的别名模型（`sonnet` 等）通过 `savePersonalModelDraft` 改名为真实 id 并修正配置，不会与新模型并存。
- 某个别名探测失败（无权限、超时）时跳过并在状态里说明，其余照常同步；全部失败则报错。探测会消耗少量额度。
- 思考强度仍只提供 `low/medium/high`，作为 `--effort` 传给 claude。实测 claude `-p` 的 stream-json 在 `low/high` 下都不输出 thinking 块，所以界面不会出现思考片段；thinking → reasoning 的映射已就绪，claude 一旦输出即显示。

## Kaguya skill

Kaguya 注入的 `<system-reminder>` 里的技能列表对 claude 不可见（该块被过滤）。每次新建 run 时把列表里的 skill 以符号链接（失败回退为复制）放进临时插件目录 `kaguya-skills`，经 `--plugin-dir` 交给 claude，由它自己的 `Skill` 工具调用；claude 返回的 `kaguya-skills:<name>` 在映射时还原为 Kaguya 的原生 `Skill` 调用。插件目录随 run 结束清理，生成失败只记录警告、本回合不带 skill。

## 已知限制

- Kaguya 内「重试/编辑后重发/回滚」不会回滚 Claude 自己的会话；两边历史可能分叉。
- 中途 Claude→其他模型→Claude 时，Claude 看不到中间那段其他模型的回复。
- 子 agent（`Task`）只展示为一个 `ClaudeTask` 工具行与最终文本，没有子会话下钻。
- 计划模式：Kaguya 的计划开关映射到 Claude 的 plan 模式，但 Kaguya 侧的计划状态不会随 `ExitPlanMode` 自动退出。
- `xhigh/max` 思考强度未提供；模型清单是启用/同步时的快照，claude 升级后需点「同步模型」。
- skill 只在新建 run 时交给 claude；同一 run 中途新增的 skill 下一回合才可用。
- `claude` 的 stream-json 与 jsonl 没有稳定公开契约；解析器容错（未知行类型忽略），格式大改需要跟进。
- Windows/macOS 未实测；`.cmd` 包装经 shell 启动，参数限定为保守字符集，用户内容只走 stdin。
- 使用本机 claude 的订阅额度是否符合 Anthropic 对第三方产品的条款，需使用者自行核对（本渠道不接触 token，只调用本机 `claude`）。
- 运行已构建的 agent 包（`apps/zcode-cli/packages/cli/dist/zcode.cjs`，dev 模式优先使用）需要重新构建：`pnpm --dir apps/zcode-cli/packages/cli build`。旧包不认识该渠道，会按普通 anthropic 去请求哨兵域名并反复重连。

## 验收与测试

- core（`pnpm --dir apps/zcode-cli/packages/core test:external-tool`）：外部工具走原生事件/结果/diff 卡片、不跑本地 handler、不走本地权限；失败/未知工具名/中止；未认领的调用仍走本地权限。
- adapters（`pnpm --dir apps/zcode-cli/packages/adapters test:claude-code`，`node:test` + 假 claude）：协议解析、参数安全、流映射（含 thinking/工具入参流/隐藏工具/dynamic 与改名）、工具与结果翻译、外部工具登记表、prompt 转换、会话规划、可执行文件定位、子进程集成（多步骤工具回合、放行/拒绝/无 broker/broker 抛错、续接同一进程、遗留 run、模式映射、未登录/失败/崩溃/取消）。
- 真实 claude（`CLAUDE_CODE_LIVE_TEST=1`，消耗额度，默认跳过）：多步骤 Write/Edit/Read/Bash（真实 diff、文件真被改）、`--resume` 记忆、拒绝后文件不被创建。
- services（`packages/services/test/claudeCodeService.test.ts`）、bootstrap（`test:permission`）。
- 手工端到端（已执行）：完整 agent 经 `app-server --stdio`（多轮、权限放行/拒绝、AskUserQuestion、计划审批、权限模式）；真实 Web 页面里启用渠道、选模型、多工具回合、权限卡片、展开 diff、文件变更撤销。
