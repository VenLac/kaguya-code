import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClaudeCliLine } from "../../src/model/claude-code/protocol.ts";

test("解析 init / result / 权限请求", () => {
  assert.deepEqual(
    parseClaudeCliLine('{"type":"system","subtype":"init","session_id":"s1","model":"m"}'),
    { kind: "init", sessionId: "s1", model: "m" },
  );
  const result = parseClaudeCliLine(
    '{"type":"result","subtype":"success","is_error":false,"session_id":"s1","stop_reason":"end_turn","total_cost_usd":0.5,"usage":{"input_tokens":1,"output_tokens":2}}',
  );
  assert.equal(result?.kind, "result");
  assert.ok(
    result?.kind === "result" && result.costUsd === 0.5 && result.usage?.output_tokens === 2,
  );

  const permission = parseClaudeCliLine(
    '{"type":"control_request","request_id":"r1","request":{"subtype":"can_use_tool","tool_name":"Bash","tool_use_id":"t1","input":{"command":"ls"},"description":"d"}}',
  );
  assert.deepEqual(permission, {
    kind: "permission_request",
    request: {
      requestId: "r1",
      toolName: "Bash",
      toolUseId: "t1",
      input: { command: "ls" },
      description: "d",
      displayName: undefined,
    },
  });
});

test("解析流式文本增量与 assistant/user 内容块", () => {
  const start = parseClaudeCliLine(
    '{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}}',
  );
  assert.deepEqual(start?.kind === "stream_event" && start.event, {
    type: "content_block_start",
    index: 1,
    block: { type: "text", text: "" },
  });
  const delta = parseClaudeCliLine(
    '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"hi"}}}',
  );
  assert.deepEqual(delta?.kind === "stream_event" && delta.event, {
    type: "content_block_delta",
    index: 1,
    delta: { type: "text_delta", text: "hi" },
  });

  const assistant = parseClaudeCliLine(
    '{"type":"assistant","error":"authentication_failed","message":{"content":[{"type":"tool_use","id":"t","name":"Bash","input":{"a":1}}]}}',
  );
  assert.ok(assistant?.kind === "assistant");
  assert.equal(assistant.error, "authentication_failed");
  assert.deepEqual(assistant.blocks, [
    { type: "tool_use", id: "t", name: "Bash", input: { a: 1 } },
  ]);

  const user = parseClaudeCliLine(
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t","content":"ok","is_error":false}]}}',
  );
  assert.ok(user?.kind === "user");
  assert.deepEqual(user.blocks, [
    { type: "tool_result", tool_use_id: "t", content: "ok", is_error: false },
  ]);
});

test("子 agent 消息携带 parent_tool_use_id", () => {
  const message = parseClaudeCliLine(
    '{"type":"assistant","parent_tool_use_id":"task-1","message":{"content":[]}}',
  );
  assert.ok(message?.kind === "assistant" && message.parentToolUseId === "task-1");
});

test("格式漂移时容错：未知类型、坏 JSON、空行、缺字段", () => {
  assert.deepEqual(parseClaudeCliLine('{"type":"rate_limit_event"}'), {
    kind: "unknown",
    type: "rate_limit_event",
  });
  assert.deepEqual(parseClaudeCliLine('{"type":"system","subtype":"status"}'), {
    kind: "unknown",
    type: "system/status",
  });
  assert.equal(parseClaudeCliLine("not json"), undefined);
  assert.equal(parseClaudeCliLine("   "), undefined);
  assert.equal(parseClaudeCliLine("[1,2]"), undefined);
  assert.deepEqual(
    parseClaudeCliLine('{"type":"control_request","request_id":"r","request":{"subtype":"other"}}'),
    { kind: "unknown", type: "control_request/other" },
  );
  // tool_use 缺 id 时降级为 other，不抛错
  const odd = parseClaudeCliLine(
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"x"}]}}',
  );
  assert.ok(odd?.kind === "assistant" && odd.blocks[0]?.type === "other");
});
