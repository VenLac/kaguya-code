import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from "@ai-sdk/provider";
import { buildClaudeArgs } from "./args.js";
import { CLAUDE_CODE_PROVIDER_OPTIONS_KEY, ClaudeCodeErrorCode } from "./constants.js";
import { ClaudeCodeError } from "./errors.js";
import { CLAUDE_EFFORT_LEVELS, interpretFailure, linkAbort } from "./model-helpers.js";
import { buildClaudeContent, extractSystemPrompt } from "./prompt.js";
import { runClaudeCli } from "./process.js";
import { ClaudeStepMapper, toFinishReason, toLanguageModelUsage } from "./stream-mapper.js";
import { createSystemPromptFile, type SystemPromptFile } from "./system-prompt-file.js";
import type { ClaudeCodeLanguageModelOptions } from "./types.js";

/** 一次性辅助请求：单次进程，禁用工具，system 提示走临时文件，文本缓冲后一次发出。 */
export async function streamEphemeral(
  options: ClaudeCodeLanguageModelOptions,
  input: {
    callOptions: LanguageModelV3CallOptions;
    executable: string;
    cwd: string;
    requestToolNames: ReadonlySet<string>;
  },
): Promise<LanguageModelV3StreamResult> {
  const { callOptions, executable, cwd } = input;
  const { env, logger } = options;
  const content = buildClaudeContent(callOptions.prompt, "ephemeral");
  if (content.length === 0) {
    throw new ClaudeCodeError(
      ClaudeCodeErrorCode.ProtocolError,
      "没有可发送给 Claude 的用户输入。",
    );
  }
  // 一次性请求的 system 提示用真正的 system prompt 传入；塞进用户消息会被 claude 当作注入而拒绝照做。
  const systemText = extractSystemPrompt(callOptions.prompt);
  const systemFile: SystemPromptFile | undefined = systemText
    ? await createSystemPromptFile(systemText)
    : undefined;

  const effort = options.reasoningLevel;
  let args: string[];
  try {
    args = buildClaudeArgs({
      model: options.modelId,
      ...(effort && CLAUDE_EFFORT_LEVELS.has(effort) ? { effort } : {}),
      session: { kind: "ephemeral" },
      tools: "none",
      ...(systemFile ? { systemPromptFile: systemFile.path } : {}),
    });
  } catch (error) {
    await systemFile?.cleanup();
    throw error;
  }
  logger?.info("Claude Code 请求开始", {
    event: "claude_code.request.started",
    module: "adapters.model",
    sessionMode: "ephemeral",
    promptMode: "ephemeral",
    modelId: options.modelId,
  });

  const abort = new AbortController();
  const unlink = linkAbort(callOptions.abortSignal, (reason) => abort.abort(reason));
  const mapper = new ClaudeStepMapper({ bufferText: true });
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
          // 一次性请求禁用了工具，不会有权限请求；万一出现一律拒绝。
          onPermissionRequest: async () => ({ behavior: "deny", message: "Tools are disabled." }),
          onDebug: (text, extra) => logger?.debug(text, { module: "adapters.model", ...extra }),
        })) {
          for (const part of mapper.map(message)) controller.enqueue(part);
        }
        const result = mapper.result;
        if (!result || result.isError) throw interpretFailure(mapper);
        controller.enqueue({
          type: "finish",
          usage: toLanguageModelUsage(result.usage),
          finishReason: toFinishReason({ toolCalls: false, result }),
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
        unlink();
        await systemFile?.cleanup();
        controller.close();
      }
    },
    cancel: () => abort.abort(),
  });
  return { stream };
}
