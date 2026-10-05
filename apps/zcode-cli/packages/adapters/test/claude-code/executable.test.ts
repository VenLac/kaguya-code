import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveClaudeExecutable } from "@zcode/shared/node";

const existing =
  (...paths: string[]) =>
  async (candidate: string) =>
    paths.includes(candidate);

test("PATH 中按顺序查找", async () => {
  const found = await resolveClaudeExecutable({
    env: { PATH: "/a:/b" },
    platform: "linux",
    homeDir: "/home/u",
    isExecutable: existing("/b/claude", "/home/u/.local/bin/claude"),
  });
  assert.equal(found, "/b/claude");
});

test("PATH 找不到时回退到常见安装目录", async () => {
  const found = await resolveClaudeExecutable({
    env: { PATH: "/a" },
    platform: "linux",
    homeDir: "/home/u",
    isExecutable: existing("/home/u/.local/bin/claude"),
  });
  assert.equal(found, "/home/u/.local/bin/claude");
});

test("显式路径优先，且不存在时不再回退（让用户明确知道配置错了）", async () => {
  assert.equal(
    await resolveClaudeExecutable({
      explicitPath: "/x/claude",
      env: { PATH: "/a" },
      platform: "linux",
      isExecutable: existing("/x/claude", "/a/claude"),
    }),
    "/x/claude",
  );
  assert.equal(
    await resolveClaudeExecutable({
      explicitPath: "/missing",
      env: { PATH: "/a" },
      platform: "linux",
      isExecutable: existing("/a/claude"),
    }),
    undefined,
  );
});

test("Windows 按 PATHEXT 展开并识别大小写不同的 Path 变量", async () => {
  const found = await resolveClaudeExecutable({
    env: { Path: "C:\\bin", PATHEXT: ".EXE;.CMD" },
    platform: "win32",
    homeDir: "C:\\Users\\u",
    isExecutable: async (candidate) => candidate.toLowerCase().endsWith("claude.cmd"),
  });
  assert.ok(found?.toLowerCase().endsWith("claude.cmd"));
});

test("找不到返回 undefined", async () => {
  assert.equal(
    await resolveClaudeExecutable({
      env: { PATH: "/a" },
      platform: "linux",
      homeDir: "/h",
      isExecutable: existing(),
    }),
    undefined,
  );
});
