/**
 * Codex（ChatGPT 账号）登录与请求鉴权核心。
 *
 * 流程与开源 Codex CLI 一致：OAuth 2.0 授权码 + PKCE，回调落在本机 127.0.0.1:1455，
 * 拿到 access / refresh / id token 后落盘（0600），请求前按需静默刷新。
 * 推理走 ChatGPT 后端的 Codex Responses 端点，使用用户自己的 ChatGPT 订阅额度。
 *
 * 仅 Node 环境使用：主机服务负责登录，Agent 运行时只读取并刷新令牌。
 */
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomicWritePrivateTextFile, withFileLock } from "./privateFilePersistence.js";

export const CODEX_OAUTH_ISSUER = "https://auth.openai.com";
/** Codex CLI 公开使用的 OAuth 客户端 ID（公共客户端，无 secret）。 */
export const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const CODEX_OAUTH_PORT = 1455;
export const CODEX_OAUTH_REDIRECT_URI = `http://localhost:${CODEX_OAUTH_PORT}/auth/callback`;
export const CODEX_OAUTH_SCOPE = "openid profile email offline_access";
export const CODEX_API_BASE_URL = "https://chatgpt.com/backend-api/codex";
export const CODEX_ORIGINATOR = "codex_cli_rs";

/** 距过期不足该时长就主动刷新。 */
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

export interface CodexAuthRecord {
  readonly version: 1;
  readonly tokens: {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly idToken: string;
    readonly accountId: string;
  };
  readonly email?: string;
  readonly planType?: string;
  /** access token 的过期时刻（毫秒时间戳）。 */
  readonly expiresAt: number;
  readonly updatedAt: number;
}

export type CodexFetch = typeof globalThis.fetch;

// ---------------------------------------------------------------------------
// 存储
// ---------------------------------------------------------------------------

export function resolveCodexAuthPath(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const base = env.ZCODE_DATA_BASE_DIR?.trim() || join(homedir(), ".zcode");
  return join(base, "codex-auth.json");
}

export async function readCodexAuth(filePath = resolveCodexAuthPath()): Promise<CodexAuthRecord | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CodexAuthRecord>;
    const t = parsed.tokens;
    if (parsed.version !== 1 || !t?.accessToken || !t.refreshToken || !t.accountId) return null;
    return parsed as CodexAuthRecord;
  } catch {
    return null;
  }
}

export async function writeCodexAuth(record: CodexAuthRecord, filePath = resolveCodexAuthPath()): Promise<void> {
  await atomicWritePrivateTextFile(filePath, `${JSON.stringify(record, null, 2)}\n`);
}

export async function clearCodexAuth(filePath = resolveCodexAuthPath()): Promise<void> {
  await withFileLock(filePath, async () => {
    const { rm } = await import("node:fs/promises");
    await rm(filePath, { force: true });
  });
}

// ---------------------------------------------------------------------------
// JWT / PKCE
// ---------------------------------------------------------------------------

function base64url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

interface TokenResponse {
  readonly id_token?: string;
  readonly access_token?: string;
  readonly refresh_token?: string;
}

/** 从 token 响应整理出落盘记录；账号 ID 与套餐写在 id_token 的 https://api.openai.com/auth 声明里。 */
export function buildCodexAuthRecord(response: TokenResponse, previous?: CodexAuthRecord | null, now = Date.now()): CodexAuthRecord {
  const accessToken = response.access_token ?? previous?.tokens.accessToken;
  const refreshToken = response.refresh_token ?? previous?.tokens.refreshToken;
  const idToken = response.id_token ?? previous?.tokens.idToken ?? "";
  if (!accessToken || !refreshToken) throw new Error("登录响应缺少令牌");
  const idClaims = decodeJwtPayload(idToken) ?? {};
  const accessClaims = decodeJwtPayload(accessToken) ?? {};
  const authClaim = (idClaims["https://api.openai.com/auth"] ?? accessClaims["https://api.openai.com/auth"] ?? {}) as Record<string, unknown>;
  const accountId = String(authClaim.chatgpt_account_id ?? previous?.tokens.accountId ?? "");
  if (!accountId) throw new Error("登录响应缺少 ChatGPT 账号 ID（该账号可能没有可用的 ChatGPT 订阅）");
  const exp = typeof accessClaims.exp === "number" ? accessClaims.exp * 1000 : now + 55 * 60 * 1000;
  const email = typeof idClaims.email === "string" ? idClaims.email : previous?.email;
  const planType = typeof authClaim.chatgpt_plan_type === "string" ? authClaim.chatgpt_plan_type : previous?.planType;
  return {
    version: 1,
    tokens: { accessToken, refreshToken, idToken, accountId },
    ...(email ? { email } : {}),
    ...(planType ? { planType } : {}),
    expiresAt: exp,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// 刷新
// ---------------------------------------------------------------------------

export class CodexAuthError extends Error {
  readonly code: "not-logged-in" | "refresh-failed" | "login-failed" | "login-cancelled" | "port-in-use";
  constructor(code: CodexAuthError["code"], message: string) {
    super(message);
    this.name = "CodexAuthError";
    this.code = code;
  }
}

export async function refreshCodexTokens(previous: CodexAuthRecord, fetchImpl: CodexFetch = fetch, now = Date.now()): Promise<CodexAuthRecord> {
  const response = await fetchImpl(`${CODEX_OAUTH_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CODEX_OAUTH_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: previous.tokens.refreshToken,
      scope: "openid profile email",
    }),
  });
  if (!response.ok) {
    throw new CodexAuthError("refresh-failed", `刷新 Codex 登录失败（HTTP ${response.status}），请重新登录`);
  }
  return buildCodexAuthRecord((await response.json()) as TokenResponse, previous, now);
}

/**
 * 取一份可用的登录记录：临近过期则在文件锁内刷新并写回（多个进程并发时只刷新一次）。
 * 未登录返回 null。
 */
export async function ensureFreshCodexAuth(options: { filePath?: string; fetch?: CodexFetch; now?: () => number } = {}): Promise<CodexAuthRecord | null> {
  const filePath = options.filePath ?? resolveCodexAuthPath();
  const now = options.now ?? Date.now;
  const current = await readCodexAuth(filePath);
  if (!current) return null;
  if (current.expiresAt - now() > REFRESH_SKEW_MS) return current;
  return withFileLock(filePath, async () => {
    // 抢到锁后再读一次：别的进程可能已经刷新过。
    const latest = (await readCodexAuth(filePath)) ?? current;
    if (latest.expiresAt - now() > REFRESH_SKEW_MS) return latest;
    const refreshed = await refreshCodexTokens(latest, options.fetch, now());
    await writeCodexAuth(refreshed, filePath);
    return refreshed;
  });
}

// ---------------------------------------------------------------------------
// 登录（本机回调服务）
// ---------------------------------------------------------------------------

export function buildCodexAuthorizeUrl(params: { challenge: string; state: string; redirectUri?: string }): string {
  const url = new URL(`${CODEX_OAUTH_ISSUER}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CODEX_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", params.redirectUri ?? CODEX_OAUTH_REDIRECT_URI);
  url.searchParams.set("scope", CODEX_OAUTH_SCOPE);
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("state", params.state);
  url.searchParams.set("originator", CODEX_ORIGINATOR);
  return url.toString();
}

export interface CodexLoginSession {
  readonly authorizeUrl: string;
  /** 登录完成（令牌已落盘）时 resolve；取消、超时或失败时 reject。 */
  readonly completion: Promise<CodexAuthRecord>;
  cancel(): void;
}

const SUCCESS_HTML = `<!doctype html><meta charset="utf-8"><title>登录成功</title><body style="font:16px system-ui;background:#0e1422;color:#eef3fa;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><div style="font-size:48px">◐</div><h2 style="font-weight:500">Codex 登录成功</h2><p style="color:#8f9bb3">可以关闭此页面，回到应用继续使用。</p></div></body>`;
const failureHtml = (message: string) =>
  `<!doctype html><meta charset="utf-8"><title>登录失败</title><body style="font:16px system-ui;background:#0e1422;color:#eef3fa;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><div style="font-size:48px">○</div><h2 style="font-weight:500">登录失败</h2><p style="color:#ff9db3">${message.replace(/[<>&]/g, "")}</p></div></body>`;

/** 启动本机回调服务并生成授权链接；调用方负责用系统浏览器打开 authorizeUrl。 */
export async function startCodexLogin(options: { filePath?: string; fetch?: CodexFetch; port?: number; timeoutMs?: number } = {}): Promise<CodexLoginSession> {
  const fetchImpl = options.fetch ?? fetch;
  const port = options.port ?? CODEX_OAUTH_PORT;
  const redirectUri = `http://localhost:${port}/auth/callback`;
  const { verifier, challenge } = createPkcePair();
  const state = base64url(randomBytes(24));
  const authorizeUrl = buildCodexAuthorizeUrl({ challenge, state, redirectUri });

  let server: Server | undefined;
  let settle!: { resolve: (record: CodexAuthRecord) => void; reject: (error: Error) => void };
  const completion = new Promise<CodexAuthRecord>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // 没有人 await 时（例如用户关掉界面）不要触发未处理拒绝。
  completion.catch(() => undefined);
  let finished = false;
  const finish = (error: Error | null, record?: CodexAuthRecord) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    // 先回包再关服务，避免浏览器看到连接被重置。
    setTimeout(() => server?.close(), 300).unref();
    if (error) settle.reject(error);
    else settle.resolve(record!);
  };
  const timer = setTimeout(
    () => finish(new CodexAuthError("login-failed", "登录超时，请重试")),
    options.timeoutMs ?? LOGIN_TIMEOUT_MS,
  );
  timer.unref();

  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    if (url.pathname !== "/auth/callback") {
      res.writeHead(404).end();
      return;
    }
    const send = (status: number, html: string) => {
      res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(html);
    };
    const error = url.searchParams.get("error");
    if (error) {
      const message = url.searchParams.get("error_description") ?? error;
      send(400, failureHtml(message));
      finish(new CodexAuthError("login-failed", message));
      return;
    }
    if (url.searchParams.get("state") !== state) {
      send(400, failureHtml("state 不匹配，请重新发起登录"));
      return; // 不终止：可能是别的页面误打到端口，等待正确的回调
    }
    const code = url.searchParams.get("code");
    if (!code) {
      send(400, failureHtml("缺少授权码"));
      return;
    }
    void (async () => {
      try {
        const response = await fetchImpl(`${CODEX_OAUTH_ISSUER}/oauth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            client_id: CODEX_OAUTH_CLIENT_ID,
            code_verifier: verifier,
          }).toString(),
        });
        if (!response.ok) throw new CodexAuthError("login-failed", `换取令牌失败（HTTP ${response.status}）`);
        const record = buildCodexAuthRecord((await response.json()) as TokenResponse);
        await writeCodexAuth(record, options.filePath);
        send(200, SUCCESS_HTML);
        finish(null, record);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        send(500, failureHtml(message));
        finish(e instanceof CodexAuthError ? e : new CodexAuthError("login-failed", message));
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server!.once("error", (e: NodeJS.ErrnoException) => {
      reject(
        e.code === "EADDRINUSE"
          ? new CodexAuthError("port-in-use", `端口 ${port} 被占用（可能 Codex CLI 正在登录），请稍后重试`)
          : e,
      );
    });
    server!.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    authorizeUrl,
    completion,
    cancel: () => finish(new CodexAuthError("login-cancelled", "已取消登录")),
  };
}

// ---------------------------------------------------------------------------
// 请求适配：把 AI SDK 发出的 Responses 请求改造成 ChatGPT Codex 后端接受的形态
// ---------------------------------------------------------------------------

export function isCodexBaseUrl(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  try {
    const url = new URL(baseUrl);
    return url.hostname === "chatgpt.com" && url.pathname.replace(/\/+$/, "").startsWith("/backend-api/codex");
  } catch {
    return false;
  }
}

const FALLBACK_INSTRUCTIONS =
  "You are Codex, a coding agent running on the user's computer. Follow the developer instructions and help with the task using the available tools.";

type InputItem = { role?: string; type?: string; content?: unknown };

function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/**
 * ChatGPT Codex 后端的约束：必须有 instructions、必须 store:false 且流式；不接受 max_output_tokens 等参数。
 * 返回新的请求体 JSON；若原本不是 JSON 则原样返回。
 */
export function adaptCodexRequestBody(body: string, mode: "native" | "fallback" = "native"): string {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return body;
  }
  json.store = false;
  json.stream = true;
  for (const key of ["max_output_tokens", "max_tool_calls", "temperature", "top_p", "previous_response_id", "truncation"]) delete json[key];
  const input = Array.isArray(json.input) ? ([...json.input] as InputItem[]) : [];
  const systemIdx = input.findIndex((item) => item.role === "system" || item.role === "developer");
  const systemText = systemIdx >= 0 ? textOfContent(input[systemIdx]!.content) : "";
  const existing = typeof json.instructions === "string" ? json.instructions.trim() : "";
  if (mode === "native") {
    if (!existing) {
      json.instructions = systemText || FALLBACK_INSTRUCTIONS;
      if (systemIdx >= 0) input.splice(systemIdx, 1);
    }
  } else {
    // 后端拒绝了自定义 instructions：改用固定的 Codex 指令，原系统提示作为 developer 消息放回对话开头。
    json.instructions = FALLBACK_INSTRUCTIONS;
    const prompt = systemText || existing;
    if (systemIdx >= 0) input.splice(systemIdx, 1);
    if (prompt) input.unshift({ role: "developer", content: [{ type: "input_text", text: prompt }] });
  }
  // store:false 时后端无法按 id 回查历史条目：丢弃 item_reference，并去掉各条目上的 id（保留 call_id）。
  json.input = input
    .filter((item) => item.type !== "item_reference")
    .map((item) => {
      const { id: _id, ...rest } = item as InputItem & { id?: unknown };
      void _id;
      return rest;
    });
  const include = Array.isArray(json.include) ? (json.include as string[]) : [];
  if (json.reasoning && !include.includes("reasoning.encrypted_content")) include.push("reasoning.encrypted_content");
  if (include.length) json.include = include;
  return JSON.stringify(json);
}

/**
 * 包装 fetch：注入 ChatGPT 账号令牌与 Codex 头，并适配请求体。
 * 令牌过期自动刷新；401 时强制刷新后重试一次；后端拒绝自定义 instructions 时降级重试一次。
 */
export function createCodexAuthFetch(baseFetch: CodexFetch, options: { filePath?: string; env?: Readonly<Record<string, string | undefined>>; sessionId?: string; userAgent?: string } = {}): CodexFetch {
  const filePath = options.filePath ?? resolveCodexAuthPath(options.env);
  const sessionId = options.sessionId ?? base64url(randomBytes(12));
  const send = async (input: Parameters<CodexFetch>[0], init: Parameters<CodexFetch>[1], auth: CodexAuthRecord, body: string | undefined) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("Authorization", `Bearer ${auth.tokens.accessToken}`);
    headers.set("chatgpt-account-id", auth.tokens.accountId);
    headers.set("OpenAI-Beta", "responses=experimental");
    headers.set("originator", CODEX_ORIGINATOR);
    headers.set("session_id", sessionId);
    headers.set("accept", "text/event-stream");
    if (options.userAgent) headers.set("User-Agent", options.userAgent);
    return baseFetch(input, { ...init, headers, ...(body !== undefined ? { body } : {}) });
  };
  return async (input, init) => {
    let auth = await ensureFreshCodexAuth({ filePath, fetch: baseFetch });
    if (!auth) throw new CodexAuthError("not-logged-in", "尚未登录 Codex：请在 设置 → 模型来源 里登录 ChatGPT 账号");
    const rawBody = typeof init?.body === "string" ? init.body : undefined;
    const body = rawBody !== undefined ? adaptCodexRequestBody(rawBody) : undefined;
    let response = await send(input, init, auth, body);
    if (response.status === 401) {
      const current = await readCodexAuth(filePath);
      const refreshed = await withFileLock(filePath, async () => {
        const latest = (await readCodexAuth(filePath)) ?? current ?? auth!;
        if (latest.tokens.accessToken !== auth!.tokens.accessToken) return latest; // 别的进程已刷新
        const next = await refreshCodexTokens(latest, baseFetch);
        await writeCodexAuth(next, filePath);
        return next;
      });
      auth = refreshed;
      response = await send(input, init, auth, body);
    }
    if (response.status === 400 && rawBody !== undefined) {
      const text = await response.clone().text().catch(() => "");
      if (/Instructions are not valid/i.test(text)) {
        response = await send(input, init, auth, adaptCodexRequestBody(rawBody, "fallback"));
      }
    }
    return response;
  };
}
