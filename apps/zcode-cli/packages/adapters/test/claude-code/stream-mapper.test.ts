import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClaudeCliLine, type ClaudeCliMessage } from "../../src/model/claude-code/protocol.ts";
import {
  ClaudeStreamMapper,
  stripSingleCodeFence,
  toFinishReason,
  toLanguageModelUsage,
} from "../../src/model/claude-code/stream-mapper.ts";

function feed(lines: unknown[]) {
  const mapper = new ClaudeStreamMapper();
  const parts = lines.flatMap((line) => {
    const message = parseClaudeCliLine(JSON.stringify(line)) as ClaudeCliMessage;
    return mapper.map(message);
  });
  return { mapper, parts };
}
const stream = (event: unknown, parent: string | null = null) => ({
  type: "stream_event",
  parent_tool_use_id: parent,
  event,
});
const textStart = (index: number) =>
  stream({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
const textDelta = (index: number, text: string) =>
  stream({ type: "content_block_delta", index, delta: { type: "text_delta", text } });
const stop = (index: number) => stream({ type: "content_block_stop", index });

test("流式正文：start → delta → end，id 按消息与块序号区分", () => {
  const { parts, mapper } = feed([
    { type: "system", subtype: "init", session_id: "s1", model: "claude-x" },
    stream({ type: "message_start" }),
    textStart(0),
    textDelta(0, "Hel"),
    textDelta(0, "lo"),
    stop(0),
    stream({ type: "message_start" }),
    textStart(0),
    textDelta(0, "again"),
    stop(0),
  ]);
  assert.deepEqual(
    parts.map((p) => p.type),
    [
      "response-metadata",
      "text-start",
      "text-delta",
      "text-delta",
      "text-end",
      "text-start",
      "text-delta",
      "text-end",
    ],
  );
  const ids = parts.filter((p) => p.type === "text-start").map((p) => (p as { id: string }).id);
  assert.equal(new Set(ids).size, 2, "同一个 block index 在不同消息里必须是不同的 part id");
  assert.equal(mapper.sessionId, "s1");
  assert.equal(mapper.producedText, true);
});

test("thinking 不下发（避免无签名的 reasoning 进入历史后跨 provider 回放）", () => {
  const { parts } = feed([
    stream({ type: "message_start" }),
    stream({
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "" },
    }),
    stream({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "hmm" },
    }),
    stream({ type: "content_block_stop", index: 0 }),
  ]);
  assert.deepEqual(parts, []);
});

test("工具活动渲染成独立文本片段，且同一 tool_use 只渲染一次", () => {
  const toolUse = {
    type: "assistant",
    parent_tool_use_id: null,
    message: {
      id: "m",
      content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }],
    },
  };
  const { parts } = feed([
    toolUse,
    toolUse, // CLI 可能重复投递快照
    {
      type: "user",
      parent_tool_use_id: null,
      message: {
        content: [{ type: "tool_result", tool_use_id: "t1", content: "a.txt", is_error: false }],
      },
    },
  ]);
  const deltas = parts
    .filter((p) => p.type === "text-delta")
    .map((p) => (p as { delta: string }).delta);
  assert.equal(deltas.length, 2);
  assert.match(deltas[0]!, /▸ \*\*Bash\*\* `ls`/);
  assert.match(deltas[1]!, /a\.txt/);
  const ids = parts.filter((p) => p.type === "text-start").map((p) => (p as { id: string }).id);
  assert.equal(new Set(ids).size, 2);
});

test("子 agent 内部活动不展示", () => {
  const { parts } = feed([
    stream({ type: "message_start" }, "task-1"),
    textStart(0), // 注意：没有 parent 标记的会被处理；这里带 parent 的应被忽略
    {
      type: "assistant",
      parent_tool_use_id: "task-1",
      message: {
        id: "m",
        content: [{ type: "tool_use", id: "t9", name: "Read", input: { file_path: "/x" } }],
      },
    },
    {
      type: "user",
      parent_tool_use_id: "task-1",
      message: {
        content: [{ type: "tool_result", tool_use_id: "t9", content: "secret", is_error: false }],
      },
    },
  ]);
  // textStart(0) 无 parent，会产生一个 text-start；其余带 parent 的都不产生内容
  assert.deepEqual(
    parts.map((p) => p.type),
    ["text-start"],
  );
});

test("result 会收尾未关闭的文本片段，并记录 assistant 结构化错误", () => {
  const { parts, mapper } = feed([
    stream({ type: "message_start" }),
    textStart(0),
    textDelta(0, "x"),
    { type: "assistant", error: "authentication_failed", message: { id: "m", content: [] } },
    {
      type: "result",
      subtype: "success",
      is_error: false,
      session_id: "s9",
      usage: { input_tokens: 1 },
    },
  ]);
  assert.equal(parts.at(-1)?.type, "text-end");
  assert.equal(mapper.assistantError, "authentication_failed");
  assert.equal(mapper.result?.sessionId, "s9");
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
  assert.equal(usage.inputTokens.cacheRead, 100);
  assert.equal(usage.inputTokens.cacheWrite, 20);
  assert.equal(usage.outputTokens.total, 5);
  assert.equal(toLanguageModelUsage(undefined).inputTokens.total, undefined);

  const mk = (patch: object) => ({ kind: "result" as const, isError: false, ...patch });
  assert.equal(toFinishReason(mk({ stopReason: "end_turn" })).unified, "stop");
  assert.equal(toFinishReason(mk({ stopReason: "max_tokens" })).unified, "length");
  assert.equal(toFinishReason(mk({ isError: true })).unified, "error");
  assert.equal(toFinishReason(undefined).unified, "error");
});

test("缓冲模式：文本攒到结果到达后一次发出，并剥掉整段包裹的围栏", () => {
  const mapper = new ClaudeStreamMapper({ bufferText: true });
  const parts = [
    stream({ type: "message_start" }),
    textStart(0),
    textDelta(0, "```json\n"),
    textDelta(0, '{"title":"X"}'),
    textDelta(0, "\n```"),
    stop(0),
  ].flatMap((line) => mapper.map(parseClaudeCliLine(JSON.stringify(line)) as ClaudeCliMessage));
  assert.deepEqual(parts, [], "结果到达前不应有任何文本片段");
  const done = mapper.map(
    parseClaudeCliLine(
      JSON.stringify({ type: "result", subtype: "success", is_error: false }),
    ) as ClaudeCliMessage,
  );
  assert.deepEqual(
    done.map((p) => p.type),
    ["text-start", "text-delta", "text-end"],
  );
  assert.equal((done[1] as { delta: string }).delta, '{"title":"X"}');
  assert.equal(mapper.producedText, true);
});

test("只剥「整段就是一个围栏」的输出，正文里的代码块与多段内容不动", () => {
  assert.equal(stripSingleCodeFence('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripSingleCodeFence("  ```\nplain\n```  \n"), "plain");
  assert.equal(stripSingleCodeFence("````md\n```js\nx\n```\n````"), "```js\nx\n```");
  assert.equal(stripSingleCodeFence('说明\n```json\n{"a":1}\n```'), '说明\n```json\n{"a":1}\n```');
  assert.equal(stripSingleCodeFence('```json\n{"a":1}\n```\n后记'), '```json\n{"a":1}\n```\n后记');
  assert.equal(stripSingleCodeFence('{"a":1}'), '{"a":1}');
});
