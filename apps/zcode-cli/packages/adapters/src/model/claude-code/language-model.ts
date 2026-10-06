import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from "@ai-sdk/provider";
import { stat } from "node:fs/promises";
import { resolveClaudeExecutable } from "@zcode/shared/node";
import {
  CLAUDE_CODE_PROVIDER_LABEL,
  ClaudeCodeErrorCode,
  SESSION_TYPE_HEADER,
} from "./constants.js";
import { streamEphemeral } from "./ephemeral-stream.js";
import { ClaudeCodeError, claudeNotFoundError, workspaceMissingError } from "./errors.js";
import { streamMainStep } from "./main-step.js";
import {
  SESSION_HEADER,
  SESSION_ID_PREFIX,
  promptHasHistory,
  readRequestContext,
} from "./model-helpers.js";
import { planClaudeSession } from "./session.js";
import type { ClaudeCodeLanguageModelOptions } from "./types.js";

/**
 * 以 AI SDK LanguageModel 的形态把本机 claude 接入 Kaguya 的模型层。
 *
 * - 主回合：一条 Claude assistant 消息 ＝ 一个 Kaguya 模型步骤。claude 在后台进程里自己执行工具，
 *   Kaguya 的 tool executor 把这些调用当原生工具调用记录并等待结果（见 ExternalToolRegistry），
 *   因此消息片段、事件、历史、展示卡片都和原生工具一样。
 * - 一次性辅助请求（标题、摘要）：单次进程、禁用工具、不落盘。
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
    const { config, env } = this.options;
    const executable = await resolveClaudeExecutable({ explicitPath: config.executablePath, env });
    if (!executable) throw claudeNotFoundError();

    const context = readRequestContext(callOptions.providerOptions);
    const headers = callOptions.headers ?? {};
    const cwd = config.workingDirectory ?? process.cwd();
    // 修复依据：cwd 不存在时 spawn 抛 `spawn <claude> ENOENT`，曾被误报为「无法启动 claude」。
    if (!(await isDirectory(cwd))) throw workspaceMissingError(cwd);
    const kaguyaSessionId =
      context.sessionId ??
      (headers[SESSION_HEADER] ? `${SESSION_ID_PREFIX}${headers[SESSION_HEADER]}` : undefined);
    const plan = await planClaudeSession({
      kaguyaSessionId,
      sessionType: headers[SESSION_TYPE_HEADER],
      hasHistory: promptHasHistory(callOptions.prompt),
      cwd,
      env,
    });
    const requestToolNames = new Set(
      (callOptions.tools ?? []).flatMap((tool) => ("name" in tool && tool.name ? [tool.name] : [])),
    );

    if (plan.session.kind === "ephemeral") {
      return streamEphemeral(this.options, { callOptions, executable, cwd, requestToolNames });
    }
    return streamMainStep(this.options, {
      callOptions,
      executable,
      cwd,
      context,
      plan,
      sessionKey: kaguyaSessionId ?? plan.session.sessionId,
      requestToolNames,
    });
  }

  /** 主回合的一个步骤：续接/新建 run，读到本步骤的 assistant 消息结束为止。 */
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

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
