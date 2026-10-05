// 真实 claude 的端到端验证。会消耗订阅额度，默认跳过；设置 CLAUDE_CODE_LIVE_TEST=1 才运行。
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import type { PermissionBrokerPort } from "@zcode/contracts";
import { findClaudeSessionFile } from "@zcode/shared/node";
import { ClaudeCodeLanguageModel } from "../../src/model/claude-code/language-model.ts";

const live = process.env.CLAUDE_CODE_LIVE_TEST === "1";
let workDir: string;
const sessionIds: string[] = [];

before(async () => {
  workDir = await mkdtemp(join(tmpdir(), "claude-live-"));
});
after(async () => {
  // 清理本测试在真实 ~/.claude 下创建的会话文件
  for (const id of sessionIds) {
    const file = await findClaudeSessionFile(id, { cwd: workDir });
    if (file) await rm(file, { force: true });
  }
  await rm(workDir, { recursive: true, force: true });
});

function model(broker?: PermissionBrokerPort) {
  return new ClaudeCodeLanguageModel({
    modelId: "haiku",
    env: process.env,
    config: { workingDirectory: workDir, permissionBroker: broker },
  });
}
function options(prompt: LanguageModelV3Prompt, sessionUuid: string): LanguageModelV3CallOptions {
  return {
    prompt,
    headers: { "x-zcode-session-type": "main" },
    providerOptions: {
      claudeCode: { sessionId: `sess_${sessionUuid}`, traceId: "t", turnId: "turn_1" },
    },
  };
}
const user = (text: string) => ({
  role: "user" as const,
  content: [{ type: "text" as const, text }],
});
async function run(m: ClaudeCodeLanguageModel, callOptions: LanguageModelV3CallOptions) {
  const { stream } = await m.doStream(callOptions);
  const parts: LanguageModelV3StreamPart[] = [];
  for await (const part of stream) parts.push(part);
  const error = parts.find((p) => p.type === "error") as { error: unknown } | undefined;
  if (error) throw error.error;
  return parts;
}
const text = (parts: LanguageModelV3StreamPart[]) =>
  parts
    .filter((p) => p.type === "text-delta")
    .map((p) => (p as { delta: string }).delta)
    .join("");

test(
  "真实 claude：流式回复 → 跨调用续接记忆 → jsonl 可被读回",
  { skip: !live, timeout: 180_000 },
  async () => {
    const sessionUuid = randomUUID();
    sessionIds.push(sessionUuid);
    const first = await run(
      model(),
      options([user("Remember the codeword pineapple-42. Reply with just OK.")], sessionUuid),
    );
    assert.ok(
      first.some((p) => p.type === "text-delta"),
      "应有流式文本增量",
    );
    assert.equal((first.at(-1) as { type: string }).type, "finish");

    // Kaguya 每次都会把完整历史发来；只有 jsonl 存在才会走 --resume，让 claude 自己带着记忆回答。
    const history: LanguageModelV3Prompt = [
      user("Remember the codeword pineapple-42. Reply with just OK."),
      { role: "assistant", content: [{ type: "text", text: "OK" }] },
      user("What was the codeword? Reply with the codeword only."),
    ];
    const second = await run(model(), options(history, sessionUuid));
    assert.match(text(second), /pineapple-42/);

    const file = await findClaudeSessionFile(sessionUuid, { cwd: workDir });
    assert.ok(file, "claude 应把会话写进 ~/.claude/projects");
    const lines = (await readFile(file!, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { type?: string; message?: { content?: unknown } });
    const mentions = (type: string) =>
      lines.some(
        (l) => l.type === type && JSON.stringify(l.message?.content).includes("pineapple-42"),
      );
    assert.ok(mentions("user") && mentions("assistant"), "jsonl 里应记录了双方的对话");
  },
);

test(
  "真实 claude：用户放行 → 文件真的被创建；用户拒绝 → 文件不会被创建",
  { skip: !live, timeout: 240_000 },
  async () => {
    const exists = (name: string) =>
      access(join(workDir, name)).then(
        () => true,
        () => false,
      );
    for (const [decision, file] of [
      ["allow", "live-allow.txt"],
      ["deny", "live-deny.txt"],
    ] as const) {
      const asked: string[] = [];
      const broker: PermissionBrokerPort = {
        async requestPermission(request) {
          asked.push(request.toolName);
          return decision === "allow"
            ? { decision: "allow" }
            : { decision: "deny", reason: "denied by test" };
        },
      };
      const sessionUuid = randomUUID();
      sessionIds.push(sessionUuid);
      const parts = await run(
        model(broker),
        options(
          [user(`Use the Bash tool to run exactly: touch ${file} . Then reply done.`)],
          sessionUuid,
        ),
      );
      assert.ok(asked.includes("Bash"), `${decision}: 应该向用户确认 Bash 权限`);
      assert.equal(await exists(file), decision === "allow", `${decision}: 文件是否存在`);
      assert.match(text(parts), new RegExp(`▸ \\*\\*Bash\\*\\* \`touch ${file}`));
    }
  },
);
