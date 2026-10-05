import type {
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import type { ClaudeCliMessage, ClaudeUsage } from "./protocol.js";
import { renderToolResult, renderToolUse } from "./render.js";

type ResultMessage = Extract<ClaudeCliMessage, { kind: "result" }>;

/**
 * 把 claude 的 stream-json 消息映射成 AI SDK 流片段（纯函数式状态机，不做任何 IO，便于单测）。
 *
 * - 主线程文本：用 stream_event 的增量（--include-partial-messages）。
 * - 工具活动：assistant 消息里的 tool_use / user 消息里的 tool_result，渲染成文本片段。
 * - thinking 不下发：reasoning 块会进入 Kaguya 的历史并在换模型时回放，
 *   而 Claude 的 thinking 没有可校验的签名，跨 provider 回放有被拒的风险。
 * - 子 agent 内部活动（parent_tool_use_id 非空）不展示，只展示发起它的 Task 调用与最终结果。
 */
export class ClaudeStreamMapper {
  /** 缓冲模式（一次性辅助请求）：文本攒到结果到达后一次发出，并剥掉整段包裹的代码围栏。 */
  private readonly bufferText: boolean;
  private bufferedText = "";
  private messageSeq = 0;
  private partSeq = 0;
  private readonly openTextParts = new Map<number, string>();
  private readonly renderedToolUses = new Set<string>();
  private readonly toolNames = new Map<string, string>();
  private sessionIdValue: string | undefined;
  private resultValue: ResultMessage | undefined;
  private assistantErrorValue: string | undefined;
  private emittedText = false;

  constructor(options: { bufferText?: boolean } = {}) {
    this.bufferText = options.bufferText === true;
  }

  get sessionId(): string | undefined {
    return this.sessionIdValue;
  }
  get result(): ResultMessage | undefined {
    return this.resultValue;
  }
  /** assistant 消息上的结构化错误标记（如 authentication_failed）。 */
  get assistantError(): string | undefined {
    return this.assistantErrorValue;
  }
  get producedText(): boolean {
    return this.emittedText;
  }

  map(message: ClaudeCliMessage): LanguageModelV3StreamPart[] {
    switch (message.kind) {
      case "init":
        this.sessionIdValue = message.sessionId;
        return message.model
          ? [{ type: "response-metadata", id: message.sessionId, modelId: message.model }]
          : [];
      case "result":
        this.resultValue = message;
        this.sessionIdValue ??= message.sessionId;
        return [...this.closeOpenText(), ...this.flushBufferedText()];
      case "stream_event":
        return message.parentToolUseId ? [] : this.mapStreamEvent(message.event);
      case "assistant":
        if (message.error) this.assistantErrorValue = message.error;
        return message.parentToolUseId ? [] : this.mapAssistant(message.blocks);
      case "user":
        return message.parentToolUseId ? [] : this.mapToolResults(message.blocks);
      case "permission_request":
      case "unknown":
        return [];
    }
  }

  private mapStreamEvent(
    event: Extract<ClaudeCliMessage, { kind: "stream_event" }>["event"],
  ): LanguageModelV3StreamPart[] {
    switch (event.type) {
      case "message_start":
        this.messageSeq += 1;
        return [];
      case "content_block_start": {
        if (event.block.type !== "text" || this.bufferText) return [];
        const id = this.textPartId(event.index);
        this.openTextParts.set(event.index, id);
        return [{ type: "text-start", id }];
      }
      case "content_block_delta": {
        if (this.bufferText && event.delta.type === "text_delta" && event.delta.text) {
          this.bufferedText += event.delta.text;
          this.emittedText = true;
          return [];
        }
        const id = this.openTextParts.get(event.index);
        if (!id || event.delta.type !== "text_delta" || !event.delta.text) return [];
        this.emittedText = true;
        return [{ type: "text-delta", id, delta: event.delta.text }];
      }
      case "content_block_stop": {
        const id = this.openTextParts.get(event.index);
        if (!id) return [];
        this.openTextParts.delete(event.index);
        return [{ type: "text-end", id }];
      }
      default:
        return [];
    }
  }

  private mapAssistant(
    blocks: Extract<ClaudeCliMessage, { kind: "assistant" }>["blocks"],
  ): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];
    for (const block of blocks) {
      if (block.type !== "tool_use" || this.renderedToolUses.has(block.id)) continue;
      this.renderedToolUses.add(block.id);
      this.toolNames.set(block.id, block.name);
      parts.push(...this.standaloneText(renderToolUse(block.name, block.input)));
    }
    return parts;
  }

  private mapToolResults(
    blocks: Extract<ClaudeCliMessage, { kind: "user" }>["blocks"],
  ): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];
    for (const block of blocks) {
      if (block.type !== "tool_result") continue;
      const text = renderToolResult(block.content, block.is_error === true);
      if (text) parts.push(...this.standaloneText(text));
    }
    return parts;
  }

  /** 工具活动用独立的 text 片段（start/delta/end 一次发完），不与流式正文交错。 */
  private standaloneText(text: string): LanguageModelV3StreamPart[] {
    const id = `claude-tool-${(this.partSeq += 1)}`;
    this.emittedText = true;
    return [
      { type: "text-start", id },
      { type: "text-delta", id, delta: text },
      { type: "text-end", id },
    ];
  }

  private flushBufferedText(): LanguageModelV3StreamPart[] {
    if (!this.bufferedText) return [];
    const text = stripSingleCodeFence(this.bufferedText);
    this.bufferedText = "";
    return this.standaloneText(text);
  }

  private textPartId(index: number): string {
    return `claude-text-${this.messageSeq}-${index}`;
  }

  private closeOpenText(): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];
    for (const id of this.openTextParts.values()) parts.push({ type: "text-end", id });
    this.openTextParts.clear();
    return parts;
  }
}

const SINGLE_CODE_FENCE = /^\s*(`{3,})[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?\1[ \t]*\s*$/;

/**
 * 整段输出恰好是一个代码围栏时去掉围栏。claude 常把「只返回 JSON」的答复包进 ```json，
 * 而标题/摘要这类调用方按裸 JSON 解析。只处理「整段就是一个围栏」，正文里的代码块不动。
 */
export function stripSingleCodeFence(text: string): string {
  const match = SINGLE_CODE_FENCE.exec(text);
  return match ? match[2]! : text;
}

export function toLanguageModelUsage(usage: ClaudeUsage | undefined): LanguageModelV3Usage {
  const input = usage?.input_tokens ?? 0;
  const cacheRead = usage?.cache_read_input_tokens ?? 0;
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
  const output = usage?.output_tokens;
  return {
    inputTokens: {
      total: usage ? input + cacheRead + cacheWrite : undefined,
      noCache: usage ? input : undefined,
      cacheRead: usage ? cacheRead : undefined,
      cacheWrite: usage ? cacheWrite : undefined,
    },
    outputTokens: { total: output, text: output, reasoning: undefined },
  };
}

export function toFinishReason(result: ResultMessage | undefined): LanguageModelV3FinishReason {
  if (!result || result.isError) return { unified: "error", raw: result?.subtype };
  if (result.stopReason === "max_tokens") return { unified: "length", raw: result.stopReason };
  return { unified: "stop", raw: result.stopReason };
}
