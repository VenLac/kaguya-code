#!/usr/bin/env node
// 测试用假 claude：按 FAKE_CLAUDE_SCENARIO 回放 stream-json 协议，并把收到的 argv / 首条 stdin 写进 FAKE_CLAUDE_LOG。
import { appendFileSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const scenario = process.env.FAKE_CLAUDE_SCENARIO ?? "text";
const log = process.env.FAKE_CLAUDE_LOG;
const SESSION = "11111111-2222-4333-8444-555555555555";
const out = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const record = (value) => log && appendFileSync(log, `${JSON.stringify(value)}\n`);
const stream = (event) =>
  out({ type: "stream_event", session_id: SESSION, parent_tool_use_id: null, event });
const usage = {
  input_tokens: 10,
  output_tokens: 5,
  cache_read_input_tokens: 100,
  cache_creation_input_tokens: 20,
};
const result = (extra = {}) =>
  out({
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: SESSION,
    stop_reason: "end_turn",
    usage,
    total_cost_usd: 0.01,
    ...extra,
  });
const textBlock = (index, chunks) => {
  stream({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
  for (const text of chunks)
    stream({ type: "content_block_delta", index, delta: { type: "text_delta", text } });
  stream({ type: "content_block_stop", index });
};

record({ argv: process.argv.slice(2), env: { CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR } });
// 临时的 system prompt 文件在请求结束后会被删除，这里趁它还在把内容记下来供断言。
const systemFileIndex = process.argv.indexOf("--system-prompt-file");
if (systemFileIndex !== -1) {
  const path = process.argv[systemFileIndex + 1];
  record({ systemPromptFile: { path, content: readFileSync(path, "utf8") } });
}
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
const waiters = [];
const inbox = [];
lines.on("line", (line) => {
  const message = JSON.parse(line);
  record({ stdin: message });
  const waiter = waiters.shift();
  if (waiter) waiter(message);
  else inbox.push(message);
});
const next = () =>
  inbox.length ? Promise.resolve(inbox.shift()) : new Promise((resolve) => waiters.push(resolve));

await next(); // 首条用户消息
out({ type: "system", subtype: "init", session_id: SESSION, model: "claude-test-1" });

if (scenario === "text") {
  stream({ type: "message_start" });
  textBlock(0, ["Hel", "lo"]);
  out({
    type: "assistant",
    session_id: SESSION,
    parent_tool_use_id: null,
    message: { id: "m1", content: [{ type: "text", text: "Hello" }] },
  });
  result();
} else if (scenario === "fenced") {
  stream({ type: "message_start" });
  textBlock(0, ["```json\n", '{"title":"X"}', "\n```"]);
  result();
} else if (scenario === "tool") {
  stream({ type: "message_start" });
  textBlock(0, ["Running."]);
  out({
    type: "assistant",
    session_id: SESSION,
    parent_tool_use_id: null,
    message: {
      id: "m1",
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: process.env.FAKE_CLAUDE_TOOL ?? "Bash",
          input: { command: "touch x" },
        },
      ],
    },
  });
  out({
    type: "control_request",
    request_id: "req-1",
    request: {
      subtype: "can_use_tool",
      tool_name: process.env.FAKE_CLAUDE_TOOL ?? "Bash",
      tool_use_id: "toolu_1",
      input: { command: "touch x" },
      description: "Create x",
    },
  });
  const response = await next();
  const answer = response.response?.response;
  record({ permissionAnswer: answer });
  out({
    type: "user",
    session_id: SESSION,
    parent_tool_use_id: null,
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: answer?.behavior === "allow" ? "ok" : String(answer?.message),
          is_error: answer?.behavior !== "allow",
        },
      ],
    },
  });
  stream({ type: "message_start" });
  textBlock(0, ["Done."]);
  result();
} else if (scenario === "auth") {
  out({
    type: "assistant",
    session_id: SESSION,
    parent_tool_use_id: null,
    error: "authentication_failed",
    message: { id: "m1", content: [{ type: "text", text: "Not logged in" }] },
  });
  result({ subtype: "error", is_error: true, result: "Not logged in · Please run /login" });
  process.exitCode = 1;
} else if (scenario === "failure") {
  result({ subtype: "error_during_execution", is_error: true, result: "boom" });
  process.exitCode = 1;
} else if (scenario === "crash") {
  process.stderr.write("fatal: something broke\n");
  process.exit(3);
} else if (scenario === "hang") {
  process.on("SIGTERM", () => process.exit(143));
  setInterval(() => undefined, 1000);
  await new Promise(() => undefined);
}
process.stdin.pause();
