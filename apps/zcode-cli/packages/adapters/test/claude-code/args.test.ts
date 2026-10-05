import assert from "node:assert/strict";
import { test } from "node:test";
import { buildClaudeArgs } from "../../src/model/claude-code/args.ts";

const SESSION = "11111111-2222-4333-8444-555555555555";

test("新建会话固定 session-id，用户内容不进参数", () => {
  const args = buildClaudeArgs({
    model: "sonnet",
    effort: "high",
    session: { kind: "new", sessionId: SESSION },
    tools: "default",
  });
  assert.deepEqual(args.slice(0, 2), ["-p", "--input-format"]);
  assert.ok(args.includes("--permission-prompt-tool"));
  assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2), [
    "--model",
    "sonnet",
  ]);
  assert.deepEqual(args.slice(args.indexOf("--session-id"), args.indexOf("--session-id") + 2), [
    "--session-id",
    SESSION,
  ]);
  assert.ok(
    !args.includes("--resume") &&
      !args.includes("--no-session-persistence") &&
      !args.includes("--tools"),
  );
});

test("续接与一次性会话", () => {
  const resume = buildClaudeArgs({
    session: { kind: "resume", sessionId: SESSION },
    tools: "default",
  });
  assert.deepEqual(resume.slice(resume.indexOf("--resume"), resume.indexOf("--resume") + 2), [
    "--resume",
    SESSION,
  ]);
  const ephemeral = buildClaudeArgs({ session: { kind: "ephemeral" }, tools: "none" });
  assert.ok(ephemeral.includes("--no-session-persistence"));
  assert.deepEqual(
    ephemeral.slice(ephemeral.indexOf("--tools"), ephemeral.indexOf("--tools") + 2),
    ["--tools", ""],
  );
});

test("拒绝不安全的参数值（防止经 cmd.exe 注入）", () => {
  assert.throws(
    () =>
      buildClaudeArgs({ model: "sonnet & calc", session: { kind: "ephemeral" }, tools: "none" }),
    /Unsafe/,
  );
  assert.throws(
    () =>
      buildClaudeArgs({ session: { kind: "resume", sessionId: "x; rm -rf" }, tools: "default" }),
    /Unsafe/,
  );
  assert.throws(
    () => buildClaudeArgs({ effort: 'high"', session: { kind: "ephemeral" }, tools: "none" }),
    /Unsafe/,
  );
  // 合法的带方括号模型名放行
  assert.doesNotThrow(() =>
    buildClaudeArgs({ model: "opus[1m]", session: { kind: "ephemeral" }, tools: "none" }),
  );
});

test("一次性请求的 system 提示经文件传入；路径允许空格但拒绝破坏引号/被 cmd.exe 解释的字符", () => {
  const args = buildClaudeArgs({
    session: { kind: "ephemeral" },
    tools: "none",
    systemPromptFile: "/tmp/with space/system-prompt.txt",
  });
  assert.deepEqual(
    args.slice(args.indexOf("--system-prompt-file"), args.indexOf("--system-prompt-file") + 2),
    ["--system-prompt-file", "/tmp/with space/system-prompt.txt"],
  );
  for (const bad of ['/tmp/a"b', "/tmp/a&b", "/tmp/a%PATH%", "/tmp/a\nb"]) {
    assert.throws(
      () =>
        buildClaudeArgs({ session: { kind: "ephemeral" }, tools: "none", systemPromptFile: bad }),
      /Unsafe path/,
    );
  }
});
