import assert from "node:assert/strict";
import test from "node:test";
import type { PluginReferenceCatalogEntry } from "@zcode/contracts";
import { isUserReferenceablePlugin } from "../src/zcode-protocol/plugin-reference-catalog.ts";

const entry = (pluginId: string) => ({ pluginId }) as PluginReferenceCatalogEntry;

test("@ 引用 Picker 不列出官方的 node-repl-host 运行时宿主", () => {
  assert.equal(isUserReferenceablePlugin(entry("node-repl-host@zcode-plugins-official")), false);
});

test("其他插件（含第三方市场里同名的 node-repl-host）照常可引用", () => {
  assert.equal(isUserReferenceablePlugin(entry("browser-use@zcode-plugins-official")), true);
  assert.equal(isUserReferenceablePlugin(entry("node-repl-host@my-marketplace")), true);
});
