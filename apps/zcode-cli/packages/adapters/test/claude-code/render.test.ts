import assert from "node:assert/strict";
import { test } from "node:test";
import {
  renderToolResult,
  renderToolUse,
  summarizeToolInput,
  toolResultText,
} from "../../src/model/claude-code/render.ts";

test("工具入参摘要优先取最能说明意图的字段并截断", () => {
  assert.equal(summarizeToolInput({ command: "ls  -la\n/tmp", description: "x" }), "ls -la /tmp");
  assert.equal(summarizeToolInput({ file_path: "/a/b.ts" }), "/a/b.ts");
  assert.equal(summarizeToolInput({ other: 1 }), '{"other":1}');
  assert.ok(summarizeToolInput({ command: "x".repeat(1000) }).length <= 401);
  assert.equal(summarizeToolInput(undefined), "");
});

test("渲染工具调用与结果为 markdown 文本", () => {
  assert.equal(renderToolUse("Bash", { command: "echo `hi`" }), "\n\n▸ **Bash** `echo 'hi'`\n");
  assert.equal(renderToolResult("done", false), "\n```\ndone\n```\n");
  assert.match(renderToolResult("bad", true), /（失败）/);
  assert.equal(renderToolResult("", false), "");
  assert.match(renderToolResult("", true), /执行失败/);
});

test("输出里含代码围栏时用更长的围栏，避免提前结束代码块", () => {
  const rendered = renderToolResult("a\n```\nb", false);
  assert.match(rendered, /^\n````\na\n```\nb\n````\n$/);
});

test("tool_result content 既可为字符串也可为 text 块数组", () => {
  assert.equal(toolResultText("x"), "x");
  assert.equal(
    toolResultText([{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }]),
    "a\nb",
  );
  assert.equal(toolResultText(undefined), "");
});

test("超长输出被截断", () => {
  const rendered = renderToolResult("y".repeat(5000), false);
  assert.ok(rendered.length < 2200);
  assert.ok(rendered.includes("…"));
});
