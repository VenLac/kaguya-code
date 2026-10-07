#!/usr/bin/env node
// 合并各平台构建产出的 electron-updater 清单（latest*.yml），供 Release 发布使用。
//
// 背景：两个 macOS runner（arm64 / x64）都会产出同名的 latest-mac.yml，各自只含本架构的文件。
// 直接上传会互相覆盖，其中一个架构的用户就检测不到更新。这里把同名清单的 `files` 取并集。
//
// 只处理 electron-builder 生成的固定格式（version / files 列表 / 其余顶层字段），
// 不引入 YAML 依赖，让 release job 无需安装工作区依赖。
//
// 用法：node scripts/merge-update-manifests.mjs <输入根目录> <输出目录> [--assets <资产目录>]
// 带 --assets 时，会校验每份清单里的 url 都能在资产目录里找到同名文件，避免发布后下载 404。

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const MANIFEST_NAME_PATTERN = /^latest.*\.yml$/;

function unquote(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === "'" || quote === '"') && trimmed.endsWith(quote) && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** 把清单拆成 header（files 之前）、files 条目、trailer（files 之后）。 */
export function parseManifest(text, label = "manifest") {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const filesIndex = lines.findIndex((line) => line === "files:");
  if (filesIndex < 0) {
    throw new Error(`${label}: 缺少顶层 files 列表`);
  }
  const versionLine = lines.find((line) => line.startsWith("version:"));
  if (!versionLine) {
    throw new Error(`${label}: 缺少 version`);
  }

  let end = filesIndex + 1;
  while (end < lines.length && /^\s/.test(lines[end])) end += 1;

  const entries = [];
  for (const line of lines.slice(filesIndex + 1, end)) {
    if (/^ {2}- /.test(line)) {
      entries.push([line]);
    } else if (entries.length > 0) {
      entries[entries.length - 1].push(line);
    } else {
      throw new Error(`${label}: files 列表格式无法识别：${line}`);
    }
  }
  if (entries.length === 0) {
    throw new Error(`${label}: files 列表为空`);
  }

  const withUrl = entries.map((entryLines) => {
    const urlMatch = /^ {2}- url:\s*(.+)$/.exec(entryLines[0]);
    if (!urlMatch) {
      throw new Error(`${label}: files 条目缺少 url：${entryLines[0]}`);
    }
    return { url: unquote(urlMatch[1]), lines: entryLines };
  });

  return {
    version: unquote(versionLine.slice("version:".length)),
    header: lines.slice(0, filesIndex),
    entries: withUrl,
    trailer: lines.slice(end),
  };
}

/** 合并同名清单。版本不一致说明混入了不同构建，直接失败而不是静默发布。 */
export function mergeManifests(inputs) {
  if (inputs.length === 0) {
    throw new Error("没有可合并的清单");
  }
  const parsed = inputs.map(({ label, text }) => ({ label, ...parseManifest(text, label) }));
  const [first, ...rest] = parsed;

  for (const other of rest) {
    if (other.version !== first.version) {
      throw new Error(
        `清单版本不一致：${first.label}=${first.version}，${other.label}=${other.version}`,
      );
    }
  }

  const seen = new Set();
  const mergedEntries = [];
  for (const manifest of parsed) {
    for (const entry of manifest.entries) {
      if (seen.has(entry.url)) continue;
      seen.add(entry.url);
      mergedEntries.push(entry);
    }
  }

  return (
    [
      ...first.header,
      "files:",
      ...mergedEntries.flatMap((entry) => entry.lines),
      ...first.trailer,
    ].join("\n") + "\n"
  );
}

async function collectManifestPaths(root) {
  const found = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectManifestPaths(fullPath)));
    } else if (entry.isFile() && MANIFEST_NAME_PATTERN.test(entry.name)) {
      found.push(fullPath);
    }
  }
  return found;
}

export async function mergeManifestDirectory(inputRoot, outputDir) {
  const paths = (await collectManifestPaths(inputRoot)).sort();
  if (paths.length === 0) {
    throw new Error(`${inputRoot} 下没有找到 latest*.yml`);
  }

  const groups = new Map();
  for (const path of paths) {
    const name = basename(path);
    const list = groups.get(name) ?? [];
    list.push({ label: path, text: await readFile(path, "utf8") });
    groups.set(name, list);
  }

  await mkdir(outputDir, { recursive: true });
  const written = [];
  for (const [name, inputs] of groups) {
    await writeFile(join(outputDir, name), mergeManifests(inputs), "utf8");
    written.push({ name, sources: inputs.length });
  }
  return written;
}

/** 清单里的每个 url 必须能在资产目录里找到同名文件。 */
export async function verifyManifestAssets(manifestDir, assetsDir) {
  const missing = [];
  for (const name of await readdir(manifestDir)) {
    if (!MANIFEST_NAME_PATTERN.test(name)) continue;
    const { entries } = parseManifest(await readFile(join(manifestDir, name), "utf8"), name);
    for (const { url } of entries) {
      const exists = await stat(join(assetsDir, url)).then(
        (info) => info.isFile(),
        () => false,
      );
      if (!exists) missing.push(`${name} -> ${url}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`清单引用了不存在的资产：\n${missing.join("\n")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const assetsFlag = args.indexOf("--assets");
  const assetsDir = assetsFlag >= 0 ? args[assetsFlag + 1] : undefined;
  const positional = assetsFlag >= 0 ? args.filter((_, index) => index < assetsFlag) : args;
  const [inputRoot, outputDir] = positional;
  if (!inputRoot || !outputDir || (assetsFlag >= 0 && !assetsDir)) {
    console.error(
      "用法：node scripts/merge-update-manifests.mjs <输入根目录> <输出目录> [--assets <资产目录>]",
    );
    process.exit(2);
  }
  const written = await mergeManifestDirectory(inputRoot, outputDir);
  for (const { name, sources } of written) {
    console.log(`${name}: 合并 ${sources} 份`);
  }
  if (assetsDir) {
    await verifyManifestAssets(outputDir, assetsDir);
    console.log("清单引用的资产均存在");
  }
}
