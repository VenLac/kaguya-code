import {
  CoreErrorType,
  createCoreError,
  traceContextToLogContext,
  type ExternalToolClaim,
  type ToolExecutionSpanWriter,
  type TraceContext,
  type TurnId,
} from "@zcode/contracts";
import type { ExecutableToolCall, ToolExecutionResult, ToolResultSerialization } from "../types.js";
import { createErrorResult } from "./errors.js";
import { emitToolCallError, emitToolCallResult, emitToolCallStarted } from "./events.js";
import { createToolResultDisplay } from "./result-display.js";
import type { ToolExecuteOptions, ToolExecutorDeps } from "./types.js";

/**
 * 执行一个由外部进程（本机 Claude Code）负责执行的工具调用。
 *
 * 对 core 而言它仍是一次原生工具调用：同样发 ToolCallStarted / ToolCallResult|Error 事件、
 * 同样生成展示卡片（卡片由工具名 + 输出形状决定，外部进程回传的结果已翻译成原生输出形状）、
 * 同样进入历史。区别只有两点：不跑本地 handler（外部进程已经在执行），
 * 也不走本地 PreToolUse hook / 权限判定——该调用的权限由外部进程的 can_use_tool 请求单独确认，
 * 否则同一个调用会弹两次确认，且本地判定发生在外部进程已经动手之后。
 */
export async function executeExternalToolCall(input: {
  deps: ToolExecutorDeps;
  claim: ExternalToolClaim;
  toolCall: ExecutableToolCall;
  traceContext: TraceContext;
  turnId: TurnId | undefined;
  totalStartedAt: number;
  options?: ToolExecuteOptions;
  telemetry?: ToolExecutionSpanWriter;
}): Promise<ToolExecutionResult> {
  const { deps, claim, toolCall, traceContext, turnId, options, telemetry } = input;
  const startTime = Date.now();
  const entry = deps.registry.get(toolCall.name);

  await emitToolCallStarted(deps, toolCall, traceContext, turnId, startTime);
  claim.markStarted();
  deps.logger?.info("External tool call started", {
    ...traceContextToLogContext(traceContext),
    event: "tool.call.external_started",
    module: "core.tool.executor",
    status: "started",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
  });

  try {
    const outcome = await claim.waitForOutcome(options?.signal);
    const durationMs = Date.now() - startTime;

    if (!outcome.success) {
      const result = createErrorResult(toolCall, new Error(outcome.error), durationMs);
      await emitToolCallError(deps, toolCall.id, traceContext, turnId, result.error);
      telemetry?.finishFailed("handler", "internal", result.error);
      return result;
    }

    // 外部进程给模型看的就是这段文本；不再套本地结果预算，避免与它实际看到的内容分叉。
    const bytes = Buffer.byteLength(outcome.modelContent);
    const serialization: ToolResultSerialization = {
      content: outcome.modelContent,
      modelContent: outcome.modelContent,
      originalBytes: bytes,
      returnedBytes: bytes,
      truncated: false,
      budgetStrategy: "inline",
    };
    const display = createToolResultDisplay(toolCall.name, outcome.output, {
      mcp: entry?.metadata.mcpPresentation,
    });
    const result: ToolExecutionResult = {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      success: true,
      output: outcome.output,
      display,
      modelContent: outcome.modelContent,
      serialization,
      durationMs,
      startedAt: new Date(startTime),
      completedAt: new Date(),
    };
    await emitToolCallResult(
      deps,
      toolCall,
      traceContext,
      turnId,
      serialization,
      durationMs,
      display,
      undefined,
      undefined,
    );
    telemetry?.setOutputBytes(serialization.returnedBytes);
    telemetry?.finishCompleted();
    return result;
  } catch (error) {
    const aborted = options?.signal?.aborted === true;
    const cause = error instanceof Error ? error : new Error(String(error));
    const result = createErrorResult(
      toolCall,
      aborted ? createCoreError(CoreErrorType.ToolCancelled, "Tool execution cancelled") : cause,
      Date.now() - startTime,
    );
    await emitToolCallError(deps, toolCall.id, traceContext, turnId, result.error);
    if (aborted) telemetry?.finishCancelled("abort_signal");
    else telemetry?.finishFailed("handler", "internal", cause);
    return result;
  }
}
