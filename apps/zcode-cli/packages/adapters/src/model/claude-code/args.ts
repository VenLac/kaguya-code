import { CLAUDE_STREAM_ARGS } from "./constants.js";

/** 会话策略：新建（固定 id）/ 续接 / 一次性（辅助请求，不落盘）。 */
export type ClaudeSessionMode =
  | { kind: "new"; sessionId: string }
  | { kind: "resume"; sessionId: string }
  | { kind: "ephemeral" };

interface ClaudeArgsInput {
  model?: string;
  effort?: string;
  session: ClaudeSessionMode;
  /** none：禁用全部工具（标题/摘要等纯文本请求）。 */
  tools: "default" | "none";
  permissionMode?: string;
  /** 一次性请求的 system 提示文件：替换 Claude Code 默认 system prompt（长文本不走命令行参数）。 */
  systemPromptFile?: string;
  /** 含 Kaguya skill 的临时插件目录（--plugin-dir）。 */
  pluginDir?: string;
}

/** 参数值会进入命令行（Windows 下可能经 cmd.exe），只接受保守字符集，其余直接拒绝。 */
const SAFE_ARG_VALUE = /^[A-Za-z0-9._:@/\-[\]]+$/;

function assertSafeArgValue(name: string, value: string): string {
  if (!SAFE_ARG_VALUE.test(value)) {
    throw new Error(`Unsafe value for claude argument ${name}`);
  }
  return value;
}

/**
 * 文件路径可能含空格（Windows 用户目录），不能套用保守字符集；
 * 但要拒绝会破坏引号或被 cmd.exe 解释的字符。
 */
const UNSAFE_PATH_CHARS = /["%^&|<>\r\n]/;

function assertSafePathArg(name: string, value: string): string {
  if (UNSAFE_PATH_CHARS.test(value)) {
    throw new Error(`Unsafe path for claude argument ${name}`);
  }
  return value;
}

/** 构造 claude 命令行参数；用户内容只走 stdin，绝不进入参数。 */
export function buildClaudeArgs(input: ClaudeArgsInput): string[] {
  const args = [...CLAUDE_STREAM_ARGS];
  if (input.model) args.push("--model", assertSafeArgValue("--model", input.model));
  if (input.effort) args.push("--effort", assertSafeArgValue("--effort", input.effort));
  if (input.permissionMode) {
    args.push("--permission-mode", assertSafeArgValue("--permission-mode", input.permissionMode));
  }
  switch (input.session.kind) {
    case "new":
      args.push("--session-id", assertSafeArgValue("--session-id", input.session.sessionId));
      break;
    case "resume":
      args.push("--resume", assertSafeArgValue("--resume", input.session.sessionId));
      break;
    case "ephemeral":
      args.push("--no-session-persistence");
      break;
  }
  if (input.systemPromptFile) {
    args.push(
      "--system-prompt-file",
      assertSafePathArg("--system-prompt-file", input.systemPromptFile),
    );
  }
  if (input.pluginDir) {
    args.push("--plugin-dir", assertSafePathArg("--plugin-dir", input.pluginDir));
  }
  if (input.tools === "none") args.push("--tools", "");
  return args;
}
