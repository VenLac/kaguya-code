// Claude CLI `--output-format stream-json` 输出行的最小类型与容错解析。
//
// 该协议没有公开稳定契约（与 Agent SDK 底层一致，随 claude 版本演进），所以这里只声明
// 本渠道真正消费的字段；未知类型/缺失字段一律降级为 `unknown`，由调用方忽略并记 debug，
// 不因格式漂移让整个回合失败。

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean }
  | { type: "other" };

export interface ClaudeStreamDelta {
  type: "text_delta" | "thinking_delta" | "input_json_delta" | "other";
  text?: string;
  thinking?: string;
  partial_json?: string;
}

export type ClaudeStreamEvent =
  | { type: "content_block_start"; index: number; block: ClaudeContentBlock }
  | { type: "content_block_delta"; index: number; delta: ClaudeStreamDelta }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; stopReason?: string; usage?: ClaudeUsage }
  | { type: "message_start" | "message_stop" | "other" };

/**
 * claude 随 can_use_tool 给出的「始终允许」建议（与它在终端里「不再询问」时写入的规则同形）。
 * 只按 type 区分；其余字段原样保留，回传 `updatedPermissions` 时不做改写（除 destination）。
 */
export type ClaudePermissionSuggestion = { type: string; destination?: string } & Record<
  string,
  unknown
>;

export interface ClaudePermissionRequest {
  requestId: string;
  toolName: string;
  toolUseId?: string;
  input: unknown;
  description?: string;
  displayName?: string;
  suggestions?: ClaudePermissionSuggestion[];
}

function parsePermissionSuggestions(value: unknown): ClaudePermissionSuggestion[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const suggestions = value.flatMap((item) => {
    const record = asRecord(item);
    const type = asString(record?.type);
    return record && type ? [{ ...record, type } as ClaudePermissionSuggestion] : [];
  });
  return suggestions.length > 0 ? suggestions : undefined;
}

export type ClaudeCliMessage =
  | { kind: "init"; sessionId: string; model?: string }
  | { kind: "stream_event"; sessionId?: string; parentToolUseId?: string; event: ClaudeStreamEvent }
  | {
      kind: "assistant";
      sessionId?: string;
      parentToolUseId?: string;
      blocks: ClaudeContentBlock[];
      /** assistant 消息上的结构化错误标记，如 authentication_failed。 */
      error?: string;
      text?: string;
    }
  | {
      kind: "user";
      parentToolUseId?: string;
      blocks: ClaudeContentBlock[];
      /** claude 随 tool_result 附带的结构化结果（Write/Edit 的 structuredPatch、Bash 的 stdout 等）。 */
      toolUseResult?: unknown;
    }
  | {
      kind: "result";
      sessionId?: string;
      isError: boolean;
      subtype?: string;
      resultText?: string;
      stopReason?: string;
      usage?: ClaudeUsage;
      costUsd?: number;
    }
  | { kind: "permission_request"; request: ClaudePermissionRequest }
  | { kind: "unknown"; type: string };

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseClaudeContentBlock(value: unknown): ClaudeContentBlock {
  const record = asRecord(value);
  switch (record?.type) {
    case "text":
      return { type: "text", text: asString(record.text) ?? "" };
    case "thinking":
      return { type: "thinking", thinking: asString(record.thinking) ?? "" };
    case "tool_use": {
      const id = asString(record.id);
      const name = asString(record.name);
      return id && name ? { type: "tool_use", id, name, input: record.input } : { type: "other" };
    }
    case "tool_result": {
      const toolUseId = asString(record.tool_use_id);
      return toolUseId
        ? {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: record.content,
            is_error: record.is_error === true,
          }
        : { type: "other" };
    }
    default:
      return { type: "other" };
  }
}

function parseBlocks(value: unknown): ClaudeContentBlock[] {
  if (typeof value === "string") return [{ type: "text", text: value }];
  return Array.isArray(value) ? value.map(parseClaudeContentBlock) : [];
}

function parseDelta(value: unknown): ClaudeStreamDelta {
  const record = asRecord(value);
  switch (record?.type) {
    case "text_delta":
      return { type: "text_delta", text: asString(record.text) ?? "" };
    case "thinking_delta":
      return { type: "thinking_delta", thinking: asString(record.thinking) ?? "" };
    case "input_json_delta":
      return { type: "input_json_delta", partial_json: asString(record.partial_json) ?? "" };
    default:
      return { type: "other" };
  }
}

function parseStreamEvent(value: unknown): ClaudeStreamEvent {
  const record = asRecord(value);
  const index = asNumber(record?.index) ?? 0;
  switch (record?.type) {
    case "content_block_start":
      return {
        type: "content_block_start",
        index,
        block: parseClaudeContentBlock(record.content_block),
      };
    case "content_block_delta":
      return { type: "content_block_delta", index, delta: parseDelta(record.delta) };
    case "content_block_stop":
      return { type: "content_block_stop", index };
    case "message_delta": {
      const delta = asRecord(record.delta);
      return {
        type: "message_delta",
        stopReason: asString(delta?.stop_reason),
        usage: parseUsage(record.usage),
      };
    }
    case "message_start":
    case "message_stop":
      return { type: record.type };
    default:
      return { type: "other" };
  }
}

function parseUsage(value: unknown): ClaudeUsage | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    input_tokens: asNumber(record.input_tokens),
    output_tokens: asNumber(record.output_tokens),
    cache_creation_input_tokens: asNumber(record.cache_creation_input_tokens),
    cache_read_input_tokens: asNumber(record.cache_read_input_tokens),
  };
}

/** 解析一行输出；非 JSON 或结构异常返回 undefined（调用方按需记 debug）。 */
export function parseClaudeCliLine(line: string): ClaudeCliMessage | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  const record = asRecord(value);
  const type = asString(record?.type);
  if (!record || !type) return undefined;

  const sessionId = asString(record.session_id);
  const parentToolUseId = asString(record.parent_tool_use_id);

  switch (type) {
    case "system":
      return record.subtype === "init" && sessionId
        ? { kind: "init", sessionId, model: asString(record.model) }
        : { kind: "unknown", type: `system/${asString(record.subtype) ?? ""}` };
    case "stream_event":
      return {
        kind: "stream_event",
        sessionId,
        parentToolUseId,
        event: parseStreamEvent(record.event),
      };
    case "assistant": {
      const message = asRecord(record.message);
      return {
        kind: "assistant",
        sessionId,
        parentToolUseId,
        blocks: parseBlocks(message?.content),
        error: asString(record.error),
      };
    }
    case "user": {
      const message = asRecord(record.message);
      return {
        kind: "user",
        parentToolUseId,
        blocks: parseBlocks(message?.content),
        ...(record.tool_use_result === undefined ? {} : { toolUseResult: record.tool_use_result }),
      };
    }
    case "result":
      return {
        kind: "result",
        sessionId,
        isError: record.is_error === true,
        subtype: asString(record.subtype),
        resultText: asString(record.result),
        stopReason: asString(record.stop_reason),
        usage: parseUsage(record.usage),
        costUsd: asNumber(record.total_cost_usd),
      };
    case "control_request": {
      const request = asRecord(record.request);
      const requestId = asString(record.request_id);
      const toolName = asString(request?.tool_name);
      if (request?.subtype !== "can_use_tool" || !requestId || !toolName) {
        return { kind: "unknown", type: `control_request/${asString(request?.subtype) ?? ""}` };
      }
      const suggestions = parsePermissionSuggestions(request.permission_suggestions);
      return {
        kind: "permission_request",
        request: {
          requestId,
          toolName,
          toolUseId: asString(request.tool_use_id),
          input: request.input,
          description: asString(request.description),
          displayName: asString(request.display_name),
          ...(suggestions ? { suggestions } : {}),
        },
      };
    }
    default:
      return { kind: "unknown", type };
  }
}
