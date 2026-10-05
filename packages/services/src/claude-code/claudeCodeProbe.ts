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

function run(executable: string, args: string[]): Promise<string> {
  // Windows 上 npm 安装的 claude 是 .cmd 包装，必须经 shell 启动；参数全是本文件内的常量。
  const needsShell =
    process.platform === "win32" &&
    WINDOWS_SHELL_SCRIPT_EXTENSIONS.has(extname(executable).toLowerCase());
  return new Promise((resolve, reject) => {
    execFile(
      needsShell ? `"${executable}"` : executable,
      args,
      {
        timeout: PROBE_TIMEOUT_MS,
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
