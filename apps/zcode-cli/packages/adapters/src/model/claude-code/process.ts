import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { extname } from "node:path";
import { createInterface } from "node:readline";
import {
  CLAUDE_EXIT_WAIT_MS,
  CLAUDE_KILL_GRACE_MS,
  CLAUDE_STDERR_TAIL_BYTES,
  ClaudeCodeErrorCode,
} from "./constants.js";
import { ClaudeCodeError, spawnFailedError } from "./errors.js";
import {
  parseClaudeCliLine,
  type ClaudeCliMessage,
  type ClaudePermissionRequest,
  type ClaudePermissionSuggestion,
} from "./protocol.js";

export type ClaudeUserContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface ClaudePermissionAnswer {
  behavior: "allow" | "deny";
  /** deny 时回给模型的原因；allow 时可带用户修改后的入参。 */
  message?: string;
  updatedInput?: unknown;
  /** allow 时让 claude 记住的权限规则（「始终允许」），由 claude 自己落盘。 */
  updatedPermissions?: ClaudePermissionSuggestion[];
}

export interface ClaudeRunRequest {
  executable: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  content: ClaudeUserContentBlock[];
  signal?: AbortSignal;
  /** 权限请求回调；返回前 claude 会一直等待。abort 时 signal 会触发。 */
  onPermissionRequest: (
    request: ClaudePermissionRequest,
    signal: AbortSignal,
  ) => Promise<ClaudePermissionAnswer>;
  onDebug?: (message: string, context?: Record<string, unknown>) => void;
}

const WINDOWS_SHELL_SCRIPT_EXTENSIONS = new Set([".cmd", ".bat"]);

/**
 * Windows 上 npm 安装的 claude 是 .cmd 包装，Node 不允许无 shell 直接 spawn。
 * 参数已在 buildClaudeArgs 里限定为保守字符集，这里逐个加引号交给 cmd.exe；
 * 用户内容只走 stdin，不进入命令行。
 */
function resolveSpawn(
  executable: string,
  args: string[],
): { command: string; args: string[]; shell: boolean } {
  const needsShell =
    process.platform === "win32" &&
    WINDOWS_SHELL_SCRIPT_EXTENSIONS.has(extname(executable).toLowerCase());
  if (!needsShell) return { command: executable, args, shell: false };
  return { command: `"${executable}"`, args: args.map((arg) => `"${arg}"`), shell: true };
}

function encodeUserLine(content: ClaudeUserContentBlock[]): string {
  return `${JSON.stringify({ type: "user", message: { role: "user", content } })}\n`;
}

function encodePermissionResponse(
  requestId: string,
  answer: ClaudePermissionAnswer,
  originalInput: unknown,
): string {
  const response =
    answer.behavior === "allow"
      ? {
          behavior: "allow",
          updatedInput: answer.updatedInput ?? originalInput,
          ...(answer.updatedPermissions?.length
            ? { updatedPermissions: answer.updatedPermissions }
            : {}),
        }
      : { behavior: "deny", message: answer.message ?? "The user denied this tool call." };
  return `${JSON.stringify({
    type: "control_response",
    response: { subtype: "success", request_id: requestId, response },
  })}\n`;
}

class StderrTail {
  private text = "";
  push(chunk: string): void {
    this.text = (this.text + chunk).slice(-CLAUDE_STDERR_TAIL_BYTES);
  }
  get value(): string {
    return this.text.trim();
  }
}

/**
 * 启动一次 claude 对话并以异步迭代器返回解析后的消息。
 *
 * 生命周期：stdin 在收到 result 前保持打开（权限应答需要写回），收到 result 后关闭让进程自然退出；
 * signal abort 时先 SIGTERM，超过宽限期强杀。权限请求在后台异步应答，不阻塞 stdout 读取。
 */
export async function* runClaudeCli(request: ClaudeRunRequest): AsyncGenerator<ClaudeCliMessage> {
  const launch = resolveSpawn(request.executable, request.args);
  const abort = new AbortController();
  const onExternalAbort = (): void => abort.abort(request.signal?.reason);
  if (request.signal?.aborted) abort.abort(request.signal.reason);
  request.signal?.addEventListener("abort", onExternalAbort, { once: true });

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(launch.command, launch.args, {
      cwd: request.cwd,
      env: request.env as NodeJS.ProcessEnv,
      shell: launch.shell,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    request.signal?.removeEventListener("abort", onExternalAbort);
    throw spawnFailedError(error, request.cwd);
  }

  const stderr = new StderrTail();
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => stderr.push(chunk));

  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const terminate = (): void => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    killTimer = setTimeout(() => child.kill("SIGKILL"), CLAUDE_KILL_GRACE_MS);
    killTimer.unref();
  };
  abort.signal.addEventListener("abort", terminate, { once: true });

  const spawnFailure = new Promise<never>((_, reject) => {
    // 修复依据：原先丢弃 errno 与 cwd，ENOENT（cwd 不存在）与 claude 缺失无法区分；这里原样保留。
    child.once("error", (error) => reject(spawnFailedError(error, request.cwd)));
  });
  // 迭代提前结束时不应留下未处理的 rejection。
  spawnFailure.catch(() => undefined);

  const exited = new Promise<number | null>((resolve) => {
    child.once("close", (code) => resolve(code));
  });

  child.stdin.on("error", () => undefined); // 进程先退出时写 stdin 会 EPIPE，由退出码统一报告。
  child.stdin.write(encodeUserLine(request.content));

  const pendingPermissions = new Set<Promise<void>>();
  const answerPermission = (permission: ClaudePermissionRequest): void => {
    const task = request
      .onPermissionRequest(permission, abort.signal)
      .catch(
        (error: unknown): ClaudePermissionAnswer => ({
          behavior: "deny",
          message: error instanceof Error ? error.message : "Permission request failed.",
        }),
      )
      .then((answer) => {
        if (!child.stdin.writable) return;
        child.stdin.write(encodePermissionResponse(permission.requestId, answer, permission.input));
      })
      .finally(() => pendingPermissions.delete(task));
    pendingPermissions.add(task);
  };

  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let sawResult = false;
  let exitWaitTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const iterator = lines[Symbol.asyncIterator]();
    while (true) {
      const next = await Promise.race([iterator.next(), spawnFailure]);
      if (next.done) break;
      const message = parseClaudeCliLine(next.value);
      if (!message) {
        request.onDebug?.("claude 输出了无法解析的行", { length: next.value.length });
        continue;
      }
      if (message.kind === "permission_request") {
        answerPermission(message.request);
        continue;
      }
      yield message;
      if (message.kind === "result") {
        sawResult = true;
        child.stdin.end();
        // 正常结束不能强杀：claude 还要把会话写进 jsonl。只给一个兜底时限防止进程挂住。
        exitWaitTimer = setTimeout(terminate, CLAUDE_EXIT_WAIT_MS);
        exitWaitTimer.unref();
      }
    }
  } finally {
    lines.close();
    // 未拿到 result 就离开（取消、协议异常、消费方提前终止）：结束子进程并取消挂起的权限请求。
    if (!sawResult) abort.abort();
    request.signal?.removeEventListener("abort", onExternalAbort);
  }

  const exitCode = await exited;
  if (killTimer) clearTimeout(killTimer);
  if (exitWaitTimer) clearTimeout(exitWaitTimer);
  if (request.signal?.aborted) {
    throw request.signal.reason instanceof Error
      ? request.signal.reason
      : new DOMException("The operation was aborted.", "AbortError");
  }
  if (!sawResult) {
    throw new ClaudeCodeError(
      ClaudeCodeErrorCode.ExitedAbnormally,
      `本机 claude 在返回结果前退出（退出码 ${exitCode ?? "未知"}）。${stderr.value ? `\n${stderr.value}` : ""}`,
      { details: { exitCode } },
    );
  }
}
