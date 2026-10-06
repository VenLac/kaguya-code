import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runClaudeCli } from "../../src/model/claude-code/process.ts";

const noPermission = async () => ({ behavior: "deny" as const });

async function spawnFailure(executable: string, cwd: string): Promise<Record<string, unknown>> {
  try {
    for await (const _ of runClaudeCli({
      executable,
      args: [],
      cwd,
      env: {},
      content: [{ type: "text", text: "hi" }],
      onPermissionRequest: noPermission,
    })) {
      // 不应产出任何消息
    }
  } catch (error) {
    return error as Record<string, unknown>;
  }
  assert.fail("应当抛出 spawn 失败");
}

test("spawn 失败保留系统错误码、cwd 与原始 cause，不再只有「无法启动」", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claude-spawn-"));
  try {
    const error = await spawnFailure(join(dir, "no-such-claude"), dir);
    assert.equal(error.providerCode, "CLAUDE_SPAWN_FAILED");
    assert.match(String(error.message), /ENOENT/);
    assert.match(String(error.message), new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const details = error.responseBodySummary as Record<string, unknown>;
    assert.equal(details.errno, "ENOENT");
    assert.match(String(details.syscall), /^spawn/);
    assert.equal(details.cwd, dir);
    assert.equal((error.cause as { code?: string }).code, "ENOENT");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
