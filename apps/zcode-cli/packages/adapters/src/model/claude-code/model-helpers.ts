import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { CLAUDE_CODE_PROVIDER_OPTIONS_KEY, ClaudeCodeErrorCode } from "./constants.js";
import { ClaudeCodeError, claudeAuthRequiredError } from "./errors.js";
import type { ClaudeRequestContext } from "./permission.js";
import type { ClaudeStepMapper } from "./stream-mapper.js";

export const SESSION_HEADER = "x-session-id";
export const SESSION_ID_PREFIX = "sess_";
/** claude --effort 接受的取值；Kaguya 里其他取值（如 ultra）不传，用 claude 自身默认。 */
export const CLAUDE_EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh", "max"]);
const AUTH_FAILURE_ASSISTANT_ERROR = "authentication_failed";
/** 兜底：旧版本 claude 没有结构化错误标记时，从结果文案识别未登录。 */
const AUTH_FAILURE_TEXT = /\/login|not logged in|invalid api key|authentication/i;

export function readRequestContext(
  providerOptions: LanguageModelV3CallOptions["providerOptions"],
): ClaudeRequestContext {
  const raw = providerOptions?.[CLAUDE_CODE_PROVIDER_OPTIONS_KEY] as
    | Record<string, unknown>
    | undefined;
  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value ? value : undefined;
  return {
    sessionId: text(raw?.sessionId),
    traceId: text(raw?.traceId),
    turnId: text(raw?.turnId),
    mode: text(raw?.mode),
  };
}

/**
 * Kaguya 协作模式 → Claude 的 --permission-mode。
 * build 对应 claude 默认的「逐次确认」，因此不显式传参，保持用户本机 claude 设置里的默认行为。
 */
const PERMISSION_MODE_BY_COLLABORATION_MODE: Readonly<Record<string, string>> = {
  plan: "plan",
  edit: "acceptEdits",
  yolo: "bypassPermissions",
  auto: "auto",
};

export function permissionModeFor(mode: string | undefined): string | undefined {
  return mode ? PERMISSION_MODE_BY_COLLABORATION_MODE[mode] : undefined;
}

export function promptHasHistory(prompt: LanguageModelV3CallOptions["prompt"]): boolean {
  let end = prompt.length;
  while (end > 0 && prompt[end - 1]?.role === "user") end -= 1;
  return prompt.slice(0, end).some((message) => message.role !== "system");
}

/** run 以 is_error 结束时，把它翻译成稳定错误码。 */
export function interpretFailure(mapper: ClaudeStepMapper): ClaudeCodeError {
  const result = mapper.result;
  if (
    mapper.assistantError === AUTH_FAILURE_ASSISTANT_ERROR ||
    (result?.resultText && AUTH_FAILURE_TEXT.test(result.resultText))
  ) {
    return claudeAuthRequiredError();
  }
  return new ClaudeCodeError(
    ClaudeCodeErrorCode.RunFailed,
    result?.resultText?.trim() || "Claude Code 运行失败。",
    { details: { subtype: result?.subtype } },
  );
}

/** 把单次调用的 abort 信号接到 run 上；返回取消订阅函数。 */
export function linkAbort(
  signal: AbortSignal | undefined,
  onAbort: (reason: unknown) => void,
): () => void {
  if (!signal) return () => undefined;
  const handler = (): void => onAbort(signal.reason);
  if (signal.aborted) handler();
  else signal.addEventListener("abort", handler, { once: true });
  return () => signal.removeEventListener("abort", handler);
}
