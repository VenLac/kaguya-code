import type {
  PermissionBrokerPort,
  PermissionBrokerResult,
  PermissionRequestedPayload,
  PermissionResolvedPayload,
  TraceContext,
  TurnId,
} from "@zcode/contracts";

/** runtime 上记录外部权限事件的两个方法（见 core 的 external-permission-events.ts）。 */
interface ExternalPermissionEventRecorder {
  recordExternalPermissionRequested(
    input: PermissionRequestedPayload & { traceContext?: TraceContext },
  ): Promise<void>;
  recordExternalPermissionResolved(
    input: PermissionResolvedPayload & { traceContext?: TraceContext },
  ): Promise<void>;
}

/**
 * 给「外部进程执行的工具」（Claude Code）的权限请求补上与核心工具一致的事件。
 *
 * 核心工具的 `permission.requested/resolved` 由 tool executor 在调 broker 前后发出，
 * v4 确认卡片（Web / 手机重放链路）从这些事件投影出来；外部工具不经 executor，
 * 只调 broker 的话 v4 客户端永远看不到确认卡片。这里在同一个 broker 调用前后补发事件，
 * 不新增第二条权限决策路径：决策仍然只由 inner broker 给出。
 *
 * runtime 在模型适配器之后才构造，所以用 getRuntime 延迟获取；runtime 尚不存在时不发事件，
 * 但 broker 调用照常进行（v3 桌面链路不依赖这些事件）。
 */
export function createEventedPermissionBroker(deps: {
  inner: PermissionBrokerPort | undefined;
  getRuntime: () => ExternalPermissionEventRecorder | undefined;
  traceContext: TraceContext;
}): PermissionBrokerPort | undefined {
  const { inner } = deps;
  if (!inner) return undefined;

  return {
    async requestPermission(request, options) {
      const runtime = deps.getRuntime();
      const traceContext: TraceContext = {
        ...deps.traceContext,
        traceId: request.traceId,
        ...(request.turnId ? { turnId: request.turnId as TurnId } : {}),
      };
      await runtime?.recordExternalPermissionRequested({
        requestId: request.requestId,
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        riskLevel: request.riskLevel,
        reason: request.reason,
        input: request.input,
        ...(request.suggestedPermissionUpdates
          ? { suggestedPermissionUpdates: request.suggestedPermissionUpdates }
          : {}),
        ...(request.origin ? { origin: request.origin } : {}),
        ...(request.optionsPolicy ? { optionsPolicy: request.optionsPolicy } : {}),
        traceContext,
      });

      let result: PermissionBrokerResult;
      try {
        result = await inner.requestPermission(request, options);
      } catch (error) {
        // 取消/超时/传输失败也要收口，否则 v4 会留着一张永远无人应答的确认卡片。
        await runtime?.recordExternalPermissionResolved({
          requestId: request.requestId,
          toolCallId: request.toolCallId,
          decision: "deny",
          reason: error instanceof Error ? error.message : String(error),
          traceContext,
        });
        throw error;
      }
      await runtime?.recordExternalPermissionResolved({
        requestId: request.requestId,
        toolCallId: request.toolCallId,
        decision: result.decision,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
        ...(result.modifiedInput === undefined ? {} : { modifiedInput: result.modifiedInput }),
        traceContext,
      });
      return result;
    },
  };
}
