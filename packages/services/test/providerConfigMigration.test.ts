import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createProviderConfigRuntime } from "../src/model-provider/providerConfigRuntime.js";
import { readLegacyZCodeConfigProviders } from "../src/model-provider/legacyZCodeConfigProviderReader.js";
import { getAppConfigDir, setDataBaseDir } from "../src/paths.js";

const legacyConfig = {
  provider: {
    "custom-example": {
      name: "Example provider",
      npm: "@ai-sdk/openai-compatible",
      enabled: false,
      options: {
        baseURL: "https://provider.example/v1",
        apiKey: "test-only-key",
        headers: { "X-Example": "test" },
      },
      models: {
        "model-b": { limit: { context: 64000 } },
        "model-a": { limit: { context: 32000 } },
        "removed-model": { deleted: true },
      },
    },
  },
};

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "zcode-provider-migration-"));
  setDataBaseDir(dir);
  const configDir = getAppConfigDir();
  await mkdir(configDir, { recursive: true });
  const legacyPath = join(configDir, "config.json");
  const personalPath = join(configDir, "personal.json");
  const legacyContent = JSON.stringify(legacyConfig);
  await writeFile(legacyPath, legacyContent);
  let reads = 0;
  const recoveries: unknown[] = [];
  const runtime = createProviderConfigRuntime({
    zcodeBuiltinFilePath: fileURLToPath(
      new URL("../../../config/provider/zcode-builtin.json", import.meta.url),
    ),
    personalFilePath: personalPath,
    personalPollingIntervalMs: false,
    watch: false,
    readLegacyProviders: async () => {
      reads += 1;
      return readLegacyZCodeConfigProviders();
    },
    onPersonalConfigRecovery: (event) => recoveries.push(event.error),
  });
  return {
    runtime,
    legacyPath,
    legacyContent,
    personalPath,
    recoveries,
    readCount: () => reads,
    async dispose() {
      runtime.dispose();
      setDataBaseDir(null);
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("startup migrates published Kaguya Code config into personal config without changing the source", async () => {
  const fixture = await setup();
  try {
    await fixture.runtime.start();
    const config = await fixture.runtime.configService.read();
    assert.equal(fixture.readCount(), 1);
    assert.deepEqual(fixture.recoveries, []);
    const rule = config.personalProviders.getRule("custom-example");
    assert.ok(rule);
    assert.equal(rule.providerName, "Example provider");
    assert.equal(rule.enabled, false);
    assert.equal(rule.config.access?.toJSON().apiKey, "test-only-key");
    assert.equal(rule.config.api?.baseUrl, "https://provider.example/v1");
    assert.deepEqual(rule.config.api?.headers, { "X-Example": "test" });
    assert.deepEqual(rule.config.personalModelIds, ["model-b", "model-a"]);
    assert.deepEqual(rule.config.modelOrder, ["model-b", "model-a"]);
    assert.equal(
      config.personalModels.getExact("custom-example", "model-b")?.properties?.contextWindow,
      64000,
    );
    assert.equal(await readFile(fixture.legacyPath, "utf8"), fixture.legacyContent);
    const persisted = JSON.parse(await readFile(fixture.personalPath, "utf8"));
    assert.equal(persisted.schemaVersion, 1);
    assert.equal(
      persisted.config.providerConfigRules.providerRules[0].providerId,
      "custom-example",
    );
  } finally {
    await fixture.dispose();
  }
});

test("startup preserves an existing personal config and never consults the legacy file", async () => {
  const fixture = await setup();
  const current = JSON.stringify({
    schemaVersion: 1,
    config: {
      providerConfigRules: { providerRules: [] },
      modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] },
    },
  });
  try {
    await writeFile(fixture.personalPath, current);
    await fixture.runtime.start();
    const config = await fixture.runtime.configService.read();
    assert.deepEqual(fixture.recoveries, []);
    assert.equal(fixture.readCount(), 0);
    assert.deepEqual(config.personalProviders.toJSON(), []);
    assert.equal(await readFile(fixture.personalPath, "utf8"), current);
  } finally {
    await fixture.dispose();
  }
});

test("invalid legacy config is preserved and does not commit an empty personal config", async () => {
  const fixture = await setup();
  try {
    const invalidContent = '{"provider":';
    await writeFile(fixture.legacyPath, invalidContent);
    await fixture.runtime.start();
    assert.ok(fixture.recoveries.length > 0);
    assert.match(String(fixture.recoveries[0]), /stage=json/);
    assert.equal(await readFile(fixture.legacyPath, "utf8"), invalidContent);
    await assert.rejects(readFile(fixture.personalPath), { code: "ENOENT" });
  } finally {
    await fixture.dispose();
  }
});
