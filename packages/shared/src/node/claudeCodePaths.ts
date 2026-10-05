/**
 * Claude Code（本机）渠道的共享常量与本地路径解析。
 *
 * 本渠道不接触 Claude 的任何登录凭证：认证完全由用户本机的 `claude` 自己决定。
 * 这里只负责「渠道识别」和「Claude 把会话 jsonl 写在哪」两件事，供 services（历史浏览）
 * 与 adapters（会话续接）共用，避免两边各写一份路径规则。
 *
 * 仅 Node 环境使用。
 */
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * 渠道哨兵 baseUrl。`.invalid` 是 RFC 2606 保留 TLD，永远不会被解析：
 * 即使识别失败而误走了 HTTP 通路，请求也只会在 DNS 阶段失败，不会泄露到任何真实主机。
 */
export const CLAUDE_CODE_BASE_URL = "https://claude-code.invalid";
/** provider 配置要求 apiKey 非空；本渠道不使用任何密钥，占位值仅用于通过校验。 */
export const CLAUDE_CODE_PLACEHOLDER_API_KEY = "claude-code-local";

const CLAUDE_CODE_HOSTNAME = "claude-code.invalid";
const CLAUDE_CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR";
const CLAUDE_DEFAULT_CONFIG_DIR_NAME = ".claude";
const CLAUDE_PROJECTS_DIR_NAME = "projects";
const CLAUDE_SESSION_FILE_EXTENSION = ".jsonl";
/** Claude 用 cwd 生成项目目录名：所有非字母数字字符替换为 `-`。 */
const CLAUDE_PROJECT_DIR_UNSAFE = /[^a-zA-Z0-9]/g;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EnvRecord = Record<string, string | undefined>;

export function isClaudeCodeBaseUrl(baseUrl: string | undefined): boolean {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return false;
  try {
    return new URL(trimmed).hostname.toLowerCase() === CLAUDE_CODE_HOSTNAME;
  } catch {
    return false;
  }
}

export function isClaudeSessionId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** 与 Claude Code 一致：优先 CLAUDE_CONFIG_DIR，否则 ~/.claude。 */
export function resolveClaudeConfigDir(env: EnvRecord = process.env, home = homedir()): string {
  const override = env[CLAUDE_CONFIG_DIR_ENV]?.trim();
  return override ? override : join(home, CLAUDE_DEFAULT_CONFIG_DIR_NAME);
}

function resolveClaudeProjectsDir(env: EnvRecord = process.env, home = homedir()): string {
  return join(resolveClaudeConfigDir(env, home), CLAUDE_PROJECTS_DIR_NAME);
}

/** cwd → Claude 的项目目录名（如 /a/b.c → -a-b-c）。 */
function claudeProjectDirName(cwd: string): string {
  return cwd.replace(CLAUDE_PROJECT_DIR_UNSAFE, "-");
}

function claudeSessionFileName(sessionId: string): string {
  return `${sessionId}${CLAUDE_SESSION_FILE_EXTENSION}`;
}

export interface FindClaudeSessionFileOptions {
  /** 已知工作目录时先查对应项目目录，命中则不用扫描全部项目。 */
  cwd?: string;
  env?: EnvRecord;
  home?: string;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * 按会话 id 找 Claude 的 jsonl。sessionId 必须是 UUID：它会被拼进文件路径，
 * 不校验会让 `../` 之类的输入逃出 projects 目录。
 */
export async function findClaudeSessionFile(
  sessionId: string,
  options: FindClaudeSessionFileOptions = {},
): Promise<string | undefined> {
  if (!isClaudeSessionId(sessionId)) return undefined;
  const projectsDir = resolveClaudeProjectsDir(options.env, options.home);
  const fileName = claudeSessionFileName(sessionId);

  if (options.cwd) {
    const direct = join(projectsDir, claudeProjectDirName(options.cwd), fileName);
    if (await isFile(direct)) return direct;
  }

  let projectDirs: string[];
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return undefined;
  }
  for (const directory of projectDirs) {
    const candidate = join(projectsDir, directory, fileName);
    if (await isFile(candidate)) return candidate;
  }
  return undefined;
}
