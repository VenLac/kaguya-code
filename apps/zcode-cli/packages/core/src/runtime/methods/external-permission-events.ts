import {
  SessionEventType,
  type PermissionRequestedPayload,
  type PermissionResolvedPayload,
  type TraceContext,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";

/**
 * 记录「外部执行的工具」（如 Claude Code 在它自己的进程里跑的 Bash）发起的权限请求。
 *
 * 核心工具的权限事件由 tool executor 在调 broker 前后发出；外部工具不经过 executor，
 * 但 v4 的权限确认卡片（Web / 手机重放链路）正是从 `permission.requested` 事件投影出来的。
 * 不补这两个事件，v4 客户端永远看不到确认卡片，回合会一直等一个无人能给的答案。
 * 事件必须走 runtime 的 durable append/sink 链路，desktop continuous 与 web remote replayable 才恢复同一份状态。
 */
export async function recordExternalPermissionRequested(
  this: AgentRuntimeInternal,
  input: PermissionRequestedPayload & { traceContext?: TraceContext },
): Promise<void> {
  const { traceContext: provided, ...payload } = input;
  const traceContext = provided ?? this.rootTraceContext;
  await this.appendEvent(
    this.createEvent(
      SessionEventType.PermissionRequested,
      payload satisfies PermissionRequestedPayload,
      traceContext,
    ),
    traceContext,
  );
}

export async function recordExternalPermissionResolved(
  this: AgentRuntimeInternal,
  input: PermissionResolvedPayload & { traceContext?: TraceContext },
): Promise<void> {
  const { traceContext: provided, ...payload } = input;
  const traceContext = provided ?? this.rootTraceContext;
  await this.appendEvent(
    this.createEvent(
      SessionEventType.PermissionResolved,
      payload satisfies PermissionResolvedPayload,
      traceContext,
    ),
    traceContext,
  );
}
