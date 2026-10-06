// 真实 claude 的端到端验证。会消耗订阅额度，默认跳过；设置 CLAUDE_CODE_LIVE_TEST=1 才运行。
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import type { ExternalToolOutcome, PermissionBrokerPort } from "@zcode/contracts";
import { findClaudeSessionFile } from "@zcode/shared/node";
import { ClaudeCodeLanguageModel } from "../../src/model/claude-code/language-model.ts";
import { ClaudeCodeRuntime } from "../../src/model/claude-code/runtime.ts";

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

const user = (text: string) => ({
  role: "user" as const,
  content: [{ type: "text" as const, text }],
});
const tools = ["Write", "Edit", "Bash", "Read"].map((name) => ({
  type: "function" as const,
  name,
  description: "",
  inputSchema: {},
}));

interface TurnResult {
  text: string;
  toolCalls: { name: string; input: unknown }[];
  outcomes: ExternalToolOutcome[];
  steps: number;
}

/** 模拟 Kaguya core 的回合循环：一步 → 执行器认领并等待外部结果 → 带着 tool 消息发起下一步，直到 stop。 */
async function runTurn(
  model: ClaudeCodeLanguageModel,
  runtime: ClaudeCodeRuntime,
  prompt: LanguageModelV3Prompt,
  sessionUuid: string,
): Promise<TurnResult> {
  const result: TurnResult = { text: "", toolCalls: [], outcomes: [], steps: 0 };
  let current = prompt;
  for (let step = 0; step < 12; step += 1) {
    const options: LanguageModelV3CallOptions = {
      prompt: current,
      tools,
      headers: { "x-zcode-session-type": "main" },
      providerOptions: {
        claudeCode: { sessionId: `sess_${sessionUuid}`, traceId: "t", turnId: "turn_1" },
      },
    };
    const { stream } = await model.doStream(options);
    const parts: LanguageModelV3StreamPart[] = [];
    for await (const part of stream) parts.push(part);
    const error = parts.find((p) => p.type === "error") as { error: unknown } | undefined;
    if (error) throw error.error;
    result.steps += 1;
    result.text += parts
      .filter((p) => p.type === "text-delta")
      .map((p) => (p as { delta: string }).delta)
      .join("");
    const calls = parts.filter((p) => p.type === "tool-call") as {
      toolCallId: string;
      toolName: string;
      input: string;
    }[];
    const finish = parts.find((p) => p.type === "finish") as Extract<
      LanguageModelV3StreamPart,
      { type: "finish" }
    >;
    if (finish.finishReason.unified !== "tool-calls") return result;
    const results = [];
    for (const call of calls) {
      result.toolCalls.push({ name: call.toolName, input: JSON.parse(call.input) });
      const claim = runtime.externalTools.claim(call.toolCallId)!;
      claim.markStarted();
      const outcome = await claim.waitForOutcome();
      result.outcomes.push(outcome);
      results.push({
        type: "tool-result" as const,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: {
          type: "text" as const,
          value: outcome.success ? outcome.modelContent : outcome.error,
        },
      });
    }
    current = [
      ...current,
      {
        role: "assistant",
        content: calls.map((c) => ({
          type: "tool-call" as const,
          toolCallId: c.toolCallId,
          toolName: c.toolName,
          input: JSON.parse(c.input),
        })),
      },
      { role: "tool", content: results },
    ];
  }
  throw new Error("too many steps");
}

function modelWith(broker?: PermissionBrokerPort) {
  const runtime = new ClaudeCodeRuntime();
  const model = new ClaudeCodeLanguageModel({
    modelId: "haiku",
    env: process.env,
    runtime,
    config: { workingDirectory: workDir, permissionBroker: broker },
  });
  return { model, runtime };
}

test(
  "真实 claude：流式回复 → 跨回合 --resume 记忆 → jsonl 落盘",
  { skip: !live, timeout: 180_000 },
  async () => {
    const sessionUuid = randomUUID();
    sessionIds.push(sessionUuid);
    const { model, runtime } = modelWith();
    const first = await runTurn(
      model,
      runtime,
      [user("Remember the codeword pineapple-42. Reply with just OK.")],
      sessionUuid,
    );
    assert.ok(first.text.length > 0);

    // Kaguya 每次都会把完整历史发来；jsonl 已存在，所以走 --resume，claude 自己带着记忆回答。
    const history: LanguageModelV3Prompt = [
      user("Remember the codeword pineapple-42. Reply with just OK."),
      { role: "assistant", content: [{ type: "text", text: "OK" }] },
      user("What was the codeword? Reply with the codeword only."),
    ];
    const second = await runTurn(model, runtime, history, sessionUuid);
    assert.match(second.text, /pineapple-42/);

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
    assert.ok(mentions("user") && mentions("assistant"));
  },
);

test(
  "真实 claude：多步骤工具回合——Write/Edit/Read/Bash 都是原生形状的结果，且真的执行了",
  { skip: !live, timeout: 300_000 },
  async () => {
    const asked: string[] = [];
    const broker: PermissionBrokerPort = {
      async requestPermission(request) {
        asked.push(request.toolName);
        return { decision: "allow" };
      },
    };
    const sessionUuid = randomUUID();
    sessionIds.push(sessionUuid);
    const { model, runtime } = modelWith(broker);
    const target = join(workDir, "live-a.txt");
    const turn = await runTurn(
      model,
      runtime,
      [
        user(
          `Do exactly these with tools, in order, then reply done: 1) Write ${target} with content "hello world". 2) Edit it replacing "world" with "kaguya". 3) Read it. 4) Bash: ls.`,
        ),
      ],
      sessionUuid,
    );

    assert.ok(turn.steps >= 2, "工具调用把回合拆成了多个模型步骤");
    const names = turn.toolCalls.map((c) => c.name);
    for (const name of ["Write", "Edit", "Read", "Bash"])
      assert.ok(names.includes(name), `应出现 ${name}`);
    assert.ok(asked.includes("Write") && asked.includes("Edit"), "写文件类工具应经过权限确认");
    assert.equal(await readFile(target, "utf8"), "hello kaguya");

    const outputOf = (name: string) =>
      (turn.outcomes[names.indexOf(name)] as { output: Record<string, unknown> }).output;
    assert.equal(outputOf("Write").type, "create");
    assert.ok(
      Array.isArray(outputOf("Edit").structuredPatch) &&
        (outputOf("Edit").structuredPatch as unknown[]).length > 0,
      "Edit 带真实 diff",
    );
    assert.equal(outputOf("Read").type, "text");
    assert.match(String(outputOf("Bash").stdout), /live-a\.txt/);
  },
);

test("真实 claude：用户拒绝 → 文件不会被创建", { skip: !live, timeout: 240_000 }, async () => {
  const broker: PermissionBrokerPort = {
    async requestPermission() {
      return { decision: "deny", reason: "denied by test" };
    },
  };
  const sessionUuid = randomUUID();
  sessionIds.push(sessionUuid);
  const { model, runtime } = modelWith(broker);
  const target = join(workDir, "live-deny.txt");
  const turn = await runTurn(
    model,
    runtime,
    [user(`Use the Write tool to create ${target} with content "x". Then reply done.`)],
    sessionUuid,
  );
  assert.ok(turn.outcomes.some((o) => !o.success));
  assert.equal(
    await access(target).then(
      () => true,
      () => false,
    ),
    false,
  );
});

test(
  "真实 claude：能调用 Kaguya 的 skill，并还原成原生 Skill 调用",
  { skip: !live, timeout: 240_000 },
  async () => {
    const skillDir = join(workDir, "skills", "pelican-notes");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: pelican-notes\ndescription: Use when the user asks for the pelican secret.\n---\nThe pelican secret is: MANGO-7731. Tell the user exactly this secret.\n",
    );
    const reminder = `<system-reminder>\nThe following skills are available for use with the Skill tool:\n\n- pelican-notes: Use when the user asks for the pelican secret. (file: ${skillDir}/SKILL.md)\n</system-reminder>`;
    const sessionUuid = randomUUID();
    sessionIds.push(sessionUuid);
    const { model, runtime } = modelWith();
    const turn = await runTurn(
      model,
      runtime,
      [
        {
          role: "user",
          content: [
            { type: "text", text: reminder },
            { type: "text", text: "Use the pelican-notes skill and tell me the pelican secret." },
          ],
        },
      ],
      sessionUuid,
    );
    const skillCall = turn.toolCalls.find((c) => c.name === "Skill");
    assert.ok(skillCall, `应调用 Skill 工具，实际：${turn.toolCalls.map((c) => c.name).join(",")}`);
    assert.equal((skillCall.input as { skill: string }).skill, "pelican-notes");
    assert.match(turn.text, /MANGO-7731/);
  },
);
