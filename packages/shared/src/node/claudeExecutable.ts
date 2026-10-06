/**
 * 定位本机 Claude Code 的 `claude` 可执行文件。services（状态检测）与 adapters（运行）共用，
 * 保证两边对「用户装在哪」的判断一致。仅 Node 环境使用。
 */
import { access, constants as fsConstants } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const CLAUDE_EXECUTABLE_NAME = "claude";
/** PATH 之外的常见安装位置，相对用户主目录。 */
const CLAUDE_EXECUTABLE_HOME_FALLBACKS: readonly (readonly string[])[] = [
  [".local", "bin"],
  [".claude", "local"],
  [".npm-global", "bin"],
  ["bin"],
];

type EnvRecord = Record<string, string | undefined>;

export interface ResolveClaudeExecutableOptions {
  /** 用户在设置里显式指定的路径，优先于 PATH 搜索。 */
  explicitPath?: string;
  env?: EnvRecord;
  platform?: NodeJS.Platform;
  homeDir?: string;
  /** 测试注入：判断候选路径是否可执行。默认读文件系统。 */
  isExecutable?: (candidate: string) => Promise<boolean>;
}

const WINDOWS_DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";

async function defaultIsExecutable(candidate: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    // Windows 没有可执行位，存在即视为可执行。
    await access(candidate, platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executableNames(platform: NodeJS.Platform, env: EnvRecord): string[] {
  if (platform !== "win32") return [CLAUDE_EXECUTABLE_NAME];
  const extensions = (env.PATHEXT ?? WINDOWS_DEFAULT_PATHEXT)
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);
  return extensions.map((extension) => `${CLAUDE_EXECUTABLE_NAME}${extension.toLowerCase()}`);
}

/**
 * 定位本机 `claude`：显式路径 → PATH → 常见安装目录。找不到返回 undefined，
 * 由调用方抛出稳定的 CLAUDE_NOT_FOUND，而不是在这里决定如何提示用户。
 */
export async function resolveClaudeExecutable(
  options: ResolveClaudeExecutableOptions = {},
): Promise<string | undefined> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const isExecutable =
    options.isExecutable ?? ((candidate: string) => defaultIsExecutable(candidate, platform));

  const explicit = options.explicitPath?.trim();
  if (explicit) {
    return (await isExecutable(explicit)) ? explicit : undefined;
  }

  const names = executableNames(platform, env);
  const pathKey =
    platform === "win32"
      ? (Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "Path")
      : "PATH";
  const searchDirs = (env[pathKey] ?? "").split(delimiter).filter(Boolean);
  const home = options.homeDir ?? homedir();
  const fallbackDirs = CLAUDE_EXECUTABLE_HOME_FALLBACKS.map((parts) => join(home, ...parts));

  for (const directory of [...searchDirs, ...fallbackDirs]) {
    for (const name of names) {
      const candidate = join(directory, name);
      if (await isExecutable(candidate)) return candidate;
    }
  }
  return undefined;
}
