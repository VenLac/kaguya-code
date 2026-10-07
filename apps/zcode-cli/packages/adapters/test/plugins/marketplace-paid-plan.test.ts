import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadMarketplaceManifestSync } from "../../src/plugins/marketplace.ts";

// 走真实读取路径：<storageRoot>/marketplaces/<id>/marketplace.json → 解析 → 规范化。
function loadCatalog(catalog: Record<string, unknown>) {
  const storageRoot = mkdtempSync(join(tmpdir(), "zcode-paid-plan-"));
  try {
    const dir = join(storageRoot, "marketplaces", "demo-market");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "marketplace.json"), JSON.stringify(catalog));
    return loadMarketplaceManifestSync(storageRoot, "demo-market");
  } finally {
    rmSync(storageRoot, { force: true, recursive: true });
  }
}

const entry = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  source: `./${name}`,
  ...extra,
});

test("声明 requiresPaidPlan === true 的条目在解析阶段被丢弃", () => {
  const manifest = loadCatalog({
    name: "demo-market",
    plugins: [entry("paid", { requiresPaidPlan: true }), entry("free")],
  });
  assert.deepEqual(
    manifest?.plugins.map((plugin) => plugin.name),
    ["free"],
  );
});

test("只认显式布尔 true：false、缺省、字符串、数字都保留", () => {
  const manifest = loadCatalog({
    name: "demo-market",
    plugins: [
      entry("explicit-false", { requiresPaidPlan: false }),
      entry("missing"),
      entry("string-true", { requiresPaidPlan: "true" }),
      entry("number-one", { requiresPaidPlan: 1 }),
      entry("real-paid", { requiresPaidPlan: true }),
    ],
  });
  assert.deepEqual(
    manifest?.plugins.map((plugin) => plugin.name),
    ["explicit-false", "missing", "string-true", "number-one"],
  );
});

test("保留下来的条目不再带 listing.requiresPaidPlan", () => {
  const manifest = loadCatalog({
    name: "demo-market",
    plugins: [entry("kept", { requiresPaidPlan: false, displayName: "Kept" })],
  });
  const listing = manifest?.plugins[0]?.listing as Record<string, unknown> | undefined;
  assert.equal(listing?.displayName, "Kept");
  assert.ok(listing && !("requiresPaidPlan" in listing));
});

test("featured 剔除指向被丢弃条目的名称，其余保持顺序", () => {
  const manifest = loadCatalog({
    name: "demo-market",
    featured: ["free-a", "paid", "free-b"],
    plugins: [entry("free-a"), entry("paid", { requiresPaidPlan: true }), entry("free-b")],
  });
  assert.deepEqual(manifest?.featured, ["free-a", "free-b"]);
});

test("全部条目被丢弃时返回空 plugins 的有效 manifest，featured 不残留", () => {
  const manifest = loadCatalog({
    name: "demo-market",
    featured: ["paid"],
    plugins: [entry("paid", { requiresPaidPlan: true })],
  });
  assert.ok(manifest);
  assert.deepEqual(manifest.plugins, []);
  assert.equal(manifest.featured, undefined);
});
