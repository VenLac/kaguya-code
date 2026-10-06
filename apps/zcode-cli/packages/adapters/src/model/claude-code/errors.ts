import { CLAUDE_CODE_PROVIDER_LABEL, CLAUDE_LOGIN_HINT, ClaudeCodeErrorCode } from "./constants.js";

const HTTP_UNAUTHORIZED = 401;

/**
 * 本渠道的失败错误。刻意按 ProviderBusinessError 的结构（isProviderBusinessError + name）
 * 声明，而不是 extends 它：model-execution.ts 要引用本模块装配模型，反向再引用它的类会形成
 * 循环依赖。failure-classifier 通过 isProviderBusinessError 的结构判断识别，行为一致，
 * 并带稳定 providerCode，UI 与重试策略不解析文案。
 */
export class ClaudeCodeError extends Error {
  readonly name = "ProviderBusinessError";
  readonly code = "PROVIDER_BUSINESS_ERROR";
  readonly isProviderBusinessError = true;
  readonly providerKind = "claude-code";
  readonly providerId = CLAUDE_CODE_PROVIDER_LABEL;
  readonly providerCode: ClaudeCodeErrorCode;
  readonly providerMessage: string;
  readonly statusCode?: number;
  readonly responseBodySummary?: Record<string, unknown>;

  constructor(
    providerCode: ClaudeCodeErrorCode,
    message: string,
    extra: {
      statusCode?: number;
      cause?: unknown;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message, extra.cause === undefined ? undefined : { cause: extra.cause });
    this.providerCode = providerCode;
    this.providerMessage = message;
    this.statusCode = extra.statusCode;
    this.responseBodySummary = extra.details;
  }
}

export function claudeNotFoundError(): ClaudeCodeError {
  return new ClaudeCodeError(
    ClaudeCodeErrorCode.NotFound,
    "未找到本机的 Claude Code（claude 命令）。请先安装 Claude Code 并在终端完成登录。",
  );
}

export function claudeAuthRequiredError(): ClaudeCodeError {
  return new ClaudeCodeError(
    ClaudeCodeErrorCode.AuthRequired,
    `Claude Code 尚未登录。${CLAUDE_LOGIN_HINT}`,
    { statusCode: HTTP_UNAUTHORIZED },
  );
}

/**
 * Node 对「cwd 不存在」报的是 `spawn <claude> ENOENT`，和「找不到 claude」无法区分，
 * 所以在启动前单独检查目录，把真正的原因（路径）告诉用户。
 */
export function workspaceMissingError(cwd: string): ClaudeCodeError {
  return new ClaudeCodeError(
    ClaudeCodeErrorCode.WorkspaceMissing,
    `工作目录不存在或不是目录：${cwd}。请确认该 workspace 仍在原位置，或重新选择工作目录。`,
    { details: { cwd } },
  );
}

/** spawn 失败：保留 errno/syscall/cwd 与原始 cause，避免只剩一句「无法启动」。 */
export function spawnFailedError(cause: unknown, cwd: string): ClaudeCodeError {
  const errno = (cause as NodeJS.ErrnoException | undefined)?.code;
  const syscall = (cause as NodeJS.ErrnoException | undefined)?.syscall;
  return new ClaudeCodeError(
    ClaudeCodeErrorCode.SpawnFailed,
    `无法启动本机 claude${errno ? `（${errno}）` : ""}，工作目录：${cwd}。`,
    {
      cause,
      details: {
        cwd,
        ...(errno ? { errno } : {}),
        ...(syscall ? { syscall } : {}),
      },
    },
  );
}
