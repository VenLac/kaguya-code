import type {
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import type { ClaudeCliMessage, ClaudeUsage } from "./protocol.js";
import { isHiddenClaudeTool, mapClaudeToolCall, provisionalToolName } from "./tool-mapping.js";

type ResultMessage = Extract<ClaudeCliMessage, { kind: "result" }>;
type StreamEvent = Extract<ClaudeCliMessage, { kind: "stream_event" }>["event"];

interface ToolBlock {
  toolUseId: string;
  claudeName: string;
  json: string;
}

interface ClaudeStepMapperOptions {
  /** 缓冲模式（一次性辅助请求）：文本攒到结果到达后一次发出，并剥掉整段包裹的代码围栏。 */
  bufferText?: boolean;
  /** 本次请求里 Kaguya 提供的工具名；不在其中的调用标记为 dynamic，避免被 AI SDK 的本地校验拦掉。 */
  requestToolNames?: ReadonlySet<string>;
}

/**
 * 把 claude 的 stream-json 消息映射成 AI SDK 流片段（一个实例对应一个 Kaguya 模型步骤）。
 *
 * 一条 Claude assistant 消息 ＝ 一个 Kaguya 步骤：
 * - 含 tool_use 的消息在 message_stop 处结束步骤（finishReason=tool-calls）；
 *   工具由 claude 自己执行，结果经 ExternalToolRegistry 交给 core 的 executor，随后 core 发起下一步。
 * - 不含 tool_use 的最终消息在 result 到达时结束步骤（finishReason=stop）。
 *
 * 文本、thinking（原生 reasoning 片段）、工具入参流（实时显示 Write/Edit 内容）都走原生通道。
 * 子 agent 内部活动（parent_tool_use_id 非空）不展示，只展示发起它的 Task 调用与最终结果。
 */
export class ClaudeStepMapper {
  private readonly bufferText: boolean;
  private readonly requestToolNames: ReadonlySet<string>;
  private messageSeq = 0;
  private bufferedText = "";
  private readonly openParts = new Map<number, { id: string; kind: "text" | "reasoning" }>();
  private readonly toolBlocks = new Map<number, ToolBlock>();
  /** assistant 快照里的完整入参（比拼接 partial_json 更可靠）。 */
  private readonly snapshotInputs = new Map<string, unknown>();
  private toolUseCount = 0;
  private completed = false;
  private resultValue: ResultMessage | undefined;
  private assistantErrorValue: string | undefined;
  private sessionIdValue: string | undefined;
  private usageValue: ClaudeUsage = {};
  private emittedText = false;

  constructor(options: ClaudeStepMapperOptions = {}) {
    this.bufferText = options.bufferText === true;
    this.requestToolNames = options.requestToolNames ?? new Set();
  }

  get stepComplete(): boolean {
    return this.completed;
  }
  /** 本步骤是否以工具调用结束（决定 finishReason 与 run 是否继续）。 */
  get endedWithToolCalls(): boolean {
    return this.toolUseCount > 0;
  }
  get result(): ResultMessage | undefined {
    return this.resultValue;
  }
  get assistantError(): string | undefined {
    return this.assistantErrorValue;
  }
  get sessionId(): string | undefined {
    return this.sessionIdValue;
  }
  get producedText(): boolean {
    return this.emittedText;
  }
  /** 本步骤累计的模型用量（每条 message_delta 的用量之和；缺失时回退到 result 的总量）。 */
  get usage(): ClaudeUsage | undefined {
    const hasUsage = Object.keys(this.usageValue).length > 0;
    return hasUsage ? this.usageValue : this.resultValue?.usage;
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
        this.completed = true;
        return [...this.closeOpenParts(), ...this.flushBufferedText()];
      case "stream_event":
        return message.parentToolUseId ? [] : this.mapStreamEvent(message.event);
      case "assistant":
        if (message.error) this.assistantErrorValue = message.error;
        if (!message.parentToolUseId) {
          for (const block of message.blocks) {
            if (block.type === "tool_use") this.snapshotInputs.set(block.id, block.input);
          }
        }
        return [];
      case "user":
      case "permission_request":
      case "unknown":
        return [];
    }
  }

  private mapStreamEvent(event: StreamEvent): LanguageModelV3StreamPart[] {
    switch (event.type) {
      case "message_start":
        this.messageSeq += 1;
        return [];
      case "content_block_start":
        return this.startBlock(event);
      case "content_block_delta":
        return this.deltaBlock(event);
      case "content_block_stop":
        return this.stopBlock(event.index);
      case "message_delta":
        this.accumulateUsage(event.usage);
        return [];
      case "message_stop":
        if (this.toolUseCount > 0) this.completed = true;
        return this.completed ? this.closeOpenParts() : [];
      default:
        return [];
    }
  }

  private startBlock(
    event: Extract<StreamEvent, { type: "content_block_start" }>,
  ): LanguageModelV3StreamPart[] {
    const { block, index } = event;
    if (block.type === "text") {
      if (this.bufferText) return [];
      const id = `claude-text-${this.messageSeq}-${index}`;
      this.openParts.set(index, { id, kind: "text" });
      return [{ type: "text-start", id }];
    }
    if (block.type === "thinking") {
      if (this.bufferText) return [];
      const id = `claude-thinking-${this.messageSeq}-${index}`;
      this.openParts.set(index, { id, kind: "reasoning" });
      return [{ type: "reasoning-start", id }];
    }
    if (block.type === "tool_use" && !isHiddenClaudeTool(block.name)) {
      this.toolBlocks.set(index, { toolUseId: block.id, claudeName: block.name, json: "" });
      const provisional = provisionalToolName(block.name);
      return [
        {
          type: "tool-input-start",
          id: block.id,
          toolName: provisional,
          providerExecuted: true,
          dynamic: !this.requestToolNames.has(provisional),
        },
      ];
    }
    return [];
  }

  private deltaBlock(
    event: Extract<StreamEvent, { type: "content_block_delta" }>,
  ): LanguageModelV3StreamPart[] {
    const { index, delta } = event;
    if (this.bufferText && delta.type === "text_delta" && delta.text) {
      this.bufferedText += delta.text;
      this.emittedText = true;
      return [];
    }
    const open = this.openParts.get(index);
    if (open && delta.type === "text_delta" && delta.text) {
      this.emittedText = true;
      return [{ type: "text-delta", id: open.id, delta: delta.text }];
    }
    if (open && delta.type === "thinking_delta" && delta.thinking) {
      return [{ type: "reasoning-delta", id: open.id, delta: delta.thinking }];
    }
    const tool = this.toolBlocks.get(index);
    if (tool && delta.type === "input_json_delta" && delta.partial_json) {
      tool.json += delta.partial_json;
      return [{ type: "tool-input-delta", id: tool.toolUseId, delta: delta.partial_json }];
    }
    return [];
  }

  private stopBlock(index: number): LanguageModelV3StreamPart[] {
    const open = this.openParts.get(index);
    if (open) {
      this.openParts.delete(index);
      return [{ type: open.kind === "text" ? "text-end" : "reasoning-end", id: open.id }];
    }
    const tool = this.toolBlocks.get(index);
    if (!tool) return [];
    this.toolBlocks.delete(index);
    this.toolUseCount += 1;
    const mapped = mapClaudeToolCall(tool.claudeName, this.finalToolInput(tool));
    return [
      { type: "tool-input-end", id: tool.toolUseId },
      {
        type: "tool-call",
        toolCallId: tool.toolUseId,
        toolName: mapped.name,
        input: JSON.stringify(mapped.input),
        providerExecuted: true,
        dynamic: !this.requestToolNames.has(mapped.name),
      },
    ];
  }

  private finalToolInput(tool: ToolBlock): unknown {
    const snapshot = this.snapshotInputs.get(tool.toolUseId);
    if (snapshot !== undefined) return snapshot;
    try {
      return tool.json.trim() ? (JSON.parse(tool.json) as unknown) : {};
    } catch {
      return {};
    }
  }

  private accumulateUsage(usage: ClaudeUsage | undefined): void {
    if (!usage) return;
    for (const key of [
      "input_tokens",
      "output_tokens",
      "cache_creation_input_tokens",
      "cache_read_input_tokens",
    ] as const) {
      const value = usage[key];
      if (typeof value === "number") this.usageValue[key] = (this.usageValue[key] ?? 0) + value;
    }
  }

  private flushBufferedText(): LanguageModelV3StreamPart[] {
    if (!this.bufferedText) return [];
    const text = stripSingleCodeFence(this.bufferedText);
    this.bufferedText = "";
    const id = `claude-text-${this.messageSeq}-buffered`;
    return [
      { type: "text-start", id },
      { type: "text-delta", id, delta: text },
      { type: "text-end", id },
    ];
  }

  private closeOpenParts(): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];
    for (const open of this.openParts.values()) {
      parts.push({ type: open.kind === "text" ? "text-end" : "reasoning-end", id: open.id });
    }
    this.openParts.clear();
    return parts;
  }
}

const SINGLE_CODE_FENCE = /^\s*(`{3,})[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?\1[ \t]*\s*$/;

/**
 * 整段输出恰好是一个代码围栏时去掉围栏。claude 常把「只返回 JSON」包进 ```json，
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

export function toFinishReason(input: {
  toolCalls: boolean;
  result: ResultMessage | undefined;
}): LanguageModelV3FinishReason {
  if (input.toolCalls) return { unified: "tool-calls", raw: "tool_use" };
  const { result } = input;
  if (!result || result.isError) return { unified: "error", raw: result?.subtype };
  if (result.stopReason === "max_tokens") return { unified: "length", raw: result.stopReason };
  return { unified: "stop", raw: result.stopReason };
}
