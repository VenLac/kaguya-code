import type {
  PermissionBrokerPort,
  PermissionBrokerResult,
  PermissionRuleBehavior,
  PermissionRuleValue,
  PermissionUpdate,
  SessionId,
  ToolCallId,
  TraceId,
  TurnId,
} from "@zcode/contracts";
import { CLAUDE_READ_ONLY_TOOLS } from "./constants.js";
import type { ClaudePermissionAnswer } from "./process.js";
import type { ClaudePermissionRequest, ClaudePermissionSuggestion } from "./protocol.js";

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

/** 「始终允许」时回传给 claude 的建议类型；setMode 会悄悄切换权限模式，从不回传。 */
const REMEMBERED_SUGGESTION_TYPES = new Set(["addRules", "addDirectories"]);
const SESSION_DESTINATION = "session";
const RULE_BEHAVIORS = new Set<PermissionRuleBehavior>(["allow", "deny", "ask"]);

function asRuleValue(value: unknown): PermissionRuleValue | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { toolName, ruleContent } = value as Record<string, unknown>;
  if (typeof toolName !== "string" || !toolName) return undefined;
  return typeof ruleContent === "string" && ruleContent ? { toolName, ruleContent } : { toolName };
}

/** claude 的 addRules 建议 → Kaguya 卡片展示用的规则（去掉 claude 专有的 destination）。 */
function toKaguyaUpdates(suggestions: readonly ClaudePermissionSuggestion[]): PermissionUpdate[] {
  return suggestions.flatMap((suggestion) => {
    if (suggestion.type !== "addRules") return [];
    const behavior = suggestion.behavior as PermissionRuleBehavior;
    const rules = Array.isArray(suggestion.rules)
      ? suggestion.rules.flatMap((rule) => asRuleValue(rule) ?? [])
      : [];
    return RULE_BEHAVIORS.has(behavior) && rules.length > 0
      ? [{ type: "addRules" as const, behavior, rules }]
      : [];
  });
}

/**
 * 用户选了「始终允许」（项目级或会话级）时，把 claude 自己的建议原样交回，由 claude 落盘；
 * Kaguya 不另存规则（规则的唯一所有者是 Claude Code）。会话级选择只在本 claude 会话生效。
 */
function rememberedPermissions(
  result: PermissionBrokerResult,
  suggestions: readonly ClaudePermissionSuggestion[],
): ClaudePermissionSuggestion[] | undefined {
  const sessionOnly = !result.permissionUpdates?.length;
  if (sessionOnly && !result.sessionPermissionUpdates?.length) return undefined;
  const remembered = suggestions
    .filter((suggestion) => REMEMBERED_SUGGESTION_TYPES.has(suggestion.type))
    .map((suggestion) =>
      sessionOnly ? { ...suggestion, destination: SESSION_DESTINATION } : suggestion,
    );
  return remembered.length > 0 ? remembered : undefined;
}

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
    const suggestions = request.suggestions ?? [];
    const suggestedUpdates = toKaguyaUpdates(suggestions);
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
        // claude 没给可记住的规则时不展示「始终允许」：选了也兑现不了。
        ...(suggestedUpdates.length > 0
          ? { suggestedPermissionUpdates: suggestedUpdates }
          : { optionsPolicy: "no-always-allow" as const }),
        requestedAt: new Date(),
      },
      { signal },
    );

    if (result.decision === "allow" || result.decision === "modify") {
      const updatedPermissions = rememberedPermissions(result, suggestions);
      return {
        behavior: "allow",
        ...(result.modifiedInput !== undefined ? { updatedInput: result.modifiedInput } : {}),
        ...(updatedPermissions ? { updatedPermissions } : {}),
      };
    }
    return { behavior: "deny", message: result.reason?.trim() || DENY_DEFAULT };
  };
}
