import type {
  ExternalToolClaim,
  ExternalToolExecutionPort,
  ExternalToolOutcome,
} from "@zcode/contracts";
import {
  mapClaudeToolOutcome,
  type ClaudeToolResultInput,
  type MappedToolCall,
} from "./tool-mapping.js";
import { toolResultText } from "./content.js";

/** 外部进程发出的权限请求等待工具行出现的最长时间，超时也放行请求（避免永久卡住）。 */
const STARTED_WAIT_TIMEOUT_MS = 10_000;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface ExternalToolEntry {
  toolUseId: string;
  claudeName: string;
  mapped: MappedToolCall;
  started: ReturnType<typeof deferred<void>>;
  outcome: ReturnType<typeof deferred<ExternalToolOutcome>>;
  settled: boolean;
}

/**
 * 本机 Claude 正在执行的工具调用登记表，同时实现 core 的 ExternalToolExecutionPort：
 * core 的 tool executor 据此把这些调用当原生调用记录，并等待这里回传的结果。
 *
 * 登记发生在读取 claude 输出的那一刻（不是 Kaguya 消费到它的那一刻），所以不管 Kaguya
 * 处理得多慢，先到的结果都不会丢。
 */
export class ExternalToolRegistry implements ExternalToolExecutionPort {
  private readonly entries = new Map<string, ExternalToolEntry>();

  register(toolUseId: string, claudeName: string, mapped: MappedToolCall): void {
    if (this.entries.has(toolUseId)) return;
    this.entries.set(toolUseId, {
      toolUseId,
      claudeName,
      mapped,
      started: deferred<void>(),
      outcome: deferred<ExternalToolOutcome>(),
      settled: false,
    });
  }

  /** claude 回传了 tool_result：翻译成原生输出并唤醒等待者。 */
  resolveResult(
    toolUseId: string,
    result: { content: unknown; isError: boolean; toolUseResult: unknown },
  ): void {
    const entry = this.entries.get(toolUseId);
    if (!entry || entry.settled) return;
    entry.settled = true;
    const input: ClaudeToolResultInput = {
      claudeName: entry.claudeName,
      input: entry.mapped.input,
      content: toolResultText(result.content),
      isError: result.isError,
      toolUseResult: result.toolUseResult,
    };
    entry.outcome.resolve(mapClaudeToolOutcome(input));
  }

  /** claude 进程结束/被取消时，把还没出结果的调用收口为失败，不让 executor 永远等下去。 */
  failPending(reason: string): void {
    for (const entry of this.entries.values()) {
      if (entry.settled) continue;
      entry.settled = true;
      entry.started.resolve();
      entry.outcome.resolve({ success: false, error: reason });
    }
  }

  /** 权限请求用：等工具行出现（executor 已开始处理）后再弹确认卡片，保证卡片出现在工具行之后。 */
  async waitUntilStarted(toolUseId: string): Promise<void> {
    const entry = this.entries.get(toolUseId);
    if (!entry) return;
    await Promise.race([
      entry.started.promise,
      new Promise<void>((resolve) => setTimeout(resolve, STARTED_WAIT_TIMEOUT_MS).unref()),
    ]);
  }

  claim(toolCallId: string): ExternalToolClaim | undefined {
    const entry = this.entries.get(toolCallId);
    if (!entry) return undefined;
    return {
      markStarted: () => entry.started.resolve(),
      waitForOutcome: async (signal) => {
        try {
          if (!signal) return await entry.outcome.promise;
          if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
          return await new Promise<ExternalToolOutcome>((resolve, reject) => {
            const onAbort = (): void =>
              reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
            signal.addEventListener("abort", onAbort, { once: true });
            entry.outcome.promise.then(resolve, reject).finally(() => {
              signal.removeEventListener("abort", onAbort);
            });
          });
        } finally {
          // 结果交付后登记项即可释放；中止时也释放，避免泄漏。
          this.entries.delete(toolCallId);
        }
      },
    };
  }
}
