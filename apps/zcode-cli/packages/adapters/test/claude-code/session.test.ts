import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { claudeSessionIdFor, planClaudeSession } from "../../src/model/claude-code/session.ts";

const UUID = "0198f2a4-7b1c-7c3e-9a55-3f0d2b6e8c11";

test("Kaguya 会话 id 若本身是 UUID 则直接沿用（导入的 Claude 会话续聊落到同一份 jsonl）", () => {
  assert.equal(claudeSessionIdFor(`sess_${UUID}`), UUID);
  assert.equal(claudeSessionIdFor(UUID.toUpperCase()), UUID);
});

test("非 UUID 的 id 稳定派生为合法 UUID（v5），且互不相同", () => {
  const a = claudeSessionIdFor("sess_abc");
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(a, claudeSessionIdFor("sess_abc"));
  assert.notEqual(a, claudeSessionIdFor("sess_abd"));
});

test("规划：辅助请求一次性；主回合按 jsonl 是否存在决定 new / resume", async () => {
  const config = await mkdtemp(join(tmpdir(), "claude-cfg-"));
  const cwd = "/work/space.one";
  const env = { CLAUDE_CONFIG_DIR: config };
  try {
    const base = { kaguyaSessionId: `sess_${UUID}`, cwd, env, hasHistory: false };

    assert.deepEqual(await planClaudeSession({ ...base, sessionType: "other" }), {
      session: { kind: "ephemeral" },
      promptMode: "ephemeral",
    });
    assert.deepEqual(
      await planClaudeSession({ ...base, sessionType: "main", kaguyaSessionId: undefined }),
      { session: { kind: "ephemeral" }, promptMode: "ephemeral" },
    );

    assert.deepEqual(await planClaudeSession({ ...base, sessionType: "main" }), {
      session: { kind: "new", sessionId: UUID },
      promptMode: "resume",
    });
    assert.deepEqual(await planClaudeSession({ ...base, sessionType: "main", hasHistory: true }), {
      session: { kind: "new", sessionId: UUID },
      promptMode: "seed",
    });

    const dir = join(config, "projects", "-work-space-one");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${UUID}.jsonl`), "{}\n");
    assert.deepEqual(await planClaudeSession({ ...base, sessionType: "main", hasHistory: true }), {
      session: { kind: "resume", sessionId: UUID },
      promptMode: "resume",
    });
  } finally {
    await rm(config, { recursive: true, force: true });
  }
});
