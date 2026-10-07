import assert from "node:assert/strict";
import test from "node:test";
import {
  GITHUB_UPDATE_OWNER,
  GITHUB_UPDATE_REPO,
  resolveUpdateFeedConfig,
} from "../src/main/updateFeedConfig.js";

test("打包应用固定使用 GitHub Release", () => {
  assert.deepEqual(resolveUpdateFeedConfig({ isPackaged: true }), {
    kind: "github",
    owner: GITHUB_UPDATE_OWNER,
    repo: GITHUB_UPDATE_REPO,
  });
});

test("打包应用忽略 feed 覆盖，避免更新请求被改道", () => {
  const feed = resolveUpdateFeedConfig({
    isPackaged: true,
    updateFeedUrl: "http://localhost:9999/manifest",
  });
  assert.equal(feed.kind, "github");
});

test("非打包且带 feed 覆盖时使用 manifest provider", () => {
  assert.deepEqual(
    resolveUpdateFeedConfig({ isPackaged: false, updateFeedUrl: "  http://localhost:9999/m  " }),
    { kind: "manifest", manifestUrl: "http://localhost:9999/m" },
  );
});

test("非打包且无有效覆盖时使用 GitHub Release", () => {
  for (const updateFeedUrl of [undefined, "", "   "]) {
    assert.equal(resolveUpdateFeedConfig({ isPackaged: false, updateFeedUrl }).kind, "github");
  }
});
