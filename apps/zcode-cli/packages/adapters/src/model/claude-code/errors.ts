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
