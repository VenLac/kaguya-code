import { gzip, gunzip } from "node:zlib";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep, posix } from "node:path";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const TAR_BLOCK_SIZE = 512;
const TAR_END_BLOCK_BYTES = TAR_BLOCK_SIZE * 2;

export interface LocalTarGzEntry {
  sourcePath: string;
  archivePath: string;
}

// Windows 客户端不一定能 spawn System32\tar.exe，远端资源本地缓存不能依赖系统 tar。
// 这里仅支持 Kaguya Code remote assets 使用的普通文件/目录子集，避免扩大归档格式的行为面。
export async function extractTarGzArchive(archivePath: string, targetDir: string): Promise<void> {
  const targetRoot = resolve(targetDir);
  await mkdir(targetRoot, { recursive: true });

  const archiveBuffer = await gunzipAsync(await readFile(archivePath));
  let offset = 0;
  let nextEntryName: string | null = null;

  while (offset + TAR_BLOCK_SIZE <= archiveBuffer.length) {
    const header = archiveBuffer.subarray(offset, offset + TAR_BLOCK_SIZE);
    offset += TAR_BLOCK_SIZE;

    if (isZeroBlock(header)) {
      break;
    }

    const size = parseTarOctal(header, 124, 12);
    const dataStart = offset;
    const dataEnd = dataStart + size;
    if (dataEnd > archiveBuffer.length) {
      throw new Error(`[remote-assets] truncated tar entry in ${archivePath}`);
    }

    const data = archiveBuffer.subarray(dataStart, dataEnd);
    offset = dataStart + roundUpToTarBlock(size);

    const typeFlag = readTarTypeFlag(header);
    if (typeFlag === "L") {
      nextEntryName = readTarString(data, 0, data.length);
      continue;
    }
    if (typeFlag === "x" || typeFlag === "g") {
      continue;
    }

    const rawEntryName = nextEntryName ?? readTarEntryPath(header);
    nextEntryName = null;
    const safeEntryPath = normalizeExtractEntryPath(rawEntryName);
    if (!safeEntryPath) {
      continue;
    }

    const targetPath = resolvePathWithinBase(targetRoot, safeEntryPath);
    const mode = parseTarOctal(header, 100, 8);

    if (typeFlag === "5") {
      await mkdir(targetPath, { recursive: true });
      await applyMode(targetPath, mode);
      continue;
    }

    if (typeFlag === "0" || typeFlag === "\0") {
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, data);
      await applyMode(targetPath, mode);
      continue;
    }

    if (typeFlag === "2") {
      const linkTarget = normalizeExtractSymlinkTarget({
        rawLinkTarget: readTarString(header, 157, 100),
        targetPath,
        targetRoot,
      });
      await mkdir(dirname(targetPath), { recursive: true });
      await unlinkIfExists(targetPath);
      await symlink(linkTarget, targetPath);
      continue;
    }

    throw new Error(
      `[remote-assets] unsupported tar entry type ${JSON.stringify(typeFlag)} for ${rawEntryName}`,
    );
  }
}

export async function createTarGzArchive(
  archivePath: string,
  entries: readonly LocalTarGzEntry[],
): Promise<void> {
  const archiveParts: Buffer[] = [];
  for (const entry of entries) {
    await appendTarEntry(archiveParts, entry.sourcePath, entry.archivePath);
  }
  archiveParts.push(Buffer.alloc(TAR_END_BLOCK_BYTES));

  await mkdir(dirname(archivePath), { recursive: true });
  await writeFile(archivePath, await gzipAsync(Buffer.concat(archiveParts)));
}

async function appendTarEntry(
  archiveParts: Buffer[],
  sourcePath: string,
  archivePath: string,
): Promise<void> {
  const sourceStat = await lstat(sourcePath);
  const normalizedArchivePath = normalizeCreateEntryPath(archivePath);

  if (sourceStat.isDirectory()) {
    const directoryEntryPath = ensureTrailingSlash(normalizedArchivePath);
    archiveParts.push(
      createTarHeader({
        entryPath: directoryEntryPath,
        // Windows lstat 的目录 mode 只有读写语义，常见为 0666；原样写进 tar 后，
        // 远端 tar 叠加 umask 会落成不可遍历的 0644。远端资源目录统一使用 POSIX 0755。
        mode: 0o755,
        mtimeSeconds: Math.floor(sourceStat.mtimeMs / 1000),
        size: 0,
        typeFlag: "5",
      }),
    );

    const children = (await readdir(sourcePath, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const child of children) {
      await appendTarEntry(
        archiveParts,
        join(sourcePath, child.name),
        posix.join(normalizedArchivePath, child.name),
      );
    }
    return;
  }

  if (!sourceStat.isFile()) {
    if (sourceStat.isSymbolicLink()) {
      const linkTarget = normalizeCreateSymlinkTarget({
        archivePath: normalizedArchivePath,
        rawLinkTarget: await readlink(sourcePath),
      });
      archiveParts.push(
        createTarHeader({
          entryPath: normalizedArchivePath,
          linkName: linkTarget,
          mode: 0o777,
          mtimeSeconds: Math.floor(sourceStat.mtimeMs / 1000),
          size: 0,
          typeFlag: "2",
        }),
      );
      return;
    }

    throw new Error(`[remote-assets] unsupported local archive source: ${sourcePath}`);
  }

  const content = await readFile(sourcePath);
  archiveParts.push(
    createTarHeader({
      entryPath: normalizedArchivePath,
      mode: sourceStat.mode,
      mtimeSeconds: Math.floor(sourceStat.mtimeMs / 1000),
      size: content.length,
      typeFlag: "0",
    }),
    content,
    Buffer.alloc(roundUpToTarBlock(content.length) - content.length),
  );
}

function createTarHeader(options: {
  entryPath: string;
  linkName?: string;
  mode: number;
  mtimeSeconds: number;
  size: number;
  typeFlag: "0" | "2" | "5";
}): Buffer {
  const header = Buffer.alloc(TAR_BLOCK_SIZE);
  const { name, prefix } = splitTarEntryPath(options.entryPath);

  writeTarString(header, name, 0, 100);
  writeTarOctal(header, options.mode & 0o777, 100, 8);
  writeTarOctal(header, 0, 108, 8);
  writeTarOctal(header, 0, 116, 8);
  writeTarOctal(header, options.size, 124, 12);
  writeTarOctal(header, options.mtimeSeconds, 136, 12);
  header.fill(0x20, 148, 156);
  writeTarString(header, options.typeFlag, 156, 1);
  if (options.linkName) {
    if (Buffer.byteLength(options.linkName) > 100) {
      throw new Error(`[remote-assets] tar symlink target is too long: ${options.linkName}`);
    }
    writeTarString(header, options.linkName, 157, 100);
  }
  writeTarString(header, "ustar", 257, 6);
  writeTarString(header, "00", 263, 2);
  writeTarString(header, "zcode", 265, 32);
  writeTarString(header, "zcode", 297, 32);
  writeTarString(header, prefix, 345, 155);

  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }
  writeTarChecksum(header, checksum);
  return header;
}

function splitTarEntryPath(entryPath: string): { name: string; prefix: string } {
  const encodedLength = Buffer.byteLength(entryPath);
  if (encodedLength <= 100) {
    return { name: entryPath, prefix: "" };
  }

  const segments = entryPath.split("/");
  for (let index = segments.length - 1; index > 0; index -= 1) {
    const prefix = segments.slice(0, index).join("/");
    const name = segments.slice(index).join("/");
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
  }

  throw new Error(`[remote-assets] tar entry path is too long: ${entryPath}`);
}

function readTarEntryPath(header: Buffer): string {
  const name = readTarString(header, 0, 100);
  const prefix = readTarString(header, 345, 155);
  return prefix ? `${prefix}/${name}` : name;
}

function readTarTypeFlag(header: Buffer): string {
  const value = header[156] ?? 0;
  return value === 0 ? "0" : String.fromCharCode(value);
}

function readTarString(buffer: Buffer, offset: number, length: number): string {
  const slice = buffer.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8");
}

function writeTarString(buffer: Buffer, value: string, offset: number, length: number): void {
  buffer.write(value, offset, length, "utf8");
}

function parseTarOctal(buffer: Buffer, offset: number, length: number): number {
  const raw = readTarString(buffer, offset, length).trim();
  return raw ? Number.parseInt(raw, 8) : 0;
}

function writeTarOctal(buffer: Buffer, value: number, offset: number, length: number): void {
  const encoded = Math.trunc(value)
    .toString(8)
    .padStart(length - 1, "0");
  writeTarString(buffer, encoded.slice(-(length - 1)), offset, length - 1);
}

function writeTarChecksum(buffer: Buffer, checksum: number): void {
  const encoded = checksum.toString(8).padStart(6, "0").slice(-6);
  writeTarString(buffer, encoded, 148, 6);
  buffer[154] = 0;
  buffer[155] = 0x20;
}

function isZeroBlock(block: Buffer): boolean {
  return block.every((byte) => byte === 0);
}

function roundUpToTarBlock(size: number): number {
  return Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
}

function normalizeCreateEntryPath(entryPath: string): string {
  const normalized = entryPath.replace(/^\.\/+/u, "").replace(/\/+$/u, "");
  if (!normalized || normalized === ".") {
    throw new Error("[remote-assets] tar entry path must not be empty");
  }
  return normalized;
}

function normalizeExtractEntryPath(entryPath: string): string | null {
  const trimmed = entryPath.trim().replace(/^\.\/+/u, "");
  if (!trimmed || trimmed === ".") {
    return null;
  }
  if (trimmed.includes("\\") || isAbsolute(trimmed) || posix.isAbsolute(trimmed)) {
    throw new Error(`[remote-assets] unsafe tar entry path: ${entryPath}`);
  }

  const normalized = posix.normalize(trimmed).replace(/\/+$/u, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`[remote-assets] unsafe tar entry path: ${entryPath}`);
  }
  return normalized;
}

function normalizeCreateSymlinkTarget({
  archivePath,
  rawLinkTarget,
}: {
  archivePath: string;
  rawLinkTarget: string;
}): string {
  const normalizedLinkTarget = normalizeSymlinkLinkName(rawLinkTarget);
  const parentArchivePath = posix.dirname(archivePath);
  const resolvedArchiveTarget = posix.normalize(
    posix.join(parentArchivePath === "." ? "" : parentArchivePath, normalizedLinkTarget),
  );
  if (
    !resolvedArchiveTarget ||
    resolvedArchiveTarget === "." ||
    resolvedArchiveTarget === ".." ||
    resolvedArchiveTarget.startsWith("../")
  ) {
    throw new Error(`[remote-assets] unsafe tar symlink target: ${rawLinkTarget}`);
  }
  return normalizedLinkTarget;
}

function normalizeExtractSymlinkTarget({
  rawLinkTarget,
  targetPath,
  targetRoot,
}: {
  rawLinkTarget: string;
  targetPath: string;
  targetRoot: string;
}): string {
  const normalizedLinkTarget = normalizeSymlinkLinkName(rawLinkTarget);
  const resolvedTarget = resolve(dirname(targetPath), ...normalizedLinkTarget.split("/"));
  const relativePath = relative(targetRoot, resolvedTarget);
  if (
    relativePath === "" ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === ".." ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`[remote-assets] unsafe tar symlink target: ${rawLinkTarget}`);
  }
  return normalizedLinkTarget;
}

function normalizeSymlinkLinkName(rawLinkTarget: string): string {
  const normalized = posix.normalize(rawLinkTarget);
  // tar symlink 如果允许绝对路径、Windows drive 或反斜杠，解包后可能把本地缓存指向目标目录外。
  // 这里只保留 POSIX 相对 link target，并在创建/解包两侧继续校验它解析后的落点。
  if (
    !rawLinkTarget ||
    !normalized ||
    normalized === "." ||
    normalized.includes("\\") ||
    isAbsolute(normalized) ||
    posix.isAbsolute(normalized) ||
    /^[a-zA-Z]:/u.test(normalized)
  ) {
    throw new Error(`[remote-assets] unsafe tar symlink target: ${rawLinkTarget}`);
  }
  return normalized;
}

function ensureTrailingSlash(entryPath: string): string {
  return entryPath.endsWith("/") ? entryPath : `${entryPath}/`;
}

function resolvePathWithinBase(baseDir: string, entryPath: string): string {
  const targetPath = resolve(baseDir, ...entryPath.split("/"));
  assertPathInsideBase(baseDir, targetPath, entryPath);
  return targetPath;
}

function assertPathInsideBase(baseDir: string, targetPath: string, sourceLabel: string): void {
  const relativePath = relative(baseDir, targetPath);
  if (
    relativePath === "" ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === ".." ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`[remote-assets] unsafe tar entry path: ${sourceLabel}`);
  }
}

async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function applyMode(filePath: string, mode: number): Promise<void> {
  if (!mode) {
    return;
  }
  try {
    await chmod(filePath, mode & 0o777);
  } catch {
    // 权限位在 Windows 或受限文件系统上可能不可写，远端部署会按 executable 参数重新 chmod。
  }
}
