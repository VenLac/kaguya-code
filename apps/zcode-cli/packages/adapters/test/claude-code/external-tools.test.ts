import assert from "node:assert/strict";
import { test } from "node:test";
import { ExternalToolRegistry } from "../../src/model/claude-code/external-tools.ts";
import { mapClaudeToolCall } from "../../src/model/claude-code/tool-mapping.ts";

const register = (registry: ExternalToolRegistry, id = "t1") =>
  registry.register(id, "Write", mapClaudeToolCall("Write", { file_path: "/a", content: "x" }));

test("未登记的调用不是外部调用", () => {
  assert.equal(new ExternalToolRegistry().claim("nope"), undefined);
});

test("结果先到、executor 后到：不丢结果，翻译成原生输出", async () => {
  const registry = new ExternalToolRegistry();
  register(registry);
  registry.resolveResult("t1", {
    content: "created",
    isError: false,
    toolUseResult: {
      type: "create",
      filePath: "/a",
      content: "x",
      structuredPatch: [],
      originalFile: null,
    },
  });
  const claim = registry.claim("t1")!;
  assert.ok(claim);
  const outcome = await claim.waitForOutcome();
  assert.equal(outcome.success, true);
  assert.equal((outcome as { modelContent: string }).modelContent, "created");
  assert.equal(registry.claim("t1"), undefined, "交付后登记项应释放");
});

test("executor 先等、结果后到", async () => {
  const registry = new ExternalToolRegistry();
  register(registry);
  const pending = registry.claim("t1")!.waitForOutcome();
  setTimeout(
    () =>
      registry.resolveResult("t1", { content: "late", isError: false, toolUseResult: undefined }),
    10,
  );
  assert.equal(((await pending) as { modelContent: string }).modelContent, "late");
});

test("中止时拒绝等待并释放登记项", async () => {
  const registry = new ExternalToolRegistry();
  register(registry);
  const controller = new AbortController();
  const waiting = registry.claim("t1")!.waitForOutcome(controller.signal);
  controller.abort(new Error("cancelled"));
  await assert.rejects(waiting, /cancelled/);
  assert.equal(registry.claim("t1"), undefined);
});

test("进程结束时未出结果的调用收口为失败，executor 不会永远等下去", async () => {
  const registry = new ExternalToolRegistry();
  register(registry, "a");
  register(registry, "b");
  registry.resolveResult("a", { content: "ok", isError: false, toolUseResult: undefined });
  registry.failPending(["a", "b"], "claude exited");
  assert.equal((await registry.claim("a")!.waitForOutcome()).success, true, "已有结果的不受影响");
  assert.deepEqual(await registry.claim("b")!.waitForOutcome(), {
    success: false,
    error: "claude exited",
  });
});

test("只收口给定的调用：同一登记表里其他会话（其他 run）正在执行的调用不受影响", async () => {
  const registry = new ExternalToolRegistry();
  register(registry, "mine");
  register(registry, "other-session");
  registry.failPending(["mine"], "claude exited");
  assert.equal((await registry.claim("mine")!.waitForOutcome()).success, false);
  registry.resolveResult("other-session", { content: "ok", isError: false, toolUseResult: undefined });
  assert.equal(
    (await registry.claim("other-session")!.waitForOutcome()).success,
    true,
    "其他 run 的调用仍等待自己的结果",
  );
});

test("权限请求等待工具行出现（markStarted）后再放行；未登记的立即放行", async () => {
  const registry = new ExternalToolRegistry();
  register(registry);
  let released = false;
  const gate = registry.waitUntilStarted("t1").then(() => {
    released = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(released, false);
  registry.claim("t1")!.markStarted();
  await gate;
  assert.equal(released, true);
  await registry.waitUntilStarted("unknown"); // 不应挂住
});

test("重复登记同一个 tool_use 只保留第一次；重复交付结果被忽略", async () => {
  const registry = new ExternalToolRegistry();
  register(registry);
  register(registry);
  registry.resolveResult("t1", { content: "first", isError: false, toolUseResult: undefined });
  registry.resolveResult("t1", { content: "second", isError: false, toolUseResult: undefined });
  assert.equal(
    ((await registry.claim("t1")!.waitForOutcome()) as { modelContent: string }).modelContent,
    "first",
  );
});
