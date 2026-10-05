import { SessionEventType, type SessionEvent } from "@zcode/contracts";
import type { ZCodeComputerUseOperationEvent } from "@zcode/shared";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * 这个 cell 是否在用 Computer Use。
 *
 * 只做布尔判定，不从源码里抽取动作名：源码形态会随 node_repl SDK 演进（如改成 `getApp()` +
 * 绑定对象 + `computer.*`），字符串匹配迟早一种都命中不了；测试夹具也容易喂入 SDK 从不
 * 产出的扁平形态，让 CI 假绿。
 *
 * 锚点选 `setupComputerUseRuntime`，因为它是模型**必须原样照抄**的引导语句，且这是架构强制
 * 而非文档软要求：Kaguya Code 的 node_repl 每个 cell 都是全新 Worker、SDK 绑定不跨 cell，所以
 * 参考文档写明「The first executable statement of every CUA cell must be this bootstrap,
 * and the bootstrap and the actions must be in the same cell」。凡用 CUA 的 cell 必然含它。
 *
 * Browser Use 的 `agent.browsers.*` 不含该引导，不会命中。
 */
function usesComputerUse(input: unknown): boolean {
  const code = nonEmptyString(asRecord(input).code);
  if (!code) return false;
  return code.includes("setupComputerUseRuntime");
}

function baseEvent(event: SessionEvent) {
  return {
    eventId: String(event.id),
    sequenceNumber: event.sequenceNumber,
    sessionId: String(event.sessionId),
    timestamp: event.timestamp.getTime(),
  };
}

export function mapComputerUseOperationEvent(
  event: SessionEvent,
): ZCodeComputerUseOperationEvent | undefined {
  const turnId = event.turnId ? String(event.turnId) : undefined;
  const payload = asRecord(event.payload);
  switch (event.type) {
    case SessionEventType.TurnStarted:
      return turnId ? { ...baseEvent(event), kind: "turn-started", turnId } : undefined;
    case SessionEventType.TurnComplete:
      return turnId ? { ...baseEvent(event), kind: "turn-completed", turnId } : undefined;
    case SessionEventType.TurnError:
      return turnId ? { ...baseEvent(event), kind: "turn-failed", turnId } : undefined;
    case SessionEventType.ToolCallScheduled: {
      const toolCallId = nonEmptyString(payload.toolCallId);
      const toolName = nonEmptyString(payload.toolName);
      return turnId && toolCallId && toolName
        ? {
            ...baseEvent(event),
            kind: "tool-scheduled",
            turnId,
            toolCallId,
            toolName,
            ...(toolName === "mcp__node_repl__js" && usesComputerUse(payload.input)
              ? { computerUse: true as const }
              : {}),
          }
        : undefined;
    }
    case SessionEventType.ToolCallStarted: {
      const toolCallId = nonEmptyString(payload.toolCallId);
      if (!toolCallId) return undefined;
      const toolName = nonEmptyString(payload.toolName);
      return {
        ...baseEvent(event),
        kind: "tool-started",
        ...(turnId ? { turnId } : {}),
        toolCallId,
        ...(toolName ? { toolName } : {}),
      };
    }
    case SessionEventType.SessionEnded:
      return { ...baseEvent(event), kind: "session-closed" };
    default:
      return undefined;
  }
}
