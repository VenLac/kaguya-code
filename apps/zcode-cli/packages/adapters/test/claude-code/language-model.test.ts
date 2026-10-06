import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import type { PermissionBrokerPort, PermissionBrokerRequest } from "@zcode/contracts";
import { ClaudeCodeLanguageModel } from "../../src/model/claude-code/language-model.ts";
import { ClaudeCodeRuntime } from "../../src/model/claude-code/runtime.ts";

const FAKE = join(dirname(fileURLToPath(import.meta.url)), "fake-claude.mjs");
const SESSION_UUID = "0198f2a4-7b1c-7c3e-9a55-3f0d2b6e8c11";
const KAGUYA_SESSION = `sess_${SESSION_UUID}`;
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

interface Setup {
  scenario: string;
  broker?: PermissionBrokerPort;
  tool?: string;
  runtime?: ClaudeCodeRuntime;
}

function newLog(): string {
  return join(workDir, `log-${Math.random().toString(36).slice(2)}.jsonl`);
}

function makeModel(setup: Setup, log: string) {
  const runtime = setup.runtime ?? new ClaudeCodeRuntime();
  const model = new ClaudeCodeLanguageModel({
    modelId: "sonnet",
    reasoningLevel: "high",
    runtime,
    env: {
      ...process.env,
      FAKE_CLAUDE_SCENARIO: setup.scenario,
      FAKE_CLAUDE_LOG: log,
      FAKE_CLAUDE_TOOL: setup.tool,
      CLAUDE_CONFIG_DIR: configDir,
    },
    config: { workingDirectory: workDir, executablePath: FAKE, permissionBroker: setup.broker },
  });
  return { model, runtime };
}

const userPrompt = (text = "do it"): LanguageModelV3Prompt => [
  { role: "system", content: "SYS" },
  { role: "user", content: [{ type: "text", text }] },
];
/** Kaguya core 执行完工具后发起下一步时的 prompt：最后一条是 tool 消息。 */
const afterToolPrompt = (): LanguageModelV3Prompt => [
  ...userPrompt(),
  {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId: "toolu_1", toolName: "Write", input: {} }],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "toolu_1",
        toolName: "Write",
        output: { type: "text", value: "ok" },
      },
    ],
  },
];

function callOptions(
  prompt: LanguageModelV3Prompt,
  extra: Partial<LanguageModelV3CallOptions> & {
    sessionType?: string;
    sessionId?: string | null;
    mode?: string;
  } = {},
): LanguageModelV3CallOptions {
  const { sessionType = "main", sessionId, mode, ...rest } = extra;
  return {
    prompt,
    headers: { "x-zcode-session-type": sessionType },
    providerOptions:
      sessionId === null
        ? undefined
        : {
            claudeCode: {
              sessionId: sessionId ?? KAGUYA_SESSION,
              traceId: "trace-1",
              turnId: "turn_1",
              ...(mode ? { mode } : {}),
            },
          },
    tools: [
      { type: "function", name: "Write", description: "", inputSchema: {} },
      { type: "function", name: "Bash", description: "", inputSchema: {} },
      { type: "function", name: "Read", description: "", inputSchema: {} },
    ],
    ...rest,
  };
}

async function drain(stream: ReadableStream<LanguageModelV3StreamPart>) {
  const parts: LanguageModelV3StreamPart[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}
const textOf = (parts: LanguageModelV3StreamPart[]) =>
  parts
    .filter((p) => p.type === "text-delta")
    .map((p) => (p as { delta: string }).delta)
    .join("");
const readLog = async (log: string) =>
  (await readFile(log, "utf8").catch(() => ""))
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const finishOf = (parts: LanguageModelV3StreamPart[]) =>
  parts.find((p) => p.type === "finish") as
    | Extract<LanguageModelV3StreamPart, { type: "finish" }>
    | undefined;
const errorOf = (parts: LanguageModelV3StreamPart[]) =>
  (parts.find((p) => p.type === "error") as { error: Record<string, unknown> } | undefined)?.error;

/** 模拟 Kaguya core 的 tool executor：认领调用、标记开始、等待结果。 */
async function executeLikeCore(runtime: ClaudeCodeRuntime, toolCallId = "toolu_1") {
  const claim = runtime.externalTools.claim(toolCallId);
  assert.ok(claim, "tool-call 发出后应能被认领");
  claim.markStarted();
  return claim.waitForOutcome();
}

test("纯文本回合：一个步骤，stop 结束，session-id 新建，只发用户输入", async () => {
  const log = newLog();
  const { model, runtime } = makeModel({ scenario: "text" }, log);
  const { stream } = await model.doStream(callOptions(userPrompt()));
  const parts = await drain(stream);
  assert.equal(parts[0]?.type, "stream-start");
  assert.equal(textOf(parts), "Hello");
  const finish = finishOf(parts)!;
  assert.equal(finish.finishReason.unified, "stop");
  assert.equal(finish.usage.outputTokens.total, 5);
  assert.deepEqual(finish.providerMetadata, {
    claudeCode: { sessionId: "11111111-2222-4333-8444-555555555555", costUsd: 0.01 },
  });

  const logged = await readLog(log);
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
  assert.deepEqual(logged.find((l) => l.stdin).stdin.message.content, [
    { type: "text", text: "do it" },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(runtime.runs.get(KAGUYA_SESSION), undefined, "回合结束后 run 应从注册表摘除");
});

test("工具回合：步骤 1 以 tool-calls 结束并发出原生工具调用；core 取得原生输出后，步骤 2 续接同一个 claude 进程", async () => {
  const requests: PermissionBrokerRequest[] = [];
  let startedBeforeAsk: boolean | undefined;
  let started = false;
  const broker: PermissionBrokerPort = {
    async requestPermission(request) {
      startedBeforeAsk = started;
      requests.push(request);
      return { decision: "allow" };
    },
  };
  const log = newLog();
  const { model, runtime } = makeModel({ scenario: "tool", tool: "Write", broker }, log);

  const step1 = await drain((await model.doStream(callOptions(userPrompt()))).stream);
  assert.equal(finishOf(step1)?.finishReason.unified, "tool-calls");
  assert.equal(textOf(step1), "Running.");
  const call = step1.find((p) => p.type === "tool-call") as {
    toolCallId: string;
    toolName: string;
    input: string;
    providerExecuted: boolean;
  };
  assert.deepEqual(
    { id: call.toolCallId, name: call.toolName, executed: call.providerExecuted },
    { id: "toolu_1", name: "Write", executed: true },
  );
  assert.deepEqual(JSON.parse(call.input), { file_path: "/w/a.txt", content: "hello world" });
  assert.ok(
    step1.some((p) => p.type === "tool-input-delta"),
    "入参应流式输出",
  );

  // 权限请求要等 core 把工具行建好（markStarted）之后才弹出
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(requests.length, 0);
  started = true;
  const outcome = await executeLikeCore(runtime);
  assert.equal(requests.length, 1);
  assert.equal(startedBeforeAsk, true);
  assert.equal(requests[0]?.toolCallId, "toolu_1");
  assert.equal(requests[0]?.sessionId, KAGUYA_SESSION);
  assert.equal(requests[0]?.turnId, "turn_1");
  assert.equal(requests[0]?.toolName, "Write");
  assert.equal(outcome.success, true);
  assert.deepEqual((outcome as { output: unknown }).output, {
    type: "create",
    filePath: "/w/a.txt",
    content: "hello world",
    structuredPatch: [],
    originalFile: null,
    userModified: false,
  });
  assert.equal((outcome as { modelContent: string }).modelContent, "result-text");

  const step2 = await drain((await model.doStream(callOptions(afterToolPrompt()))).stream);
  assert.equal(textOf(step2), "Done.");
  assert.equal(finishOf(step2)?.finishReason.unified, "stop");
  assert.equal(finishOf(step2)?.usage.outputTokens.total, 1, "每个步骤只带自己那条消息的用量");

  const logged = await readLog(log);
  assert.equal(logged.filter((l) => l.argv).length, 1, "两个步骤共用同一个 claude 进程");
  assert.equal(logged.find((l) => l.permissionAnswer).permissionAnswer.behavior, "allow");
});

test("用户拒绝：拒绝原因回传 claude，core 拿到失败结果，回合仍正常结束", async () => {
  const broker: PermissionBrokerPort = {
    async requestPermission() {
      return { decision: "deny", reason: "不要碰这个" };
    },
  };
  const log = newLog();
  const { model, runtime } = makeModel({ scenario: "tool", tool: "Write", broker }, log);
  await drain((await model.doStream(callOptions(userPrompt()))).stream);
  const outcome = await executeLikeCore(runtime);
  assert.deepEqual(outcome, { success: false, error: "不要碰这个" });
  const step2 = await drain((await model.doStream(callOptions(afterToolPrompt()))).stream);
  assert.equal(finishOf(step2)?.finishReason.unified, "stop");
  assert.deepEqual((await readLog(log)).find((l) => l.permissionAnswer).permissionAnswer, {
    behavior: "deny",
    message: "不要碰这个",
  });
});

test("没有 broker 时默认拒绝，而不是静默放行", async () => {
  const log = newLog();
  const { model, runtime } = makeModel({ scenario: "tool", tool: "Write" }, log);
  await drain((await model.doStream(callOptions(userPrompt()))).stream);
  const outcome = await executeLikeCore(runtime);
  assert.equal(outcome.success, false);
  const answer = (await readLog(log)).find((l) => l.permissionAnswer).permissionAnswer;
  assert.equal(answer.behavior, "deny");
  assert.match(answer.message, /无法向你确认权限/);
});

test("broker 抛错按拒绝处理，回合不挂死", async () => {
  const broker: PermissionBrokerPort = {
    async requestPermission() {
      throw new Error("ui gone");
    },
  };
  const log = newLog();
  const { model, runtime } = makeModel({ scenario: "tool", tool: "Write", broker }, log);
  await drain((await model.doStream(callOptions(userPrompt()))).stream);
  assert.equal((await executeLikeCore(runtime)).success, false);
  assert.deepEqual((await readLog(log)).find((l) => l.permissionAnswer).permissionAnswer, {
    behavior: "deny",
    message: "ui gone",
  });
});

test("只读工具（Read）claude 自己放行：没有权限请求，结果是原生 Read 输出", async () => {
  let asked = 0;
  const broker: PermissionBrokerPort = {
    async requestPermission() {
      asked += 1;
      return { decision: "deny" };
    },
  };
  const { model, runtime } = makeModel({ scenario: "tool", tool: "Read", broker }, newLog());
  await drain((await model.doStream(callOptions(userPrompt()))).stream);
  const outcome = (await executeLikeCore(runtime)) as {
    success: boolean;
    output: Record<string, unknown>;
  };
  assert.equal(asked, 0);
  assert.deepEqual(outcome.output, {
    type: "text",
    filePath: "/w/a.txt",
    content: "hello world",
    numLines: 1,
    startLine: 1,
    totalLines: 1,
  });
});

test("Bash 工具：输出翻译成原生 Bash 输出", async () => {
  const broker: PermissionBrokerPort = {
    async requestPermission() {
      return { decision: "allow" };
    },
  };
  const { model, runtime } = makeModel({ scenario: "tool", tool: "Bash", broker }, newLog());
  await drain((await model.doStream(callOptions(userPrompt()))).stream);
  const outcome = (await executeLikeCore(runtime)) as { output: Record<string, unknown> };
  assert.deepEqual(outcome.output, {
    stdout: "ok",
    stderr: "",
    interrupted: false,
    status: "completed",
  });
});

test("没有存活的 claude 进程却要续接（最后一条是 tool 消息）：给出明确错误而不是乱起新进程", async () => {
  const { model } = makeModel({ scenario: "text" }, newLog());
  await assert.rejects(
    () => model.doStream(callOptions(afterToolPrompt())),
    (error: { providerCode?: string }) => error.providerCode === "CLAUDE_PROTOCOL_ERROR",
  );
});

test("新的用户输入会结束同一会话里遗留的未完成 run，再起新进程", async () => {
  const log = newLog();
  const broker: PermissionBrokerPort = {
    async requestPermission() {
      return { decision: "allow" };
    },
  };
  const { model, runtime } = makeModel({ scenario: "tool", tool: "Write", broker }, log);
  await drain((await model.doStream(callOptions(userPrompt("first")))).stream);
  const oldRun = runtime.runs.get(KAGUYA_SESSION);
  assert.ok(oldRun?.open);
  // 用户没等工具跑完又发了新消息
  const second = makeModel({ scenario: "text", runtime }, log);
  await drain((await second.model.doStream(callOptions(userPrompt("second")))).stream);
  assert.equal((await readLog(log)).filter((l) => l.argv).length, 2);
  assert.equal(oldRun?.open, false);
});

test("thinking 作为原生 reasoning 片段下发", async () => {
  const { model } = makeModel({ scenario: "thinking" }, newLog());
  const parts = await drain((await model.doStream(callOptions(userPrompt()))).stream);
  assert.ok(parts.some((p) => p.type === "reasoning-delta"));
  assert.equal(textOf(parts), "Answer.");
});

test("辅助请求（标题/摘要）：一次性、禁用工具、不落盘；system 经临时文件作为真正的 system prompt，用后即删", async () => {
  const log = newLog();
  const { model } = makeModel({ scenario: "text" }, log);
  await drain((await model.doStream(callOptions(userPrompt(), { sessionType: "other" }))).stream);
  const logged = await readLog(log);
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
  assert.ok(!JSON.stringify(logged.find((l) => l.stdin).stdin.message.content).includes("SYS"));
});

test("辅助请求：整段被 ```json 围栏包住的答复会被剥掉围栏，文本只在结果到达后一次发出", async () => {
  const { model } = makeModel({ scenario: "fenced" }, newLog());
  const parts = await drain(
    (await model.doStream(callOptions(userPrompt(), { sessionType: "other" }))).stream,
  );
  assert.equal(textOf(parts), '{"title":"X"}');
  assert.equal(parts.filter((p) => p.type === "text-delta").length, 1);
});

test("主回合不缓冲、不剥围栏：用户要看的就是 claude 原样输出", async () => {
  const { model } = makeModel({ scenario: "fenced" }, newLog());
  const parts = await drain((await model.doStream(callOptions(userPrompt()))).stream);
  assert.equal(textOf(parts), '```json\n{"title":"X"}\n```');
});

test("没有 Kaguya 会话 id 时降级为一次性请求", async () => {
  const log = newLog();
  const { model } = makeModel({ scenario: "text" }, log);
  await drain((await model.doStream(callOptions(userPrompt(), { sessionId: null }))).stream);
  assert.ok((await readLog(log))[0].argv.includes("--no-session-persistence"));
});

test("未登录：稳定错误码 CLAUDE_AUTH_REQUIRED，状态码 401", async () => {
  const { model } = makeModel({ scenario: "auth" }, newLog());
  const error = errorOf(await drain((await model.doStream(callOptions(userPrompt()))).stream))!;
  assert.equal(error.providerCode, "CLAUDE_AUTH_REQUIRED");
  assert.equal(error.statusCode, 401);
  assert.equal(error.isProviderBusinessError, true);
});

test("claude 运行失败：CLAUDE_RUN_FAILED 并保留原文", async () => {
  const { model } = makeModel({ scenario: "failure" }, newLog());
  const error = errorOf(await drain((await model.doStream(callOptions(userPrompt()))).stream))!;
  assert.equal(error.providerCode, "CLAUDE_RUN_FAILED");
  assert.equal(error.message, "boom");
});

test("claude 在返回结果前崩溃：CLAUDE_EXITED_ABNORMALLY，带退出码与 stderr 尾部", async () => {
  const { model } = makeModel({ scenario: "crash" }, newLog());
  const error = errorOf(await drain((await model.doStream(callOptions(userPrompt()))).stream))!;
  assert.equal(error.providerCode, "CLAUDE_EXITED_ABNORMALLY");
  assert.match(String(error.message), /退出码 3/);
  assert.match(String(error.message), /something broke/);
});

test("找不到 claude：在 doStream 阶段直接抛 CLAUDE_NOT_FOUND", async () => {
  const missing = new ClaudeCodeLanguageModel({
    modelId: "sonnet",
    runtime: new ClaudeCodeRuntime(),
    env: { PATH: "", HOME: "/nonexistent-home" },
    config: { executablePath: join(workDir, "nope") },
  });
  await assert.rejects(
    () => missing.doStream(callOptions(userPrompt())),
    (error: { providerCode?: string }) => error.providerCode === "CLAUDE_NOT_FOUND",
  );
});

test("工作目录不存在：doStream 阶段直接抛 CLAUDE_WORKSPACE_MISSING，并带上路径（而不是被误判为无法启动 claude）", async () => {
  const missingCwd = join(workDir, "not-created", "Bolg");
  const log = newLog();
  const { model } = makeModel({ scenario: "text" }, log);
  const broken = new ClaudeCodeLanguageModel({
    modelId: "sonnet",
    runtime: new ClaudeCodeRuntime(),
    env: { ...process.env, FAKE_CLAUDE_SCENARIO: "text", FAKE_CLAUDE_LOG: log },
    config: { workingDirectory: missingCwd, executablePath: FAKE },
  });
  await assert.rejects(
    () => broken.doStream(callOptions(userPrompt())),
    (error: { providerCode?: string; message?: string; responseBodySummary?: { cwd?: string } }) =>
      error.providerCode === "CLAUDE_WORKSPACE_MISSING" &&
      String(error.message).includes(missingCwd) &&
      error.responseBodySummary?.cwd === missingCwd,
  );
  // 一次性辅助请求同样先检查，不启动 claude。
  await assert.rejects(
    () => broken.doStream(callOptions(userPrompt(), { sessionId: null })),
    (error: { providerCode?: string }) => error.providerCode === "CLAUDE_WORKSPACE_MISSING",
  );
  assert.deepEqual(await readLog(log).catch(() => []), []);
  // 目录存在的模型不受影响。
  await drain((await model.doStream(callOptions(userPrompt()))).stream);
});

test("取消：abort 后子进程被终止，流以错误结束，未完成的工具调用收口为失败", async () => {
  const controller = new AbortController();
  const { model } = makeModel({ scenario: "hang" }, newLog());
  const { stream } = await model.doStream(
    callOptions(userPrompt(), { abortSignal: controller.signal }),
  );
  setTimeout(() => controller.abort(new Error("user cancelled")), 150);
  const started = Date.now();
  const parts = await drain(stream);
  assert.ok(Date.now() - started < 5_000, "应在宽限期内结束，而不是等到超时");
  assert.equal((errorOf(parts) as unknown as Error).message, "user cancelled");
});

test("doGenerate（辅助请求）汇总文本与用量；失败抛出带错误码的异常", async () => {
  const { model } = makeModel({ scenario: "text" }, newLog());
  const result = await model.doGenerate(callOptions(userPrompt(), { sessionType: "other" }));
  assert.deepEqual(result.content, [{ type: "text", text: "Hello" }]);
  assert.equal(result.finishReason.unified, "stop");
  const bad = makeModel({ scenario: "auth" }, newLog());
  await assert.rejects(
    () => bad.model.doGenerate(callOptions(userPrompt(), { sessionType: "other" })),
    (e: { providerCode?: string }) => e.providerCode === "CLAUDE_AUTH_REQUIRED",
  );
});

test("Kaguya 协作模式映射成 claude 的 --permission-mode；build 不显式传参", async () => {
  const expectations: [string | undefined, string | undefined][] = [
    ["plan", "plan"],
    ["edit", "acceptEdits"],
    ["yolo", "bypassPermissions"],
    ["auto", "auto"],
    ["build", undefined],
    [undefined, undefined],
  ];
  for (const [mode, expected] of expectations) {
    const log = newLog();
    const { model } = makeModel({ scenario: "text" }, log);
    await drain((await model.doStream(callOptions(userPrompt(), { mode }))).stream);
    const argv: string[] = (await readLog(log))[0].argv;
    const index = argv.indexOf("--permission-mode");
    assert.equal(index === -1 ? undefined : argv[index + 1], expected, `mode=${mode}`);
  }
});

test("Kaguya 的 skill 清单变成临时插件交给 claude（--plugin-dir），run 结束后清理；原 skill 目录不受影响", async () => {
  const skillDir = await mkdtemp(join(tmpdir(), "kaguya-skill-src-"));
  await writeFile(
    join(skillDir, "SKILL.md"),
    "---\nname: pelican-notes\ndescription: d\n---\nbody",
  );
  const reminder = `<system-reminder>\nThe following skills are available for use with the Skill tool:\n\n- pelican-notes: d (file: ${join(skillDir, "SKILL.md")})\n</system-reminder>`;
  const prompt: LanguageModelV3Prompt = [
    {
      role: "user",
      content: [
        { type: "text", text: reminder },
        { type: "text", text: "use it" },
      ],
    },
  ];
  const log = newLog();
  const { model } = makeModel({ scenario: "text" }, log);
  await drain((await model.doStream(callOptions(prompt))).stream);
  const logged = await readLog(log);
  const argv: string[] = logged[0].argv;
  const pluginDir = logged.find((l) => l.pluginDir)?.pluginDir;
  assert.equal(argv[argv.indexOf("--plugin-dir") + 1], pluginDir.root);
  assert.equal(pluginDir.manifest.name, "kaguya-skills");
  assert.deepEqual(pluginDir.skills, { "pelican-notes": skillDir });
  // reminder 本身仍然不会进入用户消息
  assert.deepEqual(logged.find((l) => l.stdin).stdin.message.content, [
    { type: "text", text: "use it" },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(
    await stat(pluginDir.root).then(
      () => true,
      () => false,
    ),
    false,
    "run 结束后临时插件应被清理",
  );
  assert.equal(
    await stat(join(skillDir, "SKILL.md")).then(
      () => true,
      () => false,
    ),
    true,
  );
  await rm(skillDir, { recursive: true, force: true });
});

test("没有 skill 清单时不传 --plugin-dir；一次性请求从不加载 skill", async () => {
  const log = newLog();
  const { model } = makeModel({ scenario: "text" }, log);
  await drain((await model.doStream(callOptions(userPrompt()))).stream);
  assert.ok(!(await readLog(log))[0].argv.includes("--plugin-dir"));
});
