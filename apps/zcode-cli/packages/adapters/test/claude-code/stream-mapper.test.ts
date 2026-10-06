import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClaudeCliLine, type ClaudeCliMessage } from "../../src/model/claude-code/protocol.ts";
import {
  ClaudeStepMapper,
  stripSingleCodeFence,
  toFinishReason,
  toLanguageModelUsage,
} from "../../src/model/claude-code/stream-mapper.ts";

function feed(lines: unknown[], options: ConstructorParameters<typeof ClaudeStepMapper>[0] = {}) {
  const mapper = new ClaudeStepMapper(options);
  const parts = lines.flatMap((line) =>
    mapper.map(parseClaudeCliLine(JSON.stringify(line)) as ClaudeCliMessage),
  );
  return { mapper, parts };
}
const stream = (event: unknown, parent: string | null = null) => ({
  type: "stream_event",
  parent_tool_use_id: parent,
  event,
});
const msgStart = stream({ type: "message_start" });
const msgStop = stream({ type: "message_stop" });
const delta = (stopReason: string, usage = {}) =>
  stream({ type: "message_delta", delta: { stop_reason: stopReason }, usage });
const blockStart = (index: number, block: unknown) =>
  stream({ type: "content_block_start", index, content_block: block });
const blockDelta = (index: number, d: unknown) =>
  stream({ type: "content_block_delta", index, delta: d });
const blockStop = (index: number) => stream({ type: "content_block_stop", index });
const text = (index: number, ...chunks: string[]) => [
  blockStart(index, { type: "text", text: "" }),
  ...chunks.map((t) => blockDelta(index, { type: "text_delta", text: t })),
  blockStop(index),
];
const toolUse = (index: number, id: string, name: string, input: unknown) => [
  blockStart(index, { type: "tool_use", id, name, input: {} }),
  blockDelta(index, { type: "input_json_delta", partial_json: JSON.stringify(input).slice(0, 4) }),
  blockDelta(index, { type: "input_json_delta", partial_json: JSON.stringify(input).slice(4) }),
  {
    type: "assistant",
    parent_tool_use_id: null,
    message: { id: "m", content: [{ type: "tool_use", id, name, input }] },
  },
  blockStop(index),
];
const types = (parts: { type: string }[]) => parts.map((p) => p.type);

test("纯文本消息：流式文本，result 到达时结束步骤", () => {
  const { parts, mapper } = feed([
    { type: "system", subtype: "init", session_id: "s1", model: "claude-x" },
    msgStart,
    ...text(0, "Hel", "lo"),
    delta("end_turn", { output_tokens: 5 }),
    msgStop,
  ]);
  assert.deepEqual(types(parts), [
    "response-metadata",
    "text-start",
    "text-delta",
    "text-delta",
    "text-end",
  ]);
  assert.equal(mapper.stepComplete, false, "没有工具调用时要等 result 才算结束");
  mapper.map(
    parseClaudeCliLine(
      JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "s1" }),
    ) as ClaudeCliMessage,
  );
  assert.equal(mapper.stepComplete, true);
  assert.equal(mapper.endedWithToolCalls, false);
});

test("含工具调用的消息在 message_stop 处结束步骤；工具入参流式输出并给出完整 tool-call", () => {
  const { parts, mapper } = feed(
    [
      msgStart,
      ...text(0, "Running."),
      ...toolUse(1, "toolu_1", "Write", { file_path: "/w/a.txt", content: "hi" }),
      delta("tool_use", { input_tokens: 7, output_tokens: 3 }),
      msgStop,
    ],
    { requestToolNames: new Set(["Write"]) },
  );
  assert.deepEqual(types(parts), [
    "text-start",
    "text-delta",
    "text-end",
    "tool-input-start",
    "tool-input-delta",
    "tool-input-delta",
    "tool-input-end",
    "tool-call",
  ]);
  const call = parts.find((p) => p.type === "tool-call") as {
    toolCallId: string;
    toolName: string;
    input: string;
    providerExecuted: boolean;
    dynamic: boolean;
  };
  assert.equal(call.toolCallId, "toolu_1");
  assert.equal(call.toolName, "Write");
  assert.deepEqual(JSON.parse(call.input), { file_path: "/w/a.txt", content: "hi" });
  assert.equal(call.providerExecuted, true);
  assert.equal(call.dynamic, false, "Kaguya 本次请求提供了 Write 工具，按原生校验");
  assert.equal(mapper.stepComplete, true);
  assert.equal(mapper.endedWithToolCalls, true);
  assert.deepEqual(mapper.usage, { input_tokens: 7, output_tokens: 3 });
  assert.equal(toFinishReason({ toolCalls: true, result: undefined }).unified, "tool-calls");
});

test("Kaguya 本次请求没提供的工具名标记为 dynamic，避免被 AI SDK 的本地校验拦掉", () => {
  const { parts } = feed([
    msgStart,
    ...toolUse(0, "t9", "NotebookEdit", { notebook_path: "/n.ipynb" }),
    delta("tool_use"),
    msgStop,
  ]);
  const call = parts.find((p) => p.type === "tool-call") as { toolName: string; dynamic: boolean };
  assert.equal(call.toolName, "NotebookEdit");
  assert.equal(call.dynamic, true);
});

test("入参对不上原生 schema 的原生工具名：降级为未知工具而不是被本地校验判为非法", () => {
  const { parts } = feed(
    [msgStart, ...toolUse(0, "t1", "Write", { file_path: 123 }), delta("tool_use"), msgStop],
    { requestToolNames: new Set(["Write"]) },
  );
  const call = parts.find((p) => p.type === "tool-call") as { toolName: string; dynamic: boolean };
  assert.equal(
    call.toolName,
    "ClaudeWrite",
    "入参不合法时必须换名，否则 AI SDK 会按 Write 的 schema 把调用判为非法",
  );
  assert.equal(call.dynamic, true);
});

test("thinking 作为原生 reasoning 片段下发", () => {
  const { parts } = feed([
    msgStart,
    blockStart(0, { type: "thinking", thinking: "" }),
    blockDelta(0, { type: "thinking_delta", thinking: "hmm" }),
    blockStop(0),
    ...text(1, "Answer."),
  ]);
  assert.deepEqual(types(parts), [
    "reasoning-start",
    "reasoning-delta",
    "reasoning-end",
    "text-start",
    "text-delta",
    "text-end",
  ]);
  const ids = parts
    .filter((p) => p.type === "reasoning-start" || p.type === "text-start")
    .map((p) => (p as { id: string }).id);
  assert.equal(new Set(ids).size, 2);
});

test("Claude 内部元工具（ToolSearch）不转发，也不会让步骤提前结束", () => {
  const { parts, mapper } = feed([
    msgStart,
    ...toolUse(0, "ts1", "ToolSearch", { query: "x" }),
    delta("tool_use"),
    msgStop,
  ]);
  assert.deepEqual(types(parts), []);
  assert.equal(
    mapper.stepComplete,
    false,
    "只有隐藏工具的消息不能结束步骤，否则会被当成「没有工具调用的最终回复」",
  );
});

test("子 agent 内部活动不展示", () => {
  const { parts } = feed([
    stream({ type: "message_start" }, "task-1"),
    stream(
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      "task-1",
    ),
    {
      type: "assistant",
      parent_tool_use_id: "task-1",
      message: { id: "m", content: [{ type: "tool_use", id: "x", name: "Read", input: {} }] },
    },
  ]);
  assert.deepEqual(parts, []);
});

test("用量按消息累加；记录 assistant 结构化错误", () => {
  const { mapper } = feed([
    msgStart,
    delta("end_turn", { input_tokens: 10, output_tokens: 5 }),
    msgStop,
    msgStart,
    delta("end_turn", { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 100 }),
    msgStop,
    { type: "assistant", error: "authentication_failed", message: { id: "m", content: [] } },
  ]);
  assert.deepEqual(mapper.usage, {
    input_tokens: 11,
    output_tokens: 7,
    cache_read_input_tokens: 100,
  });
  assert.equal(mapper.assistantError, "authentication_failed");
});

test("usage 与结束原因映射", () => {
  const usage = toLanguageModelUsage({
    input_tokens: 10,
    output_tokens: 5,
    cache_read_input_tokens: 100,
    cache_creation_input_tokens: 20,
  });
  assert.equal(usage.inputTokens.total, 130);
  assert.equal(usage.inputTokens.noCache, 10);
  assert.equal(usage.outputTokens.total, 5);
  assert.equal(toLanguageModelUsage(undefined).inputTokens.total, undefined);
  const mk = (patch: object) => ({ kind: "result" as const, isError: false, ...patch });
  assert.equal(
    toFinishReason({ toolCalls: false, result: mk({ stopReason: "end_turn" }) }).unified,
    "stop",
  );
  assert.equal(
    toFinishReason({ toolCalls: false, result: mk({ stopReason: "max_tokens" }) }).unified,
    "length",
  );
  assert.equal(
    toFinishReason({ toolCalls: false, result: mk({ isError: true }) }).unified,
    "error",
  );
  assert.equal(toFinishReason({ toolCalls: false, result: undefined }).unified, "error");
});

test("缓冲模式（一次性请求）：文本攒到结果后一次发出，并剥掉整段围栏", () => {
  const { parts, mapper } = feed([msgStart, ...text(0, "```json\n", '{"title":"X"}', "\n```")], {
    bufferText: true,
  });
  assert.deepEqual(parts, []);
  const done = mapper.map(
    parseClaudeCliLine(
      JSON.stringify({ type: "result", subtype: "success", is_error: false }),
    ) as ClaudeCliMessage,
  );
  assert.deepEqual(types(done), ["text-start", "text-delta", "text-end"]);
  assert.equal((done[1] as { delta: string }).delta, '{"title":"X"}');
});

test("只剥「整段就是一个围栏」的输出", () => {
  assert.equal(stripSingleCodeFence('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripSingleCodeFence("  ```\nplain\n```  \n"), "plain");
  assert.equal(stripSingleCodeFence("````md\n```js\nx\n```\n````"), "```js\nx\n```");
  assert.equal(stripSingleCodeFence('说明\n```json\n{"a":1}\n```'), '说明\n```json\n{"a":1}\n```');
  assert.equal(stripSingleCodeFence('{"a":1}'), '{"a":1}');
});
