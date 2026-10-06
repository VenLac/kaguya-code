// Claude Code（本机）渠道的命名常量。字面量集中在这里，业务逻辑不散落魔法值。

// 渠道哨兵 baseUrl 与占位 key 定义在 @zcode/shared/node（services 与 adapters 共用）。
export const CLAUDE_CODE_PROVIDER_LABEL = "claude-code";

/** 官方 stream-json 协议所需的固定参数（与 Agent SDK 底层一致）。 */
export const CLAUDE_STREAM_ARGS: readonly string[] = [
  "-p",
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
  "--include-partial-messages",
  "--permission-prompt-tool",
  "stdio",
];

/** 错误码：稳定标识，流程判断只认这些，不解析文案。 */
export const ClaudeCodeErrorCode = {
  NotFound: "CLAUDE_NOT_FOUND",
  AuthRequired: "CLAUDE_AUTH_REQUIRED",
  WorkspaceMissing: "CLAUDE_WORKSPACE_MISSING",
  SpawnFailed: "CLAUDE_SPAWN_FAILED",
  ExitedAbnormally: "CLAUDE_EXITED_ABNORMALLY",
  ProtocolError: "CLAUDE_PROTOCOL_ERROR",
  RunFailed: "CLAUDE_RUN_FAILED",
} as const;
export type ClaudeCodeErrorCode = (typeof ClaudeCodeErrorCode)[keyof typeof ClaudeCodeErrorCode];

/** 终端里让用户自行完成登录的指引；Kaguya 不代办登录。 */
export const CLAUDE_LOGIN_HINT = "请先在终端运行 `claude` 并完成登录，然后重试。";

/** 子进程在 abort 后给它优雅退出的时间，超时强杀。 */
export const CLAUDE_KILL_GRACE_MS = 3_000;
/** 收到 result 后等待进程自行退出的上限，超时才终止。 */
export const CLAUDE_EXIT_WAIT_MS = 15_000;
/** 保留的 stderr 尾部大小，用于错误诊断，避免无界增长。 */
export const CLAUDE_STDERR_TAIL_BYTES = 8_192;

/** 这些工具只读、无副作用：权限请求到达时直接放行，不打扰用户。 */
export const CLAUDE_READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "Read",
  "Glob",
  "Grep",
  "LS",
  "NotebookRead",
  "TodoWrite",
]);

/** Kaguya 会话 id 到 Claude 会话 id 的确定性映射所用的 UUIDv5 命名空间。 */
export const CLAUDE_SESSION_NAMESPACE = "6f0c2c3e-4a54-5d0e-9b0a-3c9b6c1d7a11";

/** 请求归因头：区分主回合与标题/压缩等辅助请求（见 runner-attribution.ts）。 */
export const SESSION_TYPE_HEADER = "x-zcode-session-type";
export const SESSION_TYPE_MAIN = "main";
/** runner-options 在 providerOptions 下注入本渠道请求上下文所用的键。 */
export const CLAUDE_CODE_PROVIDER_OPTIONS_KEY = "claudeCode";
