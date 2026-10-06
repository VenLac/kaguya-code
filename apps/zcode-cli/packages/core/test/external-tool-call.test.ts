import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import {
  SessionEventType,
  type ExternalToolClaim,
  type ExternalToolExecutionPort,
  type ExternalToolOutcome,
  type PermissionBrokerPort,
  type SessionEvent,
  type SessionId,
} from "@zcode/contracts";
import { PermissionService } from "../src/permission/service.ts";
import { createToolExecutor } from "../src/tool/executor/impl.ts";
import { registerBuiltInTools } from "../src/tool/handlers/index.ts";
import { createToolRegistry } from "../src/tool/registry.ts";

const SESSION = "sess_ext" as SessionId;
const PATCH = [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["-a", "+b"] }];

function setup(claims: Record<string, { outcome: Promise<ExternalToolOutcome>; started?: () => void }>) {
  const events: SessionEvent[] = [];
  let brokerCalls = 0;
  const broker: PermissionBrokerPort = {
    async requestPermission() { brokerCalls += 1; return { decision: "deny", reason: "local permission must not run" }; },
  };
  const port: ExternalToolExecutionPort = {
    claim(id): ExternalToolClaim | undefined {
      const entry = claims[id];
      if (!entry) return undefined;
      return {
        markStarted: () => entry.started?.(),
        waitForOutcome: (signal) =>
          signal
            ? Promise.race([entry.outcome, new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")), { once: true }))])
            : entry.outcome,
      };
    },
  };
  const registry = createToolRegistry();
  registerBuiltInTools(registry);
  const executor = createToolExecutor({
    registry,
    permissionService: new PermissionService(),
    permissionBroker: broker,
    externalToolPort: port,
    emitEvent: async (event) => { events.push(event); },
    sessionId: SESSION,
    getWorkingDirectory: () => process.cwd(),
  } as Parameters<typeof createToolExecutor>[0]);
  return { executor, events, brokerCalls: () => brokerCalls };
}

const types = (events: SessionEvent[]) => events.map((e) => e.type);

test("外部执行的 Edit：不跑本地 handler、不走本地权限；事件与结果走原生链路，并生成原生 diff 卡片", async () => {
  const output = { filePath: "/definitely/not/here.txt", oldString: "a", newString: "b", originalFile: "a", structuredPatch: PATCH, userModified: false, replaceAll: false };
  let started = false;
  const { executor, events, brokerCalls } = setup({ toolu_1: { outcome: Promise.resolve({ success: true, output, modelContent: "edited ok" }), started: () => { started = true; } } });
  const result = await executor.execute({ id: "toolu_1", name: "Edit", input: { file_path: "/definitely/not/here.txt", old_string: "a", new_string: "b" } } as never);

  assert.equal(result.success, true);
  assert.equal(started, true, "executor 应在开始处理时通知外部（权限卡片据此排在工具行之后）");
  assert.equal(brokerCalls(), 0, "外部调用的权限由外部进程单独确认，本地不再判定");
  assert.deepEqual(result.output, output);
  assert.equal(result.modelContent, "edited ok");
  assert.equal(result.display?.kind, "file_diff");
  assert.deepEqual(types(events), [SessionEventType.ToolCallStarted, SessionEventType.ToolCallResult]);
  assert.equal((events[1]!.payload as { toolCallId: string }).toolCallId, "toolu_1");
  await assert.rejects(access("/definitely/not/here.txt"), "本地 Edit handler 不应被执行");
});

test("外部工具失败：ToolCallError 事件 + 失败结果（模型看到的是外部给的原因）", async () => {
  const { executor, events } = setup({ toolu_2: { outcome: Promise.resolve({ success: false, error: "denied by user" }) } });
  const result = await executor.execute({ id: "toolu_2", name: "Write", input: { file_path: "/x", content: "y" } } as never);
  assert.equal(result.success, false);
  assert.match(result.error?.message ?? "", /denied by user/);
  assert.deepEqual(types(events), [SessionEventType.ToolCallStarted, SessionEventType.ToolCallError]);
});

test("注册表里没有的外部工具名（如 NotebookEdit）也能被记录，不会被当成「工具不存在」", async () => {
  const { executor, events } = setup({ toolu_3: { outcome: Promise.resolve({ success: true, output: { content: "text" }, modelContent: "text" }) } });
  const result = await executor.execute({ id: "toolu_3", name: "NotebookEdit", input: { notebook_path: "/n" } } as never);
  assert.equal(result.success, true);
  assert.equal(result.modelContent, "text");
  assert.deepEqual(types(events), [SessionEventType.ToolCallStarted, SessionEventType.ToolCallResult]);
});

test("中止：等待外部结果的调用被取消，返回取消结果并发 ToolCallError", async () => {
  const never = new Promise<ExternalToolOutcome>(() => undefined);
  const { executor, events } = setup({ toolu_4: { outcome: never } });
  const controller = new AbortController();
  const pending = executor.execute({ id: "toolu_4", name: "Bash", input: { command: "sleep 100" } } as never, { signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  const result = await pending;
  assert.equal(result.success, false);
  assert.equal(result.error?.type, "tool_cancelled");
  assert.equal(types(events).at(-1), SessionEventType.ToolCallError);
});

test("没有被外部认领的调用仍走原生路径（本地权限判定照常生效）", async () => {
  const { executor, brokerCalls } = setup({});
  const result = await executor.execute({ id: "toolu_5", name: "Write", input: { file_path: "/definitely/not/here/write.txt", content: "x" } } as never);
  assert.equal(result.success, false);
  assert.equal(brokerCalls(), 1, "未被外部认领的写文件调用必须照常走本地权限确认");
  await assert.rejects(access("/definitely/not/here/write.txt"));
});
