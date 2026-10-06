import { CLAUDE_CODE_PROVIDER_OPTIONS_KEY } from "./constants.js";

/**
 * 把本次请求的归属（session / trace / turn）写进 providerOptions，供权限桥接使用。
 * 只对 Claude Code 渠道生效，其他 provider 的请求体不受影响。
 */
export function mergeClaudeCodeRequestContext(input: {
  providerKind: string | undefined;
  providerOptions: Record<string, unknown> | undefined;
  context: { sessionId?: string; traceId?: string; turnId?: string; collaborationMode?: string };
}): Record<string, unknown> | undefined {
  if (input.providerKind !== "claude-code") return input.providerOptions;
  const { sessionId, traceId, turnId, collaborationMode } = input.context;
  return {
    ...input.providerOptions,
    [CLAUDE_CODE_PROVIDER_OPTIONS_KEY]: {
      ...(sessionId ? { sessionId } : {}),
      ...(traceId ? { traceId } : {}),
      ...(turnId ? { turnId } : {}),
      ...(collaborationMode ? { mode: collaborationMode } : {}),
    },
  };
}
