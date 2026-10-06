import { execFile } from "node:child_process";
import { extname } from "node:path";
import { resolveClaudeExecutable } from "@zcode/shared/node";

const PROBE_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 256 * 1024;
const WINDOWS_SHELL_SCRIPT_EXTENSIONS = new Set([".cmd", ".bat"]);

export interface ClaudeProbeResult {
  installed: boolean;
  executablePath?: string;
  version?: string;
  loggedIn: boolean;
  authMethod?: string;
  subscriptionType?: string;
}

function run(executable: string, args: string[], timeoutMs = PROBE_TIMEOUT_MS): Promise<string> {
  // Windows 上 npm 安装的 claude 是 .cmd 包装，必须经 shell 启动；参数全是本文件内的常量。
  const needsShell =
    process.platform === "win32" &&
    WINDOWS_SHELL_SCRIPT_EXTENSIONS.has(extname(executable).toLowerCase());
  return new Promise((resolve, reject) => {
    execFile(
      needsShell ? `"${executable}"` : executable,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
        shell: needsShell,
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** `claude --version` 形如 `2.1.289 (Claude Code)`，取第一个 token。 */
function parseVersion(stdout: string): string | undefined {
  return stdout.trim().split(/\s+/)[0] || undefined;
}

/**
 * 探测本机 claude：是否存在、版本、登录状态。
 * 登录状态来自 `claude auth status`（不耗额度）；只取 loggedIn / authMethod / subscriptionType，
 * 邮箱、组织等账号信息不读取也不向上传递。
 */
export async function probeClaudeCode(
  env: Record<string, string | undefined> = process.env,
  explicitPath?: string,
): Promise<ClaudeProbeResult> {
  const executablePath = await resolveClaudeExecutable({ env, explicitPath });
  if (!executablePath) return { installed: false, loggedIn: false };

  const [versionOutput, authOutput] = await Promise.all([
    run(executablePath, ["--version"]).catch(() => undefined),
    run(executablePath, ["auth", "status"]).catch(() => undefined),
  ]);

  let auth: Record<string, unknown> = {};
  try {
    const parsed: unknown = authOutput ? JSON.parse(authOutput) : undefined;
    if (typeof parsed === "object" && parsed !== null) auth = parsed as Record<string, unknown>;
  } catch {
    // 旧版本 claude 没有 JSON 形式的 auth status：视为登录状态未知，不影响「已安装」。
  }

  return {
    installed: true,
    executablePath,
    ...(versionOutput && parseVersion(versionOutput)
      ? { version: parseVersion(versionOutput) }
      : {}),
    loggedIn: auth.loggedIn === true,
    ...(asString(auth.authMethod) ? { authMethod: asString(auth.authMethod) } : {}),
    ...(asString(auth.subscriptionType)
      ? { subscriptionType: asString(auth.subscriptionType) }
      : {}),
  };
}

/** claude 的模型别名；别名由 claude 解析到当前最新的具体模型。 */
const CLAUDE_MODEL_ALIASES = ["sonnet", "opus", "haiku"] as const;
const MODEL_PROBE_TIMEOUT_MS = 90_000;
const MODEL_PROBE_PROMPT = "Reply with: ok";

export interface ClaudeModelSpec {
  /** 请求时用的别名（sonnet/opus/haiku）。 */
  alias: string;
  /** claude 实际解析出的具体模型 id，如 claude-sonnet-5-5。 */
  id: string;
  contextWindow: number;
  maxOutputTokens: number;
}

export interface ClaudeModelProbeResult {
  specs: ClaudeModelSpec[];
  /** 探测失败的别名（账号无权限、网络问题等）。 */
  failedAliases: string[];
}

function readModelSpec(alias: string, stdout: string): ClaudeModelSpec | undefined {
  let result: unknown;
  try {
    result = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (typeof result !== "object" || result === null) return undefined;
  const record = result as { is_error?: unknown; modelUsage?: unknown };
  if (record.is_error === true) return undefined;
  const usage = record.modelUsage;
  if (typeof usage !== "object" || usage === null) return undefined;
  for (const [id, value] of Object.entries(usage)) {
    const entry = value as { contextWindow?: unknown; maxOutputTokens?: unknown };
    if (typeof entry.contextWindow === "number" && typeof entry.maxOutputTokens === "number") {
      return {
        alias,
        id,
        contextWindow: entry.contextWindow,
        maxOutputTokens: entry.maxOutputTokens,
      };
    }
  }
  return undefined;
}

/**
 * 向本机 claude 实测每个别名：解析成哪个具体模型、真实的上下文窗口与最大输出。
 * 每个别名一次极短的请求（不落盘），并行发出；某个别名失败不影响其他。
 */
export async function probeClaudeModels(
  executablePath: string,
  aliases: readonly string[] = CLAUDE_MODEL_ALIASES,
): Promise<ClaudeModelProbeResult> {
  const outcomes = await Promise.all(
    aliases.map(async (alias) => {
      try {
        // 提示词放在参数最前：--tools 是可变参数选项，放后面会把提示词吞进工具列表。
        const stdout = await run(
          executablePath,
          [
            "-p",
            MODEL_PROBE_PROMPT,
            "--output-format",
            "json",
            "--model",
            alias,
            "--tools",
            "",
            "--setting-sources",
            "",
            "--no-session-persistence",
          ],
          MODEL_PROBE_TIMEOUT_MS,
        );
        return { alias, spec: readModelSpec(alias, stdout) };
      } catch {
        return { alias, spec: undefined };
      }
    }),
  );
  return {
    specs: outcomes.flatMap((o) => (o.spec ? [o.spec] : [])),
    failedAliases: outcomes.filter((o) => !o.spec).map((o) => o.alias),
  };
}
