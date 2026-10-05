import {
  CoreErrorType,
  createCoreError,
  isHttpClientPortError,
  type HttpClientResponse,
  type WebFetchRedirect,
} from "@zcode/contracts";
import type { ToolExecutionContext } from "../types.js";
import {
  DEFAULT_WEBFETCH_TIMEOUT_MS,
  MAX_REDIRECTS,
  MAX_WEBFETCH_RESPONSE_BYTES,
  WEBFETCH_TOOL_NAME,
  WEBFETCH_USER_AGENT,
} from "./webfetch-constants.js";
import { extractReadableContent, maybePersistRawContent } from "./webfetch-content.js";
import { assertWebFetchLiteralEgress } from "./webfetch-egress-guard.js";
import { webFetchError } from "./webfetch-errors.js";
import { emitNetworkRequestStatus, traceFromContext } from "./webfetch-trace.js";
import type {
  FetchAndExtractContentResult,
  HttpErrorFetchContent,
  RedirectFetchContent,
} from "./webfetch-types.js";
import { isPermittedRedirect, redactUrlCredentials, resolveRedirectUrl } from "./webfetch-url.js";

export async function fetchAndExtractContent(options: {
  context: ToolExecutionContext;
  originalUrl: string;
  url: URL;
}): Promise<FetchAndExtractContentResult> {
  const httpClientPort = options.context.httpClientPort;
  if (!httpClientPort) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "HttpClientPort is not configured for WebFetch tool",
      {
        context: {
          toolCallId: options.context.toolCallId,
          toolName: WEBFETCH_TOOL_NAME,
        },
        recoverable: false,
      },
    );
  }

  const redirects: WebFetchRedirect[] = [];
  let currentUrl = options.url;
  let response: HttpClientResponse | undefined;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    // Kaguya Code WebFetch 从 agent runtime 所在机器出网；移除 DNS preflight 后，
    // 每个真实 GET 前仍要阻断 URL 字面量本地/私网目标，避免 NO_PROXY 绕过安全边界。
    await assertWebFetchLiteralEgress(currentUrl);

    const requestId = `net_${crypto.randomUUID()}`;
    const requestStartedAt = new Date();
    await emitNetworkRequestStatus(options.context, {
      method: "GET",
      requestId,
      source: "http_client",
      startedAt: requestStartedAt.toISOString(),
      status: "pending",
      toolCallId: options.context.toolCallId,
      toolName: WEBFETCH_TOOL_NAME,
      url: currentUrl.toString(),
    });

    try {
      response = await httpClientPort.request(
        {
          url: currentUrl.toString(),
          method: "GET",
          headers: webFetchHeaders(),
          timeoutMs: DEFAULT_WEBFETCH_TIMEOUT_MS,
          maxResponseBytes: MAX_WEBFETCH_RESPONSE_BYTES,
          redirect: "manual",
          trace: traceFromContext(options.context),
        },
        { signal: options.context.abortSignal },
      );
      await emitNetworkRequestStatus(options.context, {
        completedAt: new Date().toISOString(),
        durationMs: response.durationMs,
        egress: response.egress,
        method: "GET",
        requestId,
        source: "http_client",
        startedAt: requestStartedAt.toISOString(),
        status: "complete",
        statusCode: response.status,
        toolCallId: options.context.toolCallId,
        toolName: WEBFETCH_TOOL_NAME,
        url: response.url,
      });
    } catch (error) {
      // Node/undici 的顶层网络错误常只有 "fetch failed"，需要把最底层 cause
      // 和 code 暴露给用户，否则连接重置、DNS、代理等不同问题在工具结果里完全不可区分。
      const errorMessage = formatWebFetchRequestError(error, currentUrl);
      await emitNetworkRequestStatus(options.context, {
        completedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - requestStartedAt.getTime()),
        error: errorMessage,
        method: "GET",
        requestId,
        source: "http_client",
        startedAt: requestStartedAt.toISOString(),
        status: "error",
        statusCode: isHttpClientPortError(error) ? error.status : undefined,
        toolCallId: options.context.toolCallId,
        toolName: WEBFETCH_TOOL_NAME,
        url: currentUrl.toString(),
      });
      if (isHttpClientPortError(error) && error.code === "too_large") {
        throw webFetchError("ResponseTooLarge", error.message, { url: error.url }, error);
      }
      if (isHttpClientPortError(error) && error.code === "egress_blocked") {
        const domain = currentUrl.hostname;
        throw webFetchError(
          "EgressBlocked",
          errorMessage,
          {
            domain,
            error_type: "EGRESS_BLOCKED",
            url: currentUrl.toString(),
          },
          error,
        );
      }
      throw webFetchError(
        "FetchFailed",
        errorMessage,
        { url: currentUrl.toString() },
        error,
      );
    }

    // 网络层按响应类别收口，避免重定向/HTTP 错误误进入正文抽取和模型处理。
    if (!isRedirectStatus(response.status)) break;
    const redirect = classifyRedirect(response, currentUrl, redirects, options.originalUrl);
    if (isFetchTerminalResult(redirect)) return redirect;
    currentUrl = redirect;
  }

  if (!response) {
    throw webFetchError("FetchFailed", "WebFetch did not receive a response", {
      url: options.originalUrl,
    });
  }

  if (isRedirectStatus(response.status)) {
    throw webFetchError("TooManyRedirects", "WebFetch exceeded the safe redirect limit", {
      maxRedirects: MAX_REDIRECTS,
      url: currentUrl.toString(),
    });
  }

  throwIfProxyBlocked(response, currentUrl);

  if (!isSuccessfulStatus(response.status)) {
    return toHttpErrorFetchContent(response, currentUrl, redirects, options.originalUrl);
  }

  const contentType = readHeader(response.headers, "content-type") ?? "";
  const content = extractReadableContent(response.body, contentType);
  const artifact = await maybePersistRawContent(content, contentType, options.context);

  return {
    artifactPath: artifact?.path,
    artifactUri: artifact?.uri,
    bytes: response.bytes,
    content,
    contentType,
    finalUrl: currentUrl.toString(),
    redirects,
    sizeBytes: Buffer.byteLength(content, "utf8"),
    status: response.status,
    statusText: response.statusText,
  };
}

function classifyRedirect(
  response: HttpClientResponse,
  currentUrl: URL,
  redirects: WebFetchRedirect[],
  originalUrl: string,
): HttpErrorFetchContent | RedirectFetchContent | URL {
  const location = readHeader(response.headers, "location");
  if (typeof location !== "string" || location.trim() === "") {
    return toHttpErrorFetchContent(response, currentUrl, redirects, originalUrl);
  }

  const nextUrl = resolveRedirectUrl(location, currentUrl);
  const displayNextUrl = redactUrlCredentials(nextUrl);
  const redirect = {
    from: currentUrl.toString(),
    to: displayNextUrl,
    status: response.status,
  };
  if (!isPermittedRedirect(currentUrl, nextUrl)) {
    return {
      type: "redirect",
      originalUrl: currentUrl.toString(),
      redirectUrl: displayNextUrl,
      redirects: [...redirects, redirect],
      status: response.status,
      statusText: response.statusText,
    };
  }
  redirects.push(redirect);
  return nextUrl;
}

function toHttpErrorFetchContent(
  response: HttpClientResponse,
  currentUrl: URL,
  redirects: WebFetchRedirect[],
  originalUrl: string,
): HttpErrorFetchContent {
  const retryAfter = readHeader(response.headers, "retry-after");
  return {
    type: "http_error",
    finalUrl: currentUrl.toString(),
    originalUrl,
    redirects,
    retryAfter:
      typeof retryAfter === "string" && /^[0-9]{1,6}$/u.test(retryAfter) ? retryAfter : undefined,
    status: response.status,
    statusText: response.statusText,
  };
}

function throwIfProxyBlocked(response: HttpClientResponse, currentUrl: URL): void {
  if (readHeader(response.headers, "x-proxy-error") !== "blocked-by-allowlist") return;

  const domain = currentUrl.hostname;
  throw webFetchError(
    "EgressBlocked",
    JSON.stringify({
      error_type: "EGRESS_BLOCKED",
      domain,
      message: `Access to ${domain} is blocked by the network egress proxy.`,
    }),
    {
      domain,
      error_type: "EGRESS_BLOCKED",
      url: currentUrl.toString(),
    },
  );
}

function formatEgressBlockedMessage(message: string, domain: string): string {
  // 底层 public egress 会看到 DNS 解析结果，但 WebFetch 错误会进入模型上下文，
  // 不能把被阻断域名解析出的内网/metadata IP 当作探测结果暴露给模型。
  if (message.includes("resolved to")) {
    return `HTTP public egress blocked ${domain} because it resolved to a non-public address`;
  }
  return message;
}

function formatWebFetchRequestError(error: unknown, currentUrl: URL): string {
  if (isHttpClientPortError(error) && error.code === "egress_blocked") {
    return formatEgressBlockedMessage(error.message, currentUrl.hostname);
  }
  return formatRequestError(error);
}

function isFetchTerminalResult(
  value: HttpErrorFetchContent | RedirectFetchContent | URL,
): value is HttpErrorFetchContent | RedirectFetchContent {
  return !(value instanceof URL);
}

function webFetchHeaders(): Record<string, string> {
  return {
    "User-Agent": WEBFETCH_USER_AGENT,
    Accept: "text/markdown, text/html, */*",
  };
}

function formatRequestError(error: unknown): string {
  const fallback = error instanceof Error ? error.message : "WebFetch request failed";
  const concreteCause = deepestCauseDetails(error);
  const compactCause = compactKnownNetworkCauseMessage(concreteCause);
  if (compactCause) return compactCause;
  const concreteCauseMessage = concreteCause?.message;
  const fallbackWithCode = appendErrorCode(fallback, concreteCause?.code);
  if (!concreteCauseMessage || concreteCauseMessage === fallback) return fallbackWithCode;
  return `${fallback}: ${appendErrorCode(concreteCauseMessage, concreteCause.code)}`;
}

function compactKnownNetworkCauseMessage(
  cause: { message?: string; code?: string } | undefined,
): string | undefined {
  if (!cause?.message) return undefined;
  const connectTimeoutMatch = cause.message.match(
    /^Connect Timeout Error \(attempted address: .+:(\d+), timeout: ([^)]+)\)$/u,
  );
  if (connectTimeoutMatch?.[1] && connectTimeoutMatch[2]) {
    return `Connect Timeout Error (${connectTimeoutMatch[1]}, timeout ${connectTimeoutMatch[2]})`;
  }
  return undefined;
}

function deepestCauseDetails(error: unknown): { message?: string; code?: string } | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let message: string | undefined;
  let code: string | undefined;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === "string" && current.trim()) {
      message = current.trim();
      break;
    }
    if (!(current instanceof Error)) break;

    if (current.message.trim()) {
      message = current.message.trim();
    }
    code = readErrorCode(current) ?? code;
    current = current.cause;
  }

  if (!message && !code) return undefined;
  return { code, message };
}

function readErrorCode(error: Error): string | undefined {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code.trim() : undefined;
}

function appendErrorCode(message: string, code: string | undefined): string {
  if (!code || message.includes(code)) return message;
  return `${message} (${code})`;
}

function readHeader(headers: Record<string, string>, name: string): string | undefined {
  const normalizedName = name.toLowerCase();
  return (
    headers[normalizedName] ??
    Object.entries(headers).find(([key]) => key.toLowerCase() === normalizedName)?.[1]
  );
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isSuccessfulStatus(status: number): boolean {
  return status >= 200 && status < 300;
}
