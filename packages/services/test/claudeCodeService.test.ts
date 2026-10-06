import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isClaudeCodeBaseUrl } from "@zcode/shared/node";
import {
  CLAUDE_CODE_PROVIDER_NAME,
  buildClaudeCodeModelConfig,
  buildClaudeCodeProviderConfig,
  createClaudeCodeService,
} from "../src/claude-code/claudeCodeService.js";
import {
  probeClaudeCode,
  probeClaudeModels,
  type ClaudeModelSpec,
  type ClaudeProbeResult,
} from "../src/claude-code/claudeCodeProbe.js";
import type { IProviderSettingsService } from "../src/model-provider/providerFacadeServices.js";

interface FakeModel {
  modelId: string;
  config?: {
    properties?: { contextWindow?: number };
    optionSpecs?: { maxOutputTokens?: { max?: number } };
  };
}
interface FakeProvider {
  providerId: string;
  providerName: string;
  effectiveConfig: { api?: { baseUrl?: string } };
  models: FakeModel[];
}

/** 只实现 claude 渠道会用到的方法的内存替身，包含 revision 与改名/更新语义。 */
function createFakeProviderSettings(initialModels: string[] = []) {
  const providers: FakeProvider[] = [];
  const calls: string[] = [];
  let revision = 1;
  const view = () => ({
    revision,
    providers: providers.map((p) => ({ ...p, models: p.models.map((m) => ({ ...m })) })),
  });
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
        models: initialModels.map((modelId) => ({ modelId })),
      };
      providers.push(provider);
      revision += 1;
      return { providerId: provider.providerId, view: view() };
    },
    async addPersonalModel(providerId: string, modelId: string, config: FakeModel["config"]) {
      calls.push(`add:${modelId}`);
      providers.find((p) => p.providerId === providerId)?.models.push({ modelId, config });
      revision += 1;
    },
    async savePersonalModelDraft(input: {
      providerId: string;
      originalModelId: string;
      nextModelId: string;
      personalConfig: FakeModel["config"];
      basedOnRevision: number;
    }) {
      assert.equal(
        input.basedOnRevision,
        revision,
        "必须基于最新 revision 保存，否则真实服务会报冲突",
      );
      calls.push(
        input.originalModelId === input.nextModelId
          ? `update:${input.nextModelId}`
          : `rename:${input.originalModelId}->${input.nextModelId}`,
      );
      const model = providers
        .find((p) => p.providerId === input.providerId)
        ?.models.find((m) => m.modelId === input.originalModelId);
      if (model) Object.assign(model, { modelId: input.nextModelId, config: input.personalConfig });
      revision += 1;
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
const SPECS: ClaudeModelSpec[] = [
  { alias: "sonnet", id: "claude-sonnet-5-5", contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  { alias: "opus", id: "claude-opus-5-5", contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  {
    alias: "haiku",
    id: "claude-haiku-4-5-20251001",
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
  },
];
const probeAll = async () => ({ specs: SPECS, failedAliases: [] as string[] });

test("渠道配置使用保留域名哨兵 baseUrl，且不携带真实密钥", () => {
  const config = buildClaudeCodeProviderConfig() as unknown as {
    api: { baseUrl: string };
    access: { apiKey: string };
  };
  assert.ok(isClaudeCodeBaseUrl(config.api.baseUrl));
  assert.equal(new URL(config.api.baseUrl).hostname.endsWith(".invalid"), true);
  assert.equal(config.access.apiKey, "claude-code-local");
});

test("模型配置：上下文与最大输出取自实测，不声明结构化输出，思考强度只给 low/medium/high", () => {
  const sonnet = buildClaudeCodeModelConfig(SPECS[0]!) as unknown as {
    properties: { supportsJsonSchemaOutput: boolean; contextWindow: number };
    optionSpecs: { reasoningLevel: { values: string[] }; maxOutputTokens: { max: number } };
  };
  assert.equal(sonnet.properties.contextWindow, 1_000_000);
  assert.equal(sonnet.optionSpecs.maxOutputTokens.max, 128_000);
  assert.equal(sonnet.properties.supportsJsonSchemaOutput, false);
  assert.deepEqual(sonnet.optionSpecs.reasoningLevel.values, ["low", "medium", "high"]);
  const haiku = buildClaudeCodeModelConfig(SPECS[2]!) as unknown as {
    properties: { contextWindow: number };
  };
  assert.equal(haiku.properties.contextWindow, 200_000, "haiku 的上下文不能被写成 1M");
});

test("未安装或未登录：启用被拒绝并说明原因，不创建任何东西", async () => {
  for (const [probed, message] of [
    [{ installed: false, loggedIn: false }, /未找到本机的 Claude Code/],
    [{ ...installed, loggedIn: false }, /还没有登录/],
  ] as const) {
    const { settings, calls } = createFakeProviderSettings();
    const service = createClaudeCodeService({
      providerSettings: settings,
      probe: async () => probed,
      probeModels: probeAll,
    });
    await assert.rejects(() => service.enable(), message);
    assert.equal(calls.length, 0);
    assert.match((await service.getStatus()).error ?? "", message);
  }
});

test("启用：按实测注册真实模型 id 与配置", async () => {
  const { settings, providers } = createFakeProviderSettings();
  const service = createClaudeCodeService({
    providerSettings: settings,
    probe: async () => installed,
    probeModels: probeAll,
  });
  const status = await service.enable();
  assert.equal(status.enabled, true);
  assert.equal(status.modelCount, 3);
  assert.equal(providers[0]?.providerName, CLAUDE_CODE_PROVIDER_NAME);
  const byId = Object.fromEntries(providers[0]!.models.map((m) => [m.modelId, m.config]));
  assert.deepEqual(Object.keys(byId).sort(), [
    "claude-haiku-4-5-20251001",
    "claude-opus-5-5",
    "claude-sonnet-5-5",
  ]);
  assert.equal(byId["claude-sonnet-5-5"]?.properties?.contextWindow, 1_000_000);
  assert.equal(byId["claude-haiku-4-5-20251001"]?.optionSpecs?.maxOutputTokens?.max, 32_000);
});

test("重复启用/同步不产生重复模型，只更新", async () => {
  const { settings, providers, calls } = createFakeProviderSettings();
  const service = createClaudeCodeService({
    providerSettings: settings,
    probe: async () => installed,
    probeModels: probeAll,
  });
  await service.enable();
  calls.length = 0;
  await service.syncModels();
  assert.equal(providers[0]?.models.length, 3);
  assert.deepEqual(calls.sort(), [
    "update:claude-haiku-4-5-20251001",
    "update:claude-opus-5-5",
    "update:claude-sonnet-5-5",
  ]);
});

test("旧版本留下的别名模型（sonnet/opus/haiku）被改名为真实 id 并修正配置，而不是并存", async () => {
  const { settings, providers, calls } = createFakeProviderSettings(["sonnet", "opus", "haiku"]);
  const service = createClaudeCodeService({
    providerSettings: settings,
    probe: async () => installed,
    probeModels: probeAll,
  });
  await service.enable();
  assert.deepEqual(providers[0]!.models.map((m) => m.modelId).sort(), [
    "claude-haiku-4-5-20251001",
    "claude-opus-5-5",
    "claude-sonnet-5-5",
  ]);
  assert.ok(calls.includes("rename:sonnet->claude-sonnet-5-5"));
  assert.equal(
    providers[0]!.models.find((m) => m.modelId === "claude-sonnet-5-5")?.config?.properties
      ?.contextWindow,
    1_000_000,
  );
  assert.ok(!calls.some((call) => call.startsWith("add:")), "已有的别名模型应改名复用");
});

test("部分模型本机 claude 不可用：其余照常同步，并在状态里说明被跳过的", async () => {
  const { settings, providers } = createFakeProviderSettings();
  const service = createClaudeCodeService({
    providerSettings: settings,
    probe: async () => installed,
    probeModels: async () => ({ specs: [SPECS[0]!, SPECS[2]!], failedAliases: ["opus"] }),
  });
  const status = await service.enable();
  assert.equal(providers[0]?.models.length, 2);
  assert.match(status.error ?? "", /opus/);
});

test("一个模型都探测不到：报错且说明原因（不留下空来源的假象由调用方处理）", async () => {
  const { settings } = createFakeProviderSettings();
  const service = createClaudeCodeService({
    providerSettings: settings,
    probe: async () => installed,
    probeModels: async () => ({ specs: [], failedAliases: ["sonnet", "opus", "haiku"] }),
  });
  await assert.rejects(() => service.enable(), /没能从本机 claude 获取任何可用模型/);
});

test("同步模型要求已启用", async () => {
  const { settings } = createFakeProviderSettings();
  const service = createClaudeCodeService({
    providerSettings: settings,
    probe: async () => installed,
    probeModels: probeAll,
  });
  await assert.rejects(() => service.syncModels(), /还没有启用/);
});

test("状态透出版本、登录方式与订阅，但不含邮箱/组织等账号信息", async () => {
  const { settings } = createFakeProviderSettings();
  const service = createClaudeCodeService({
    providerSettings: settings,
    probe: async () => installed,
    probeModels: probeAll,
  });
  const status = await service.getStatus();
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
    probeModels: probeAll,
  });
  await service.enable();
  assert.equal((await service.disable()).enabled, false);
  assert.equal(providers.length, 0);
  await assert.doesNotReject(() => service.disable());
});

async function withFakeClaude(script: string, run: (path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "claude-probe-"));
  try {
    const path = join(dir, "claude");
    await writeFile(path, script);
    await chmod(path, 0o755);
    await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("探测本机状态：解析 --version 与 auth status，只取必要字段", async () => {
  await withFakeClaude(
    `#!/bin/sh
if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi
if [ "$1" = "auth" ]; then echo '{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"max","email":"secret@example.com","orgId":"org-secret"}'; exit 0; fi
exit 1
`,
    async (path) => {
      const probed = await probeClaudeCode({ PATH: "" }, path);
      assert.deepEqual(probed, {
        installed: true,
        executablePath: path,
        version: "9.9.9",
        loggedIn: true,
        authMethod: "claude.ai",
        subscriptionType: "max",
      });
      assert.ok(!JSON.stringify(probed).includes("secret"));
    },
  );
});

test("探测：旧版 claude 没有 auth status 时视为未登录但仍算已安装；找不到则为未安装", async () => {
  await withFakeClaude(
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "1.0.0"; exit 0; fi\nexit 2\n`,
    async (path) => {
      const probed = await probeClaudeCode({ PATH: "" }, path);
      assert.deepEqual([probed.installed, probed.loggedIn, probed.version], [true, false, "1.0.0"]);
    },
  );
  assert.deepEqual(await probeClaudeCode({ PATH: "" }, "/definitely/not/here/claude"), {
    installed: false,
    loggedIn: false,
  });
});

test("实测模型：每个别名一次请求，解析真实模型 id 与上下文；失败的别名单独标出", async () => {
  await withFakeClaude(
    `#!/bin/sh
# 提示词必须在 --tools 之前，否则会被可变参数吞掉
[ "$1" = "-p" ] || exit 9
[ "$2" = "Reply with: ok" ] || exit 8
model=""; prev=""
for a in "$@"; do [ "$prev" = "--model" ] && model="$a"; prev="$a"; done
case "$model" in
  sonnet) echo '{"is_error":false,"modelUsage":{"claude-sonnet-5-5":{"contextWindow":1000000,"maxOutputTokens":128000}}}';;
  haiku)  echo '{"is_error":false,"modelUsage":{"claude-haiku-4-5-20251001":{"contextWindow":200000,"maxOutputTokens":32000}}}';;
  opus)   echo '{"is_error":true,"result":"no access"}'; exit 1;;
esac
`,
    async (path) => {
      const { specs, failedAliases } = await probeClaudeModels(path);
      assert.deepEqual(
        specs.map((s) => [s.alias, s.id, s.contextWindow, s.maxOutputTokens]),
        [
          ["sonnet", "claude-sonnet-5-5", 1_000_000, 128_000],
          ["haiku", "claude-haiku-4-5-20251001", 200_000, 32_000],
        ],
      );
      assert.deepEqual(failedAliases, ["opus"]);
    },
  );
});
