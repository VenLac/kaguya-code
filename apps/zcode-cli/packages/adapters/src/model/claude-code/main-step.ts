import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from "@ai-sdk/provider";
import { buildClaudeArgs } from "./args.js";
import { CLAUDE_CODE_PROVIDER_OPTIONS_KEY, ClaudeCodeErrorCode } from "./constants.js";
import { ClaudeCodeError } from "./errors.js";
import {
  CLAUDE_EFFORT_LEVELS,
  interpretFailure,
  linkAbort,
  permissionModeFor,
} from "./model-helpers.js";
import { createClaudePermissionHandler, type ClaudeRequestContext } from "./permission.js";
import { buildClaudeContent } from "./prompt.js";
import { createSkillsPlugin, extractKaguyaSkills } from "./skills.js";
import type { ClaudeRunRequest } from "./process.js";
import { ClaudeRun } from "./run.js";
import { planClaudeSession } from "./session.js";
import { ClaudeStepMapper, toFinishReason, toLanguageModelUsage } from "./stream-mapper.js";
import type { ClaudeCodeLanguageModelOptions } from "./types.js";

/** 主回合的一个步骤：续接/新建 run，读到本步骤的 assistant 消息结束为止。 */
export async function streamMainStep(
  options: ClaudeCodeLanguageModelOptions,
  input: {
    callOptions: LanguageModelV3CallOptions;
    executable: string;
    cwd: string;
    context: ClaudeRequestContext;
    plan: Awaited<ReturnType<typeof planClaudeSession>>;
    sessionKey: string;
    requestToolNames: ReadonlySet<string>;
  },
): Promise<LanguageModelV3StreamResult> {
  const { callOptions, sessionKey, requestToolNames } = input;
  const { runtime, logger } = options;
  const lastRole = callOptions.prompt.at(-1)?.role;

  let run = runtime.runs.get(sessionKey);
  if (run?.open && lastRole === "tool") {
    // 上一步以工具调用结束，Kaguya 已记录完工具结果：继续读同一个 claude 进程的下一条消息。
  } else {
    // 新的用户输入（或旧 run 已失效）：结束遗留 run，按计划起新进程。
    run?.cancel(new DOMException("Superseded by a new request", "AbortError"));
    if (lastRole === "tool") {
      throw new ClaudeCodeError(
        ClaudeCodeErrorCode.ProtocolError,
        "与 Claude Code 的会话已中断（进程已退出），请重新发送上一条消息。",
      );
    }
    run = await startRun(options, input);
  }
  const activeRun = run;

  const stream = new ReadableStream<LanguageModelV3StreamPart>({
    start: async (controller) => {
      controller.enqueue({ type: "stream-start", warnings: [] });
      const mapper = new ClaudeStepMapper({ requestToolNames });
      const unlink = linkAbort(callOptions.abortSignal, (reason) => activeRun.cancel(reason));
      try {
        while (!mapper.stepComplete) {
          const message = await activeRun.next();
          if (!message) break;
          for (const part of mapper.map(message)) controller.enqueue(part);
        }
        if (!mapper.stepComplete) {
          throw new ClaudeCodeError(
            ClaudeCodeErrorCode.ExitedAbnormally,
            "本机 claude 在返回结果前退出。",
          );
        }
        if (!mapper.endedWithToolCalls && (!mapper.result || mapper.result.isError)) {
          throw interpretFailure(mapper);
        }
        logger?.debug("Claude Code 步骤完成", {
          module: "adapters.model",
          toolCalls: mapper.endedWithToolCalls,
        });
        controller.enqueue({
          type: "finish",
          usage: toLanguageModelUsage(mapper.usage),
          finishReason: toFinishReason({
            toolCalls: mapper.endedWithToolCalls,
            result: mapper.result,
          }),
          providerMetadata: {
            [CLAUDE_CODE_PROVIDER_OPTIONS_KEY]: {
              ...(mapper.sessionId ? { sessionId: mapper.sessionId } : {}),
              ...(mapper.result?.costUsd !== undefined ? { costUsd: mapper.result.costUsd } : {}),
            },
          },
        });
      } catch (error) {
        activeRun.cancel(error);
        controller.enqueue({ type: "error", error });
      } finally {
        unlink();
        controller.close();
      }
    },
    cancel: () => activeRun.cancel(new DOMException("Stream cancelled", "AbortError")),
  });
  return { stream };
}

async function startRun(
  options: ClaudeCodeLanguageModelOptions,
  input: {
    callOptions: LanguageModelV3CallOptions;
    executable: string;
    cwd: string;
    context: ClaudeRequestContext;
    plan: Awaited<ReturnType<typeof planClaudeSession>>;
    sessionKey: string;
  },
): Promise<ClaudeRun> {
  const { callOptions, executable, cwd, context, plan, sessionKey } = input;
  const { config, env, runtime, logger } = options;
  const content = buildClaudeContent(callOptions.prompt, plan.promptMode);
  if (content.length === 0) {
    throw new ClaudeCodeError(
      ClaudeCodeErrorCode.ProtocolError,
      "没有可发送给 Claude 的用户输入。",
    );
  }
  // Kaguya 的 skill 以临时插件交给 claude，让它用自己的 Skill 工具调用；run 结束时一并清理。
  // 生成失败（权限、磁盘等）不影响回合本身：记录后以「没有 Kaguya skill」继续。
  const skillsPlugin = await createSkillsPlugin(extractKaguyaSkills(callOptions.prompt)).catch(
    (error: unknown) => {
      logger?.warn("无法为 Claude 准备 Kaguya skill 插件，本回合不带 skill", {
        module: "adapters.model",
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    },
  );
  const effort = options.reasoningLevel;
  let args: string[];
  try {
    args = buildClaudeArgs({
      model: options.modelId,
      ...(effort && CLAUDE_EFFORT_LEVELS.has(effort) ? { effort } : {}),
      session: plan.session,
      tools: "default",
      ...(permissionModeFor(context.mode)
        ? { permissionMode: permissionModeFor(context.mode) }
        : {}),
      ...(skillsPlugin ? { pluginDir: skillsPlugin.path } : {}),
    });
  } catch (error) {
    await skillsPlugin?.cleanup();
    throw error;
  }
  logger?.info("Claude Code 请求开始", {
    event: "claude_code.request.started",
    module: "adapters.model",
    sessionMode: plan.session.kind,
    promptMode: plan.promptMode,
    modelId: options.modelId,
  });

  const handlePermission = createClaudePermissionHandler({
    broker: config.permissionBroker,
    context,
    newId: () => crypto.randomUUID(),
    beforeAsk: (request) =>
      request.toolUseId
        ? runtime.externalTools.waitUntilStarted(request.toolUseId)
        : Promise.resolve(),
  });
  const request: Omit<ClaudeRunRequest, "signal"> = {
    executable,
    args,
    cwd,
    env,
    content,
    onPermissionRequest: handlePermission,
    onDebug: (text, extra) => logger?.debug(text, { module: "adapters.model", ...extra }),
  };
  const run: ClaudeRun = new ClaudeRun({
    request,
    externalTools: runtime.externalTools,
    onEnd: () => {
      runtime.runs.delete(sessionKey, run);
      void skillsPlugin?.cleanup();
    },
  });
  runtime.runs.set(sessionKey, run);
  run.start();
  return run;
}

/** 一次性辅助请求：单次进程，禁用工具，system 提示走临时文件，文本缓冲后一次发出。 */
