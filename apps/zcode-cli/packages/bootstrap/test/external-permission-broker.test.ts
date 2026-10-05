import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionBrokerRequest, PermissionBrokerResult, TraceContext } from "@zcode/contracts";
import { createEventedPermissionBroker } from "../src/app/external-permission-broker.ts";

const baseTrace = { traceId: "root-trace", sessionId: "sess_1" } as unknown as TraceContext;

function request(): PermissionBrokerRequest {
  return {
    requestId: "perm-1",
    sessionId: "sess_1",
    turnId: "turn_9",
    traceId: "trace-9",
    toolCallId: "toolu_1",
    toolName: "Bash",
    input: { command: "touch x" },
    mode: "build",
    ruleId: "claude-code.can-use-tool",
    reason: "Create x",
    riskLevel: "high",
    requestedAt: new Date(),
  } as unknown as PermissionBrokerRequest;
}

function recorder(log: string[], options: { failRequested?: boolean } = {}) {
  return {
    async recordExternalPermissionRequested(input: { requestId?: string; toolCallId: string; traceContext?: TraceContext }) {
      log.push(`requested:${input.requestId}:${input.toolCallId}:${input.traceContext?.turnId}:${input.traceContext?.traceId}`);
      if (options.failRequested) throw new Error("append failed");
    },
    async recordExternalPermissionResolved(input: { requestId?: string; decision: string; reason?: string }) {
      log.push(`resolved:${input.requestId}:${input.decision}:${input.reason ?? ""}`);
    },
  };
}

test("在 broker 调用前后补发 requested / resolved，且只由 inner 给出决策", async () => {
  const log: string[] = [];
  const broker = createEventedPermissionBroker({
    inner: {
      async requestPermission(): Promise<PermissionBrokerResult> {
        log.push("inner");
        return { decision: "allow", reason: "ok" };
      },
    },
    getRuntime: () => recorder(log),
    traceContext: baseTrace,
  });
  const result = await broker!.requestPermission(request());
  assert.deepEqual(result, { decision: "allow", reason: "ok" });
  assert.deepEqual(log, ["requested:perm-1:toolu_1:turn_9:trace-9", "inner", "resolved:perm-1:allow:ok"]);
});

test("拒绝决策原样透传并收口为 deny", async () => {
  const log: string[] = [];
  const broker = createEventedPermissionBroker({
    inner: { async requestPermission() { return { decision: "deny", reason: "no" }; } },
    getRuntime: () => recorder(log),
    traceContext: baseTrace,
  });
  assert.deepEqual(await broker!.requestPermission(request()), { decision: "deny", reason: "no" });
  assert.equal(log.at(-1), "resolved:perm-1:deny:no");
});

test("inner 抛错（取消/超时/传输失败）：仍补发 deny 收口，避免残留无人应答的确认卡片，并重新抛出", async () => {
  const log: string[] = [];
  const broker = createEventedPermissionBroker({
    inner: { async requestPermission() { throw new Error("aborted"); } },
    getRuntime: () => recorder(log),
    traceContext: baseTrace,
  });
  await assert.rejects(() => broker!.requestPermission(request()), /aborted/);
  assert.deepEqual(log, ["requested:perm-1:toolu_1:turn_9:trace-9", "resolved:perm-1:deny:aborted"]);
});

test("runtime 尚未构造：不发事件，但 broker 调用照常进行", async () => {
  let called = 0;
  const broker = createEventedPermissionBroker({
    inner: { async requestPermission() { called += 1; return { decision: "allow" }; } },
    getRuntime: () => undefined,
    traceContext: baseTrace,
  });
  assert.equal((await broker!.requestPermission(request())).decision, "allow");
  assert.equal(called, 1);
});

test("requested 事件写入失败：不调 inner（宁可拒绝也不在用户看不到确认卡片时放行），错误向上抛", async () => {
  const log: string[] = [];
  let called = 0;
  const broker = createEventedPermissionBroker({
    inner: { async requestPermission() { called += 1; return { decision: "allow" }; } },
    getRuntime: () => recorder(log, { failRequested: true }),
    traceContext: baseTrace,
  });
  await assert.rejects(() => broker!.requestPermission(request()), /append failed/);
  assert.equal(called, 0);
});

test("没有 inner broker 时返回 undefined（非交互运行，调用方会默认拒绝）", () => {
  assert.equal(createEventedPermissionBroker({ inner: undefined, getRuntime: () => undefined, traceContext: baseTrace }), undefined);
});
