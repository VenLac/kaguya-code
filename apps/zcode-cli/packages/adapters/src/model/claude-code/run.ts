import { runClaudeCli, type ClaudeRunRequest } from "./process.js";
import type { ClaudeCliMessage } from "./protocol.js";
import type { ExternalToolRegistry } from "./external-tools.js";
import { isHiddenClaudeTool, mapClaudeToolCall } from "./tool-mapping.js";

/** 单生产者（读 claude 输出的 pump）/ 单消费者（当前模型步骤）的异步队列。 */
class MessageQueue {
  private readonly items: ClaudeCliMessage[] = [];
  private waiter:
    | { resolve: (value: ClaudeCliMessage | undefined) => void; reject: (e: unknown) => void }
    | undefined;
  private ended = false;
  private failure: { error: unknown } | undefined;

  push(message: ClaudeCliMessage): void {
    if (this.waiter) {
      const { resolve } = this.waiter;
      this.waiter = undefined;
      resolve(message);
      return;
    }
    this.items.push(message);
  }

  end(): void {
    this.ended = true;
    this.waiter?.resolve(undefined);
    this.waiter = undefined;
  }

  fail(error: unknown): void {
    this.failure = { error };
    this.waiter?.reject(error);
    this.waiter = undefined;
  }

  next(): Promise<ClaudeCliMessage | undefined> {
    const item = this.items.shift();
    if (item) return Promise.resolve(item);
    if (this.failure) return Promise.reject(this.failure.error);
    if (this.ended) return Promise.resolve(undefined);
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }
}

interface ClaudeRunDeps {
  request: Omit<ClaudeRunRequest, "signal">;
  externalTools: ExternalToolRegistry;
  /** run 结束（正常/失败/取消）时回调，用于从会话注册表摘除。 */
  onEnd: () => void;
}

/**
 * 一次 Kaguya 回合对应的 claude 子进程。
 *
 * claude 在一个进程里自己跑完「模型 → 工具 → 模型 …」的整条 agentic 循环，而 Kaguya 按步骤
 * 驱动：这个对象在后台持续读取 claude 的输出放进队列，各个模型步骤依次从队列里取出自己那条
 * assistant 消息；工具结果在读到的那一刻就交给 ExternalToolRegistry，不依赖 Kaguya 消费的快慢。
 */
export class ClaudeRun {
  private readonly queue = new MessageQueue();
  private readonly abort = new AbortController();
  /** 本 run 登记过的工具调用；结束时只收口这些，不影响其他会话的 run。 */
  private readonly toolUseIds = new Set<string>();
  private isOpen = true;

  constructor(private readonly deps: ClaudeRunDeps) {}

  get open(): boolean {
    return this.isOpen;
  }

  start(): void {
    void this.pump();
  }

  next(): Promise<ClaudeCliMessage | undefined> {
    return this.queue.next();
  }

  cancel(reason?: unknown): void {
    this.abort.abort(reason);
  }

  private async pump(): Promise<void> {
    try {
      for await (const message of runClaudeCli({
        ...this.deps.request,
        signal: this.abort.signal,
      })) {
        this.route(message);
        this.queue.push(message);
      }
      this.queue.end();
    } catch (error) {
      this.queue.fail(error);
    } finally {
      this.isOpen = false;
      // 进程已结束：还没出结果的工具调用不会再有结果了，收口为失败。
      this.deps.externalTools.failPending(this.toolUseIds, "Claude Code 在工具返回结果前结束。");
      this.deps.onEnd();
    }
  }

  /** 读到的当下就登记工具调用 / 交付工具结果（子 agent 内部消息不参与）。 */
  private route(message: ClaudeCliMessage): void {
    if (message.kind === "assistant" && !message.parentToolUseId) {
      for (const block of message.blocks) {
        if (block.type !== "tool_use" || isHiddenClaudeTool(block.name)) continue;
        this.toolUseIds.add(block.id);
        this.deps.externalTools.register(
          block.id,
          block.name,
          mapClaudeToolCall(block.name, block.input),
        );
      }
    } else if (message.kind === "user" && !message.parentToolUseId) {
      for (const block of message.blocks) {
        if (block.type !== "tool_result") continue;
        this.deps.externalTools.resolveResult(block.tool_use_id, {
          content: block.content,
          isError: block.is_error === true,
          toolUseResult: message.toolUseResult,
        });
      }
    }
  }
}

/** 按 Kaguya 会话维护进行中的 run；同一会话同时只会有一个。 */
export class ClaudeRunRegistry {
  private readonly runs = new Map<string, ClaudeRun>();

  get(sessionKey: string): ClaudeRun | undefined {
    return this.runs.get(sessionKey);
  }

  set(sessionKey: string, run: ClaudeRun): void {
    this.runs.set(sessionKey, run);
  }

  /** 仅当登记的仍是这个 run 时才摘除，避免新 run 被旧 run 的收尾误删。 */
  delete(sessionKey: string, run: ClaudeRun): void {
    if (this.runs.get(sessionKey) === run) this.runs.delete(sessionKey);
  }
}
