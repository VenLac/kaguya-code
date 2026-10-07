import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  USER_INSTRUCTIONS_MAX_BYTES,
  type IUserInstructionsService,
  type UserInstructionsSnapshot,
  type UserInstructionsWriteResult,
} from "./userInstructions.js";

function resolveUserHomeDir(env: NodeJS.ProcessEnv): string {
  const envHome = env.HOME?.trim() || env.USERPROFILE?.trim();
  return envHome && envHome.length > 0 ? envHome : homedir();
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

interface UserInstructionsServiceOptions {
  /** 测试注入；默认读进程环境，规则与 Agent 运行时一致（HOME / USERPROFILE / homedir）。 */
  env?: NodeJS.ProcessEnv;
}

export function createUserInstructionsService(
  options: UserInstructionsServiceOptions = {},
): IUserInstructionsService {
  const filePath = () =>
    join(resolveUserHomeDir(options.env ?? process.env), ".zcode", "AGENTS.md");

  async function readSnapshot(path: string): Promise<UserInstructionsSnapshot> {
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch (error) {
      if (isNotFoundError(error)) {
        return { path, exists: false, content: "", revision: null };
      }
      throw error;
    }
    return { path, exists: true, content: bytes.toString("utf8"), revision: hashBytes(bytes) };
  }

  // 同一 Host 内的保存串行执行，避免两个窗口同时保存时“比较 revision”与“替换文件”互相穿插。
  let writeQueue: Promise<unknown> = Promise.resolve();

  async function writeNow(params: {
    content: string;
    expectedRevision: string | null;
  }): Promise<UserInstructionsWriteResult> {
    const bytes = Buffer.from(params.content, "utf8");
    if (bytes.byteLength > USER_INSTRUCTIONS_MAX_BYTES) {
      return {
        status: "tooLarge",
        bytes: bytes.byteLength,
        maxBytes: USER_INSTRUCTIONS_MAX_BYTES,
      };
    }

    const path = filePath();
    const current = await readSnapshot(path);
    if (current.revision !== params.expectedRevision) {
      return { status: "conflict", snapshot: current };
    }

    // 目标若是符号链接，原子 rename 会把链接替换成普通文件；写到解析后的真实路径以保留链接。
    const target = await realpath(path).catch((error: unknown) => {
      if (isNotFoundError(error)) return path;
      throw error;
    });
    const targetInfo = await stat(target).catch((error: unknown) => {
      if (isNotFoundError(error)) return null;
      throw error;
    });
    if (targetInfo && !targetInfo.isFile()) {
      throw new Error(`${target} 不是普通文件，无法保存全局 AGENTS.md`);
    }

    await mkdir(dirname(target), { recursive: true });
    const tempPath = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, bytes);
      await rename(tempPath, target);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }

    return { status: "saved", snapshot: await readSnapshot(path) };
  }

  return {
    read: () => readSnapshot(filePath()),
    write(params) {
      const task = writeQueue.then(() => writeNow(params));
      // 前一次失败不能让后续保存永远排在 rejected 的 promise 后面。
      writeQueue = task.catch(() => undefined);
      return task;
    },
  };
}
