import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { PermissionBrokerPort, PermissionBrokerRequest } from "@zcode/contracts";
import { ClaudeCodeLanguageModel } from "../../src/model/claude-code/language-model.ts";

const FAKE = join(dirname(fileURLToPath(import.meta.url)), "fake-claude.mjs");
const SESSION_UUID = "0198f2a4-7b1c-7c3e-9a55-3f0d2b6e8c11";
let workDir: string;
let configDir: string;

before(async () => {
  workDir = await mkdtemp(join(tmpdir(), "claude-ws-"));
  configDir = await mkdtemp(join(tmpdir(), "claude-cfg-"));
});
after(async () => {
  await rm(workDir, { recursive: true, force: true });
  await rm(configDir, { recursive: true, force: true });
});

interface RunOptions {
  scenario: string;
  broker?: PermissionBrokerPort;
  headers?: Record<string, string>;
  tool?: string;
  signal?: AbortSignal;
  sessionId?: string | null;
}

function model(options: RunOptions, log: string) {
  return new ClaudeCodeLanguageModel({
    modelId: "sonnet",
    reasoningLevel: "high",
    env: {
      ...process.env,
      FAKE_CLAUDE_SCENARIO: options.scenario,
      FAKE_CLAUDE_LOG: log,
      FAKE_CLAUDE_TOOL: options.tool,
      CLAUDE_CONFIG_DIR: configDir,
    },
    config: { workingDirectory: workDir, executablePath: FAKE, permissionBroker: options.broker },
  });
}

function callOptions(options: RunOptions): LanguageModelV3CallOptions {
  return {
    prompt: [
      { role: "system", content: "SYS" },
      { role: "user", content: [{ type: "text", text: "do it" }] },
    ],
    abortSignal: options.signal,
    headers: { "x-zcode-session-type": "main", ...options.headers },
    providerOptions:
      options.sessionId === null
        ? undefined
        : {
            claudeCode: {
              sessionId: options.sessionId ?? `sess_${SESSION_UUID}`,
              traceId: "trace-1",
              turnId: "turn_1",
            },
          },
  };
}

async function collect(options: RunOptions) {
  const log = join(workDir, `log-${Math.random().toString(36).slice(2)}.jsonl`);
  const { stream } = await model(options, log).doStream(callOptions(options));
  const parts: LanguageModelV3StreamPart[] = [];
  for await (const part of stream) parts.push(part);
  const logged = (await readFile(log, "utf8").catch(() => ""))
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  return { parts, logged };
}

const textOf = (parts: LanguageModelV3StreamPart[]) =>
  parts
    .filter((p) => p.type === "text-delta")
    .map((p) => (p as { delta: string }).delta)
    .join("");

test("正常对话：流式文本 + 用量 + sessionId 元数据；参数使用新建会话与思考强度", async () => {
  const { parts, logged } = await collect({ scenario: "text" });
  assert.equal(parts[0]?.type, "stream-start");
  assert.equal(textOf(parts), "Hello");
  const finish = parts.at(-1) as Extract<LanguageModelV3StreamPart, { type: "finish" }>;
  assert.equal(finish.type, "finish");
  assert.equal(finish.finishReason.unified, "stop");
  assert.equal(finish.usage.inputTokens.total, 130);
  assert.equal(finish.usage.outputTokens.total, 5);
  assert.deepEqual(finish.providerMetadata, {
    claudeCode: { sessionId: "11111111-2222-4333-8444-555555555555", costUsd: 0.01 },
  });

  const argv: string[] = logged[0].argv;
  assert.deepEqual(argv.slice(argv.indexOf("--session-id"), argv.indexOf("--session-id") + 2), [
    "--session-id",
    SESSION_UUID,
  ]);
  assert.deepEqual(argv.slice(argv.indexOf("--effort"), argv.indexOf("--effort") + 2), [
    "--effort",
    "high",
  ]);
  assert.ok(!argv.includes("--tools"), "主回合应启用 claude 全部工具");
  const stdin = logged.find((l) => l.stdin)?.stdin;
  assert.deepEqual(
    stdin.message.content,
    [{ type: "text", text: "do it" }],
    "只发用户输入，system 不进入主回合",
  );
});

test("辅助请求（标题/摘要）：一次性、禁用工具、不落盘；system 经临时文件作为真正的 system prompt，用后即删", async () => {
  const { logged } = await collect({
    scenario: "text",
    headers: { "x-zcode-session-type": "other" },
  });
  const argv: string[] = logged[0].argv;
  assert.ok(argv.includes("--no-session-persistence"));
  assert.deepEqual(argv.slice(argv.indexOf("--tools"), argv.indexOf("--tools") + 2), [
    "--tools",
    "",
  ]);
  assert.ok(!argv.includes("--session-id") && !argv.includes("--resume"));

  const systemFile = logged.find((l) => l.systemPromptFile)?.systemPromptFile;
  assert.equal(systemFile.content, "SYS");
  assert.equal(
    await stat(systemFile.path).then(
      () => true,
      () => false,
    ),
    false,
    "临时 system prompt 文件应在请求结束后删除",
  );
  const stdin = logged.find((l) => l.stdin)?.stdin;
  assert.ok(
    !JSON.stringify(stdin.message.content).includes("SYS"),
    "system 提示不应出现在用户消息里（会被当成注入）",
  );
});

test("辅助请求：整段被 ```json 围栏包住的答复会被剥掉围栏，且文本只在结果到达后一次发出", async () => {
  const { parts } = await collect({
    scenario: "fenced",
    headers: { "x-zcode-session-type": "other" },
  });
  assert.equal(textOf(parts), '{"title":"X"}');
  assert.equal(parts.filter((p) => p.type === "text-delta").length, 1);
  assert.equal(parts.at(-1)?.type, "finish");
});

test("主回合不缓冲、不剥围栏：用户要看的就是 claude 原样输出", async () => {
  const { parts } = await collect({ scenario: "fenced" });
  assert.equal(textOf(parts), '```json\n{"title":"X"}\n```');
  assert.ok(parts.filter((p) => p.type === "text-delta").length > 1);
});

test("工具权限：用户放行 → 工具执行、结果渲染进文本，且权限请求带完整归属", async () => {
  const requests: PermissionBrokerRequest[] = [];
  const broker: PermissionBrokerPort = {
    async requestPermission(request) {
      requests.push(request);
      return { decision: "allow" };
    },
  };
  const { parts, logged } = await collect({ scenario: "tool", broker });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.toolName, "Bash");
  assert.equal(requests[0]?.sessionId, `sess_${SESSION_UUID}`);
  assert.equal(requests[0]?.traceId, "trace-1");
  assert.equal(requests[0]?.turnId, "turn_1");
  assert.equal(requests[0]?.toolCallId, "toolu_1");
  assert.equal(requests[0]?.riskLevel, "high");
  assert.equal(logged.find((l) => l.permissionAnswer).permissionAnswer.behavior, "allow");
  const text = textOf(parts);
  assert.match(text, /Running\./);
  assert.match(text, /▸ \*\*Bash\*\* `touch x`/);
  assert.match(text, /\nok\n/);
  assert.match(text, /Done\./);
});

test("工具权限：用户拒绝 → 拒绝原因回传给 claude，回合仍正常结束", async () => {
  const broker: PermissionBrokerPort = {
    async requestPermission() {
      return { decision: "deny", reason: "不要碰这个" };
    },
  };
  const { parts, logged } = await collect({ scenario: "tool", broker });
  const answer = logged.find((l) => l.permissionAnswer).permissionAnswer;
  assert.deepEqual(answer, { behavior: "deny", message: "不要碰这个" });
  assert.equal(parts.at(-1)?.type, "finish");
  assert.match(textOf(parts), /（失败）/);
});

test("工具权限：没有 broker 时默认拒绝，而不是静默放行", async () => {
  const { logged } = await collect({ scenario: "tool" });
  const answer = logged.find((l) => l.permissionAnswer).permissionAnswer;
  assert.equal(answer.behavior, "deny");
  assert.match(answer.message, /无法向你确认权限/);
});

test("工具权限：只读工具自动放行，不打扰用户", async () => {
  let asked = 0;
  const broker: PermissionBrokerPort = {
    async requestPermission() {
      asked += 1;
      return { decision: "deny" };
    },
  };
  const { logged } = await collect({ scenario: "tool", broker, tool: "Read" });
  assert.equal(asked, 0);
  assert.equal(logged.find((l) => l.permissionAnswer).permissionAnswer.behavior, "allow");
});

test("工具权限：broker 抛错时按拒绝处理并告知原因，不让回合挂死", async () => {
  const broker: PermissionBrokerPort = {
    async requestPermission() {
      throw new Error("ui gone");
    },
  };
  const { parts, logged } = await collect({ scenario: "tool", broker });
  assert.deepEqual(logged.find((l) => l.permissionAnswer).permissionAnswer, {
    behavior: "deny",
    message: "ui gone",
  });
  assert.equal(parts.at(-1)?.type, "finish");
});

test("没有 Kaguya 会话 id 时降级为一次性请求（不会乱创建 Claude 会话）", async () => {
  const { logged } = await collect({ scenario: "text", sessionId: null });
  assert.ok(logged[0].argv.includes("--no-session-persistence"));
});

test("未登录：返回稳定错误码 CLAUDE_AUTH_REQUIRED，状态码 401", async () => {
  const { parts } = await collect({ scenario: "auth" });
  const error = parts.find((p) => p.type === "error") as {
    error: { providerCode: string; statusCode: number; isProviderBusinessError: boolean };
  };
  assert.equal(error.error.providerCode, "CLAUDE_AUTH_REQUIRED");
  assert.equal(error.error.statusCode, 401);
  assert.equal(error.error.isProviderBusinessError, true);
  assert.ok(!parts.some((p) => p.type === "finish"));
});

test("claude 运行失败：返回 CLAUDE_RUN_FAILED 并保留原文", async () => {
  const { parts } = await collect({ scenario: "failure" });
  const error = parts.find((p) => p.type === "error") as {
    error: { providerCode: string; message: string };
  };
  assert.equal(error.error.providerCode, "CLAUDE_RUN_FAILED");
  assert.equal(error.error.message, "boom");
});

test("claude 在返回结果前崩溃：CLAUDE_EXITED_ABNORMALLY，带 stderr 尾部与退出码", async () => {
  const { parts } = await collect({ scenario: "crash" });
  const error = parts.find((p) => p.type === "error") as {
    error: { providerCode: string; message: string };
  };
  assert.equal(error.error.providerCode, "CLAUDE_EXITED_ABNORMALLY");
  assert.match(error.error.message, /退出码 3/);
  assert.match(error.error.message, /something broke/);
});

test("找不到 claude：在 doStream 阶段直接抛 CLAUDE_NOT_FOUND", async () => {
  const missing = new ClaudeCodeLanguageModel({
    modelId: "sonnet",
    env: { PATH: "", HOME: "/nonexistent-home" },
    config: { executablePath: join(workDir, "nope") },
  });
  await assert.rejects(
    () => missing.doStream(callOptions({ scenario: "text" })),
    (error: { providerCode?: string }) => error.providerCode === "CLAUDE_NOT_FOUND",
  );
});

test("取消：abort 后子进程被终止，流以错误结束", async () => {
  const controller = new AbortController();
  const log = join(workDir, "abort.jsonl");
  const { stream } = await model({ scenario: "hang" }, log).doStream(
    callOptions({ scenario: "hang", signal: controller.signal }),
  );
  setTimeout(() => controller.abort(new Error("user cancelled")), 150);
  const parts: LanguageModelV3StreamPart[] = [];
  const started = Date.now();
  for await (const part of stream) parts.push(part);
  assert.ok(Date.now() - started < 5_000, "应在宽限期内结束，而不是等到超时");
  const error = parts.find((p) => p.type === "error") as { error: Error };
  assert.equal(error.error.message, "user cancelled");
});

test("doGenerate 汇总流式文本与用量", async () => {
  const log = join(workDir, "gen.jsonl");
  const result = await model({ scenario: "text" }, log).doGenerate(
    callOptions({ scenario: "text" }),
  );
  assert.deepEqual(result.content, [{ type: "text", text: "Hello" }]);
  assert.equal(result.finishReason.unified, "stop");
  assert.equal(result.usage.outputTokens.total, 5);
});

test("doGenerate 遇到失败抛出带错误码的异常", async () => {
  const log = join(workDir, "gen2.jsonl");
  await assert.rejects(
    () => model({ scenario: "auth" }, log).doGenerate(callOptions({ scenario: "auth" })),
    (e: { providerCode?: string }) => e.providerCode === "CLAUDE_AUTH_REQUIRED",
  );
});
