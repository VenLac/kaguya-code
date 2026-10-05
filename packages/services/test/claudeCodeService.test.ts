import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isClaudeCodeBaseUrl } from "@zcode/shared/node";
import {
  CLAUDE_CODE_MODEL_IDS,
  CLAUDE_CODE_PROVIDER_NAME,
  buildClaudeCodeModelConfig,
  buildClaudeCodeProviderConfig,
  createClaudeCodeService,
} from "../src/claude-code/claudeCodeService.js";
import { probeClaudeCode, type ClaudeProbeResult } from "../src/claude-code/claudeCodeProbe.js";
import type { IProviderSettingsService } from "../src/model-provider/providerFacadeServices.js";

interface FakeProvider {
  providerId: string;
  providerName: string;
  effectiveConfig: { api?: { baseUrl?: string } };
  models: { modelId: string }[];
}

/** 只实现 claude 渠道会用到的那几个方法的内存替身。 */
function createFakeProviderSettings() {
  const providers: FakeProvider[] = [];
  const calls: string[] = [];
  const view = () => ({ providers: providers.map((p) => ({ ...p, models: [...p.models] })) });
  const fake = {
    async getView() {
      return view();
    },
    async createPersonalProvider(input: {
      providerName: string;
      initialConfig: { api?: { baseUrl?: string } };
    }) {
      calls.push("createPersonalProvider");
      const provider: FakeProvider = {
        providerId: `p${providers.length + 1}`,
        providerName: input.providerName,
        effectiveConfig: { api: input.initialConfig.api },
        models: [],
      };
      providers.push(provider);
      return { providerId: provider.providerId, view: view() };
    },
    async addPersonalModel(providerId: string, modelId: string) {
      calls.push(`addPersonalModel:${modelId}`);
      providers.find((p) => p.providerId === providerId)?.models.push({ modelId });
    },
    async deletePersonalProvider(providerId: string) {
      calls.push("deletePersonalProvider");
      providers.splice(
        providers.findIndex((p) => p.providerId === providerId),
        1,
      );
    },
  };
  return { settings: fake as unknown as IProviderSettingsService, providers, calls };
}

const installed: ClaudeProbeResult = {
  installed: true,
  executablePath: "/usr/bin/claude",
  version: "2.1.289",
  loggedIn: true,
  authMethod: "claude.ai",
  subscriptionType: "pro",
};

test("渠道配置使用保留域名哨兵 baseUrl，且不携带真实密钥", () => {
  const config = buildClaudeCodeProviderConfig() as unknown as {
    api: { baseUrl: string; type: string };
    access: { apiKey: string };
  };
  assert.ok(isClaudeCodeBaseUrl(config.api.baseUrl));
  assert.equal(new URL(config.api.baseUrl).hostname.endsWith(".invalid"), true);
  assert.equal(config.access.apiKey, "claude-code-local");
});

test("模型配置：不声明结构化输出，思考强度只给 low/medium/high", () => {
  const config = buildClaudeCodeModelConfig() as unknown as {
    properties: { supportsJsonSchemaOutput: boolean; contextWindow: number };
    optionSpecs: { reasoningLevel: { values: string[] } };
  };
  assert.equal(config.properties.supportsJsonSchemaOutput, false);
  assert.deepEqual(config.optionSpecs.reasoningLevel.values, ["low", "medium", "high"]);
  assert.ok(config.properties.contextWindow > 0);
});

test("未安装 claude：状态为未安装，启用时抛出带说明的错误并记录在状态里", async () => {
  const { settings, calls } = createFakeProviderSettings();
  const service = createClaudeCodeService({
    providerSettings: settings,
    probe: async () => ({ installed: false, loggedIn: false }),
  });
  assert.deepEqual(await service.getStatus(), {
    installed: false,
    loggedIn: false,
    enabled: false,
  });
  await assert.rejects(() => service.enable(), /未找到本机的 Claude Code/);
  assert.equal(calls.length, 0, "未安装时不应创建任何模型来源");
  assert.match((await service.getStatus()).error ?? "", /未找到本机的 Claude Code/);
});

test("启用：注册一个来源与三个模型，重复启用不会产生重复", async () => {
  const { settings, providers, calls } = createFakeProviderSettings();
  const service = createClaudeCodeService({
    providerSettings: settings,
    probe: async () => installed,
  });

  const first = await service.enable();
  assert.equal(first.enabled, true);
  assert.equal(first.modelCount, CLAUDE_CODE_MODEL_IDS.length);
  assert.equal(providers.length, 1);
  assert.equal(providers[0]?.providerName, CLAUDE_CODE_PROVIDER_NAME);
  assert.deepEqual(
    providers[0]?.models.map((m) => m.modelId).sort(),
    [...CLAUDE_CODE_MODEL_IDS].sort(),
  );

  const before = calls.length;
  const second = await service.enable();
  assert.equal(providers.length, 1);
  assert.equal(second.modelCount, CLAUDE_CODE_MODEL_IDS.length);
  assert.equal(calls.length, before, "已启用时再次启用不应再有任何写入");
});

test("已启用后又缺了模型：只补缺失的，不动已有的", async () => {
  const { settings, providers, calls } = createFakeProviderSettings();
  const service = createClaudeCodeService({
    providerSettings: settings,
    probe: async () => installed,
  });
  await service.enable();
  providers[0]!.models = providers[0]!.models.filter((m) => m.modelId !== "opus");
  calls.length = 0;
  await service.enable();
  assert.deepEqual(calls, ["addPersonalModel:opus"]);
});

test("状态透出版本、登录方式与订阅，但不含邮箱/组织等账号信息", async () => {
  const { settings } = createFakeProviderSettings();
  const service = createClaudeCodeService({
    providerSettings: settings,
    probe: async () => installed,
  });
  const status = await service.getStatus();
  assert.equal(status.version, "2.1.289");
  assert.equal(status.authMethod, "claude.ai");
  assert.equal(status.subscriptionType, "pro");
  assert.deepEqual(Object.keys(status).sort(), [
    "authMethod",
    "enabled",
    "executablePath",
    "installed",
    "loggedIn",
    "subscriptionType",
    "version",
  ]);
});

test("移除：删除来源；没有来源时是幂等的", async () => {
  const { settings, providers } = createFakeProviderSettings();
  const service = createClaudeCodeService({
    providerSettings: settings,
    probe: async () => installed,
  });
  await service.enable();
  const removed = await service.disable();
  assert.equal(removed.enabled, false);
  assert.equal(providers.length, 0);
  await assert.doesNotReject(() => service.disable());
});

test("探测：解析 --version 与 auth status，只取必要字段", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claude-probe-"));
  try {
    const script = join(dir, "claude");
    await writeFile(
      script,
      `#!/bin/sh
if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi
if [ "$1" = "auth" ]; then echo '{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"max","email":"secret@example.com","orgId":"org-secret"}'; exit 0; fi
exit 1
`,
    );
    await chmod(script, 0o755);
    const probed = await probeClaudeCode({ PATH: "" }, script);
    assert.deepEqual(probed, {
      installed: true,
      executablePath: script,
      version: "9.9.9",
      loggedIn: true,
      authMethod: "claude.ai",
      subscriptionType: "max",
    });
    assert.ok(!JSON.stringify(probed).includes("secret"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("探测：旧版 claude 没有 auth status 时视为未登录但仍算已安装", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claude-probe-"));
  try {
    const script = join(dir, "claude");
    await writeFile(
      script,
      `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "1.0.0"; exit 0; fi\nexit 2\n`,
    );
    await chmod(script, 0o755);
    const probed = await probeClaudeCode({ PATH: "" }, script);
    assert.equal(probed.installed, true);
    assert.equal(probed.loggedIn, false);
    assert.equal(probed.version, "1.0.0");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("探测：找不到 claude 时返回未安装", async () => {
  assert.deepEqual(await probeClaudeCode({ PATH: "" }, "/definitely/not/here/claude"), {
    installed: false,
    loggedIn: false,
  });
});
