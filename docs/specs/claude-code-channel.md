# Claude Code（本机）渠道

状态：已实现。本文取代最初的「独立 claude-host 进程」草案——调研发现把 Claude 做成**模型层 provider** 改动面小得多，且自动继承会话、事件、远控与权限链路。

## 目标

- 在 Kaguya Code 里直接使用本机已安装、已登录的 Claude Code。
- Kaguya 不做 Claude 登录、不读取/保存/转发任何 Claude 凭证；认证和额度完全由本机 `claude` 决定。
- 不使用订阅 OAuth token 调 Anthropic API（不符合 Anthropic 使用条款）；API key 用户本来就能用已有的 `anthropic-messages` 来源。

## 非目标

- 不加 `@anthropic-ai/claude-agent-sdk` 依赖：它为每个平台附带一份原生 claude 二进制（可选依赖）并要求额外 peer 依赖，而我们本来就用用户本机的 `claude`。这里直接讲 SDK 底层使用的同一套 `claude -p --input-format stream-json --output-format stream-json` 协议。
- 不重写 Claude 的工具、权限判定、compact。
- 不另做「Claude 历史会话浏览/导入」：仓库已有 `session/claude-native/*` 导入链路与设置里的迁移卡片，读取同一份 `~/.claude/projects/**/*.jsonl`。

## 架构

```text
UI 设置卡片 ──> IClaudeCodeService (services, host) ──> 检测本机 claude / 注册个人模型来源
                                                            │ baseUrl = https://claude-code.invalid（哨兵）
会话回合 ──> core turn-machine ──> AiSdkModelExecution ──kind=claude-code──> ClaudeCodeLanguageModel
                                                                              │ spawn claude -p … (stdin/stdout JSONL)
                                                                              ├─ 文本增量  → text 片段
                                                                              ├─ 工具活动  → 文本片段（见下）
                                                                              └─ can_use_tool → PermissionBroker (+ permission.* 事件)
```

### 状态所有者

| 状态 | 唯一所有者 |
| --- | --- |
| 对话 transcript、工具循环、compact、权限规则 | Claude Code（jsonl 是其持久化） |
| Kaguya 会话 ↔ Claude 会话映射 | 无需存储：`sess_<uuid>` 去前缀即 Claude 会话 id；非 UUID 用 UUIDv5 稳定派生 |
| 会话消息、事件、序号、远控重放 | Kaguya core（与其他 provider 完全相同） |
| 在途权限请求 | 复用现有 PermissionBroker + `permission.requested/resolved` 事件 |
| 模型来源配置 | 现有 Provider 配置（个人来源） |

### 渠道识别

沿用 `anthropic-messages` 的配置形态，靠保留 TLD 的哨兵 baseUrl `https://claude-code.invalid` 识别（与 Codex 渠道同法，不改 provider schema）。`.invalid` 永不解析：即使旧版本 agent 不认识该渠道，请求也只会在 DNS 阶段失败，不会发往任何真实主机。

### 请求映射

- **主回合**（`x-zcode-session-type: main` 且有会话 id）：
  - 对应的 Claude jsonl 已存在 → `--resume <id>`，只发最后一条 assistant 之后的用户输入（Claude 自己持有历史）。
  - 不存在 → `--session-id <id>` 新建；若 Kaguya 已有历史（如中途切换到 Claude），把历史转写在首条消息前。
- **辅助请求**（标题、摘要、子 agent）：一次性 `--no-session-persistence --tools ""`，不落盘。其 system 提示写入 0600 临时文件经 `--system-prompt-file` 作为**真正的 system prompt** 传入（塞进用户消息会被 Claude 当成「提示注入」而拒答，已实测）；文本缓冲到结果到达后一次发出，并剥掉「整段被代码围栏包裹」的围栏（Claude 常把「只返回 JSON」包进 ```json）。
- **过滤 Kaguya 注入的 `<system-reminder>`**：core 会把技能列表、环境信息、项目指令整块塞进用户消息，描述的是 Kaguya 自己的工具与路径；转发给 Claude 无用且会被当成「藏在用户消息里的指令」而拒答（实测）。只过滤「整块被 system-reminder 包裹」的文本块。
- 思考强度：`reasoningLevel`（low/medium/high）→ `--effort`。
- 图片：base64 图片块透传，其他附件降级为文字说明。

### 为什么工具活动渲染成文本

core 对 provider 自己执行的工具（`providerExecuted`）只会跳过、**不接收结果**（流里的 `tool-result` 被丢弃），历史里会留下没有结果的 tool call，换模型时违反协议。所以 Claude 的 `tool_use` / `tool_result` 渲染为 `▸ **Bash** \`cmd\`` 加围栏输出的 markdown 文本：历史保持纯文本，任意模型都能继续这段对话。thinking 同理不下发（无签名的 reasoning 会进入历史并在换模型时回放）。子 agent 内部活动不展示。

代价：UI 里没有结构化工具卡片；权限确认卡片是结构化的（见下）。

### 权限

claude 以 `--permission-prompt-tool stdio` 运行，工具需要确认时下发 `control_request(can_use_tool)`：

- 只读工具（Read/Glob/Grep/LS/TodoWrite…）自动放行。
- 其余经 PermissionBroker 交给用户；没有 broker 时一律**拒绝**而不是放行；broker 抛错按拒绝处理。
- 外部执行的工具不经 tool executor，而 v4（Web / 手机重放链路）的确认卡片由 `permission.requested` 事件投影。因此在 bootstrap 用 `createEventedPermissionBroker` 包一层，经 core 新增的 `recordExternalPermissionRequested/Resolved` 在同一个 broker 调用前后补发事件；requested 写入失败则不调 broker（宁可拒绝也不在用户看不到卡片时放行），broker 取消/超时/失败也会补发 deny 收口。决策仍只由原 broker 给出。

### 时序与投递语义

```text
turn started → ClaudeCodeLanguageModel.doStream → 子进程 JSONL
   text 增量 ─────────────────────────────────────────────▶ model stream（desktop 与 web 同一路径）
   can_use_tool ─▶ permission.requested ─▶ 用户答复 ─▶ permission.resolved ─▶ control_response
   result ─▶ finish(usage, providerMetadata.claudeCode.sessionId)
取消：abort → SIGTERM（宽限期后 SIGKILL）；未拿到 result 才强杀，正常结束不打断 claude 写 jsonl。
```

渠道位于 provider 层之下，不改 stream/snapshot/queue/重连：`desktop-continuous` 与 `web-remote-replayable` 消费的是同一组 session 事件，权限卡片已在 Web（replayable）真实验证；desktop-continuous 路径经 `interaction/requestPermission` 在协议层验证，未在 Electron 窗口里实测。

### 认证与状态检测

`IClaudeCodeService`（host）：`getStatus` / `enable` / `disable`。状态来自 `claude --version` 与 `claude auth status`（不耗额度），只取 loggedIn/authMethod/subscriptionType，**不读取邮箱、组织等账号信息**。未安装返回 `CLAUDE_NOT_FOUND`，未登录返回 `CLAUDE_AUTH_REQUIRED`（401），UI 只提示去终端执行 `claude`。其他稳定错误码：`CLAUDE_SPAWN_FAILED`、`CLAUDE_EXITED_ABNORMALLY`（带退出码与 stderr 尾部）、`CLAUDE_RUN_FAILED`、`CLAUDE_PROTOCOL_ERROR`。

`claude` 的位置：PATH（Windows 按 PATHEXT）→ `~/.local/bin`、`~/.claude/local`、`~/.npm-global/bin`、`~/bin`。远程 workspace 上由 agent 所在主机解析，所以需要装在 agent 所在主机上。

## 已知限制

- Kaguya 内「重试/编辑后重发」不会回滚 Claude 的会话；两边历史可能分叉。
- 中途 Claude→其他模型→Claude 时，Claude 看不到中间那段其他模型的回复。
- Kaguya 的权限模式（plan/edit/yolo…）不映射到 Claude 的 `--permission-mode`；yolo 下 Claude 仍逐次确认。
- 工具是文本而非结构化卡片；不展示 thinking。
- `claude` 的 stream-json 与 jsonl 没有稳定公开契约；解析器容错（未知行类型忽略），格式大改需要跟进。
- Windows/macOS 未实测；`.cmd` 包装经 shell 启动，参数限定为保守字符集，用户内容只走 stdin。
- 使用本机 claude 的订阅额度是否符合 Anthropic 对第三方产品的条款，需使用者自行核对（本渠道不接触 token，只调用本机 `claude`）。
- 运行已构建的 agent 包（`apps/zcode-cli/packages/cli/dist/zcode.cjs`，dev 模式优先使用）需要重新构建：`pnpm --dir apps/zcode-cli/packages/cli build`。旧包不认识该渠道，会按普通 anthropic 去请求哨兵域名并反复重连。

## 验收与测试

- adapters（`pnpm --dir apps/zcode-cli/packages/adapters test:claude-code`，`node:test` + 假 claude 脚本）：协议解析、参数安全、渲染、流映射、prompt 转换（含 reminder 过滤、system 分离）、可执行文件定位、会话规划、子进程集成（正常/工具放行/拒绝/无 broker/broker 抛错/未登录/失败/崩溃/取消/doGenerate）。
- 真实 claude（`CLAUDE_CODE_LIVE_TEST=1`，消耗额度，默认跳过）：流式回复、跨调用 `--resume` 记忆、jsonl 落盘、放行/拒绝对文件系统的真实效果。
- services（`packages/services/test/claudeCodeService.test.ts`）：启用/移除/幂等、状态不含账号信息、探测解析。
- bootstrap（`pnpm --dir apps/zcode-cli/packages/bootstrap test:permission`）：权限事件装饰器。
- 手工端到端（已执行）：完整 agent 经 `app-server --stdio` 的多轮对话与权限放行/拒绝；真实 Web 页面里启用渠道、选择模型、发送、权限卡片放行、标题生成。
