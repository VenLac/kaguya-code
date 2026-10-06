import type {
  PermissionBrokerPort,
  SessionId,
  ToolCallId,
  TraceId,
  TurnId,
} from "@zcode/contracts";
import { CLAUDE_READ_ONLY_TOOLS } from "./constants.js";
import type { ClaudePermissionAnswer } from "./process.js";
import type { ClaudePermissionRequest } from "./protocol.js";

/** 一次模型请求携带的归属信息，由 runner-options 经 providerOptions 注入。 */
export interface ClaudeRequestContext {
  sessionId?: string;
  traceId?: string;
  turnId?: string;
  /** Kaguya 当前协作模式。 */
  mode?: string;
}

const PERMISSION_RULE_ID = "claude-code.can-use-tool";
const PERMISSION_MODE = "build";
const DENY_NO_BROKER =
  "Kaguya Code 当前无法向你确认权限，已拒绝这次工具调用。请在 Claude Code 终端里运行，或检查权限弹窗是否可用。";
const DENY_DEFAULT = "用户拒绝了这次工具调用。";

type RiskLevel = "low" | "medium" | "high";

function riskOf(toolName: string): RiskLevel {
  if (toolName === "Bash" || toolName === "KillShell") return "high";
  if (toolName === "WebFetch" || toolName === "WebSearch") return "low";
  return "medium";
}

/**
 * Claude 的 can_use_tool 请求 → Kaguya 的权限弹窗。
 *
 * 只读工具直接放行；其余交给 Kaguya 现有的 PermissionBroker，用户在原有权限 UI 里回答。
 * 没有 broker（例如非交互运行）时一律拒绝，而不是默认放行：宁可让模型换条路，也不静默执行。
 */
export function createClaudePermissionHandler(options: {
  broker?: PermissionBrokerPort;
  context: ClaudeRequestContext;
  newId: () => string;
  /** 弹确认卡片前先等工具行出现，保证卡片出现在对应的工具调用之后。 */
  beforeAsk?: (request: ClaudePermissionRequest) => Promise<void>;
}): (request: ClaudePermissionRequest, signal: AbortSignal) => Promise<ClaudePermissionAnswer> {
  return async (request, signal) => {
    if (CLAUDE_READ_ONLY_TOOLS.has(request.toolName)) {
      return { behavior: "allow" };
    }
    if (!options.broker || !options.context.sessionId || !options.context.traceId) {
      return { behavior: "deny", message: DENY_NO_BROKER };
    }

    await options.beforeAsk?.(request);
    const result = await options.broker.requestPermission(
      {
        requestId: options.newId(),
        sessionId: options.context.sessionId as SessionId,
        ...(options.context.turnId ? { turnId: options.context.turnId as TurnId } : {}),
        traceId: options.context.traceId as TraceId,
        toolCallId: (request.toolUseId ?? options.newId()) as ToolCallId,
        toolName: request.toolName,
        input: request.input,
        mode: PERMISSION_MODE,
        ruleId: PERMISSION_RULE_ID,
        reason:
          request.description ?? `Claude Code 请求使用 ${request.displayName ?? request.toolName}`,
        riskLevel: riskOf(request.toolName),
        requestedAt: new Date(),
      },
      { signal },
    );

    if (result.decision === "allow" || result.decision === "modify") {
      return {
        behavior: "allow",
        ...(result.modifiedInput !== undefined ? { updatedInput: result.modifiedInput } : {}),
      };
    }
    return { behavior: "deny", message: result.reason?.trim() || DENY_DEFAULT };
  };
}
