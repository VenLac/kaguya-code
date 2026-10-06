#!/usr/bin/env node
// 测试用假 claude：按 FAKE_CLAUDE_SCENARIO 回放 stream-json 协议，并把收到的 argv / 首条 stdin 写进 FAKE_CLAUDE_LOG。
import { appendFileSync, readFileSync, readdirSync, readlinkSync, lstatSync } from "node:fs";
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
const toolBlock = (index, id, name, input) => {
  stream({
    type: "content_block_start",
    index,
    content_block: { type: "tool_use", id, name, input: {} },
  });
  const json = JSON.stringify(input);
  stream({
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json: json.slice(0, 5) },
  });
  stream({
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json: json.slice(5) },
  });
  out({
    type: "assistant",
    session_id: SESSION,
    parent_tool_use_id: null,
    message: { id: `m-${id}`, content: [{ type: "tool_use", id, name, input }] },
  });
  stream({ type: "content_block_stop", index });
};
const textBlock = (index, chunks) => {
  stream({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
  for (const text of chunks)
    stream({ type: "content_block_delta", index, delta: { type: "text_delta", text } });
  stream({ type: "content_block_stop", index });
};

record({ argv: process.argv.slice(2), env: { CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR } });
// 临时插件目录在 run 结束后会被删除，这里趁它还在把结构记下来供断言。
const pluginDirIndex = process.argv.indexOf("--plugin-dir");
if (pluginDirIndex !== -1) {
  const root = process.argv[pluginDirIndex + 1];
  const skills = Object.fromEntries(
    readdirSync(`${root}/skills`).map((name) => {
      const path = `${root}/skills/${name}`;
      return [name, lstatSync(path).isSymbolicLink() ? readlinkSync(path) : "(copied)"];
    }),
  );
  record({
    pluginDir: {
      root,
      manifest: JSON.parse(readFileSync(`${root}/.claude-plugin/plugin.json`, "utf8")),
      skills,
    },
  });
}
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
  // 两条 assistant 消息：第 1 条含文本 + 工具调用（需要确认），第 2 条是最终文本。
  const toolName = process.env.FAKE_CLAUDE_TOOL ?? "Write";
  const toolInput = { file_path: "/w/a.txt", content: "hello world" };
  const toolResultFor = {
    Write: {
      type: "create",
      filePath: "/w/a.txt",
      content: "hello world",
      structuredPatch: [],
      originalFile: null,
      userModified: false,
    },
    Bash: { stdout: "ok", stderr: "", interrupted: false, isImage: false },
    Read: {
      type: "text",
      file: {
        filePath: "/w/a.txt",
        content: "hello world",
        numLines: 1,
        startLine: 1,
        totalLines: 1,
      },
    },
  };
  stream({ type: "message_start" });
  textBlock(0, ["Running."]);
  toolBlock(1, "toolu_1", toolName, toolName === "Bash" ? { command: "ls" } : toolInput);
  stream({
    type: "message_delta",
    delta: { stop_reason: "tool_use" },
    usage: { input_tokens: 7, output_tokens: 3 },
  });
  stream({ type: "message_stop" });
  if (toolName !== "Read") {
    out({
      type: "control_request",
      request_id: "req-1",
      request: {
        subtype: "can_use_tool",
        tool_name: toolName,
        tool_use_id: "toolu_1",
        input: toolInput,
        description: "Do it",
      },
    });
  }
  const response = toolName === "Read" ? undefined : await next();
  const answer = response?.response?.response;
  record({ permissionAnswer: answer ?? null });
  const denied = answer && answer.behavior !== "allow";
  out({
    type: "user",
    session_id: SESSION,
    parent_tool_use_id: null,
    tool_use_result: denied ? undefined : toolResultFor[toolName],
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: denied ? String(answer.message) : "result-text",
          is_error: Boolean(denied),
        },
      ],
    },
  });
  stream({ type: "message_start" });
  textBlock(0, ["Done."]);
  stream({
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { input_tokens: 2, output_tokens: 1 },
  });
  stream({ type: "message_stop" });
  result();
} else if (scenario === "thinking") {
  stream({ type: "message_start" });
  stream({
    type: "content_block_start",
    index: 0,
    content_block: { type: "thinking", thinking: "" },
  });
  stream({
    type: "content_block_delta",
    index: 0,
    delta: { type: "thinking_delta", thinking: "hmm" },
  });
  stream({ type: "content_block_stop", index: 0 });
  textBlock(1, ["Answer."]);
  stream({ type: "message_stop" });
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
