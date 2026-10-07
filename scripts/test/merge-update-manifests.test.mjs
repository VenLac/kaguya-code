import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  mergeManifestDirectory,
  mergeManifests,
  verifyManifestAssets,
} from "../merge-update-manifests.mjs";

const macArm64 = `version: 1.0.4
files:
  - url: Kaguya-Code-1.0.4-mac-arm64.zip
    sha512: AAAA
    size: 100
    blockMapSize: 10
  - url: Kaguya-Code-1.0.4-mac-arm64.dmg
    sha512: BBBB
    size: 200
path: Kaguya-Code-1.0.4-mac-arm64.zip
sha512: AAAA
releaseDate: '2026-10-06T10:00:00.000Z'
`;

const macX64 = `version: 1.0.4
files:
  - url: Kaguya-Code-1.0.4-mac-x64.zip
    sha512: CCCC
    size: 110
  - url: Kaguya-Code-1.0.4-mac-x64.dmg
    sha512: DDDD
    size: 210
path: Kaguya-Code-1.0.4-mac-x64.zip
sha512: CCCC
releaseDate: '2026-10-06T10:05:00.000Z'
`;

test("同名清单的 files 取并集，顶层字段取第一份", () => {
  const merged = mergeManifests([
    { label: "arm64", text: macArm64 },
    { label: "x64", text: macX64 },
  ]);
  const urls = [...merged.matchAll(/^ {2}- url: (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(urls, [
    "Kaguya-Code-1.0.4-mac-arm64.zip",
    "Kaguya-Code-1.0.4-mac-arm64.dmg",
    "Kaguya-Code-1.0.4-mac-x64.zip",
    "Kaguya-Code-1.0.4-mac-x64.dmg",
  ]);
  assert.match(merged, /^version: 1\.0\.4$/m);
  assert.match(merged, /^path: Kaguya-Code-1\.0\.4-mac-arm64\.zip$/m);
  assert.match(merged, /blockMapSize: 10/);
  assert.ok(merged.endsWith("\n"));
});

test("重复 url 只保留一份", () => {
  const merged = mergeManifests([
    { label: "a", text: macArm64 },
    { label: "b", text: macArm64 },
  ]);
  assert.equal([...merged.matchAll(/^ {2}- url:/gm)].length, 2);
});

test("版本不一致直接失败", () => {
  assert.throws(
    () =>
      mergeManifests([
        { label: "arm64", text: macArm64 },
        { label: "x64", text: macX64.replace("version: 1.0.4", "version: 1.0.5") },
      ]),
    /版本不一致/,
  );
});

test("缺少 files 或 version 时失败", () => {
  assert.throws(() => mergeManifests([{ label: "x", text: "version: 1.0.0\n" }]), /files/);
  assert.throws(() => mergeManifests([{ label: "x", text: "files:\n  - url: a\n" }]), /version/);
});

test("单份清单原样输出", () => {
  const merged = mergeManifests([{ label: "only", text: macArm64 }]);
  assert.equal(merged, macArm64);
});

test("目录合并：按文件名分组，单份清单直通，输出到目标目录", async () => {
  const root = await mkdtemp(join(tmpdir(), "merge-manifests-"));
  try {
    await mkdir(join(root, "in", "mac-arm64"), { recursive: true });
    await mkdir(join(root, "in", "mac-x64"), { recursive: true });
    await mkdir(join(root, "in", "win"), { recursive: true });
    await writeFile(join(root, "in", "mac-arm64", "latest-mac.yml"), macArm64);
    await writeFile(join(root, "in", "mac-x64", "latest-mac.yml"), macX64);
    await writeFile(
      join(root, "in", "win", "latest.yml"),
      "version: 1.0.4\nfiles:\n  - url: Kaguya-Code-1.0.4-win-x64.exe\n    sha512: EEEE\n    size: 1\npath: Kaguya-Code-1.0.4-win-x64.exe\nsha512: EEEE\n",
    );
    await writeFile(join(root, "in", "win", "Kaguya-Code-1.0.4-win-x64.exe"), "binary");

    const written = await mergeManifestDirectory(join(root, "in"), join(root, "out"));
    assert.deepEqual(written.map(({ name, sources }) => [name, sources]).sort(), [
      ["latest-mac.yml", 2],
      ["latest.yml", 1],
    ]);
    assert.deepEqual((await readdir(join(root, "out"))).sort(), ["latest-mac.yml", "latest.yml"]);
    const mac = await readFile(join(root, "out", "latest-mac.yml"), "utf8");
    assert.equal([...mac.matchAll(/^ {2}- url:/gm)].length, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("没有任何清单时失败", async () => {
  const root = await mkdtemp(join(tmpdir(), "merge-manifests-empty-"));
  try {
    await assert.rejects(mergeManifestDirectory(root, join(root, "out")), /没有找到/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("资产校验：清单引用的文件缺失时失败，齐全时通过", async () => {
  const root = await mkdtemp(join(tmpdir(), "verify-manifests-"));
  try {
    await mkdir(join(root, "manifests"), { recursive: true });
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "manifests", "latest-mac.yml"), macArm64);
    await writeFile(join(root, "assets", "Kaguya-Code-1.0.4-mac-arm64.zip"), "z");

    await assert.rejects(
      verifyManifestAssets(join(root, "manifests"), join(root, "assets")),
      /Kaguya-Code-1\.0\.4-mac-arm64\.dmg/,
    );

    await writeFile(join(root, "assets", "Kaguya-Code-1.0.4-mac-arm64.dmg"), "d");
    await verifyManifestAssets(join(root, "manifests"), join(root, "assets"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
