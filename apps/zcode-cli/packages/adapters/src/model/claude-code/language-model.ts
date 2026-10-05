import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from "@ai-sdk/provider";
import type { Logger, PermissionBrokerPort } from "@zcode/contracts";
import { resolveClaudeExecutable } from "@zcode/shared/node";
import { buildClaudeArgs } from "./args.js";
import {
  CLAUDE_CODE_PROVIDER_LABEL,
  CLAUDE_CODE_PROVIDER_OPTIONS_KEY,
  ClaudeCodeErrorCode,
  SESSION_TYPE_HEADER,
} from "./constants.js";
import { ClaudeCodeError, claudeAuthRequiredError, claudeNotFoundError } from "./errors.js";
import { createClaudePermissionHandler, type ClaudeRequestContext } from "./permission.js";
import { buildClaudeContent, extractSystemPrompt } from "./prompt.js";
import { runClaudeCli } from "./process.js";
import { planClaudeSession } from "./session.js";
import { createSystemPromptFile, type SystemPromptFile } from "./system-prompt-file.js";
import { ClaudeStreamMapper, toFinishReason, toLanguageModelUsage } from "./stream-mapper.js";

const SESSION_HEADER = "x-session-id";
const SESSION_ID_PREFIX = "sess_";
/** claude --effort 接受的取值；Kaguya 里其他取值（如 ultra）不传，用 claude 自身默认。 */
const CLAUDE_EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh", "max"]);
const AUTH_FAILURE_ASSISTANT_ERROR = "authentication_failed";
/** 兜底：旧版本 claude 没有结构化错误标记时，从结果文案识别未登录。 */
const AUTH_FAILURE_TEXT = /\/login|not logged in|invalid api key|authentication/i;

export interface ClaudeCodeExecutionConfig {
  /** 本会话的工作区目录；claude 在该目录下运行并以此归档会话 jsonl。 */
  workingDirectory?: string;
  permissionBroker?: PermissionBrokerPort;
  /** 显式指定 claude 可执行文件路径；缺省按 PATH 与常见目录查找。 */
  executablePath?: string;
}

interface ClaudeCodeLanguageModelOptions {
  modelId: string;
  config: ClaudeCodeExecutionConfig;
  env: Record<string, string | undefined>;
  reasoningLevel?: string;
  logger?: Logger;
}

function readRequestContext(
  providerOptions: LanguageModelV3CallOptions["providerOptions"],
): ClaudeRequestContext {
  const raw = providerOptions?.[CLAUDE_CODE_PROVIDER_OPTIONS_KEY] as
    | Record<string, unknown>
    | undefined;
  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value ? value : undefined;
  return {
    sessionId: text(raw?.sessionId),
    traceId: text(raw?.traceId),
    turnId: text(raw?.turnId),
  };
}

function promptHasHistory(prompt: LanguageModelV3CallOptions["prompt"]): boolean {
  let end = prompt.length;
  while (end > 0 && prompt[end - 1]?.role === "user") end -= 1;
  return prompt.slice(0, end).some((message) => message.role !== "system");
}

/** run 以 is_error 结束时，把它翻译成稳定错误码。 */
function interpretFailure(mapper: ClaudeStreamMapper): ClaudeCodeError {
  const result = mapper.result;
  if (
    mapper.assistantError === AUTH_FAILURE_ASSISTANT_ERROR ||
    (result?.resultText && AUTH_FAILURE_TEXT.test(result.resultText))
  ) {
    return claudeAuthRequiredError();
  }
  return new ClaudeCodeError(
    ClaudeCodeErrorCode.RunFailed,
    result?.resultText?.trim() || "Claude Code 运行失败。",
    { details: { subtype: result?.subtype } },
  );
}

/**
 * 以 AI SDK LanguageModel 的形态把本机 claude 接入 Kaguya 的模型层。
 * 认证、工具执行、权限判定、上下文压缩都由 claude 自己完成；这里只做协议转换。
 */
export class ClaudeCodeLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = CLAUDE_CODE_PROVIDER_LABEL;
  readonly supportedUrls = {};

  constructor(private readonly options: ClaudeCodeLanguageModelOptions) {}

  get modelId(): string {
    return this.options.modelId;
  }

  async doStream(callOptions: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const { config, env, logger } = this.options;
    const executable = await resolveClaudeExecutable({ explicitPath: config.executablePath, env });
    if (!executable) throw claudeNotFoundError();

    const context = readRequestContext(callOptions.providerOptions);
    const headers = callOptions.headers ?? {};
    const cwd = config.workingDirectory ?? process.cwd();
    const plan = await planClaudeSession({
      kaguyaSessionId:
        context.sessionId ??
        (headers[SESSION_HEADER] ? `${SESSION_ID_PREFIX}${headers[SESSION_HEADER]}` : undefined),
      sessionType: headers[SESSION_TYPE_HEADER],
      hasHistory: promptHasHistory(callOptions.prompt),
      cwd,
      env,
    });
    const content = buildClaudeContent(callOptions.prompt, plan.promptMode);
    if (content.length === 0) {
      throw new ClaudeCodeError(
        ClaudeCodeErrorCode.ProtocolError,
        "没有可发送给 Claude 的用户输入。",
      );
    }

    const ephemeral = plan.session.kind === "ephemeral";
    // 一次性请求的 system 提示用真正的 system prompt 传入；塞进用户消息会被 claude 当作注入而拒绝照做。
    const systemText = ephemeral ? extractSystemPrompt(callOptions.prompt) : undefined;
    const systemFile: SystemPromptFile | undefined = systemText
      ? await createSystemPromptFile(systemText)
      : undefined;

    const effort = this.options.reasoningLevel;
    let args: string[];
    try {
      args = buildClaudeArgs({
        model: this.options.modelId,
        ...(effort && CLAUDE_EFFORT_LEVELS.has(effort) ? { effort } : {}),
        session: plan.session,
        tools: ephemeral ? "none" : "default",
        ...(systemFile ? { systemPromptFile: systemFile.path } : {}),
      });
    } catch (error) {
      await systemFile?.cleanup();
      throw error;
    }
    logger?.info("Claude Code 请求开始", {
      event: "claude_code.request.started",
      module: "adapters.model",
      sessionMode: plan.session.kind,
      promptMode: plan.promptMode,
      modelId: this.options.modelId,
    });

    const abort = new AbortController();
    const onExternalAbort = (): void => abort.abort(callOptions.abortSignal?.reason);
    if (callOptions.abortSignal?.aborted) abort.abort(callOptions.abortSignal.reason);
    callOptions.abortSignal?.addEventListener("abort", onExternalAbort, { once: true });

    const mapper = new ClaudeStreamMapper({ bufferText: ephemeral });
    const handlePermission = createClaudePermissionHandler({
      broker: config.permissionBroker,
      context,
      newId: () => crypto.randomUUID(),
    });

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: async (controller) => {
        controller.enqueue({ type: "stream-start", warnings: [] });
        try {
          for await (const message of runClaudeCli({
            executable,
            args,
            cwd,
            env,
            content,
            signal: abort.signal,
            onPermissionRequest: handlePermission,
            onDebug: (text, extra) => logger?.debug(text, { module: "adapters.model", ...extra }),
          })) {
            for (const part of mapper.map(message)) controller.enqueue(part);
          }
          const result = mapper.result;
          if (!result || result.isError) throw interpretFailure(mapper);
          controller.enqueue({
            type: "finish",
            usage: toLanguageModelUsage(result.usage),
            finishReason: toFinishReason(result),
            providerMetadata: {
              [CLAUDE_CODE_PROVIDER_OPTIONS_KEY]: {
                ...(mapper.sessionId ? { sessionId: mapper.sessionId } : {}),
                ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
              },
            },
          });
        } catch (error) {
          controller.enqueue({ type: "error", error });
        } finally {
          callOptions.abortSignal?.removeEventListener("abort", onExternalAbort);
          await systemFile?.cleanup();
          controller.close();
        }
      },
      cancel: () => abort.abort(),
    });
    return { stream };
  }

  async doGenerate(
    callOptions: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { stream } = await this.doStream(callOptions);
    const reader = stream.getReader();
    let text = "";
    let finish: Extract<LanguageModelV3StreamPart, { type: "finish" }> | undefined;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === "text-delta") text += value.delta;
      else if (value.type === "finish") finish = value;
      else if (value.type === "error") throw value.error;
    }
    if (!finish) {
      throw new ClaudeCodeError(
        ClaudeCodeErrorCode.ProtocolError,
        "Claude Code 没有返回完整结果。",
      );
    }
    return {
      content: [{ type: "text", text }],
      finishReason: finish.finishReason,
      usage: finish.usage,
      providerMetadata: finish.providerMetadata,
      warnings: [],
    };
  }
}
