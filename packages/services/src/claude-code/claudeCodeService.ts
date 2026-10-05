import {
  CLAUDE_CODE_BASE_URL,
  CLAUDE_CODE_PLACEHOLDER_API_KEY,
  isClaudeCodeBaseUrl,
} from "@zcode/shared/node";
import type { ModelConfigObject, ProviderConfigObject } from "@zcode/provider";
import { createServiceLogger } from "../logger/serviceLogger.js";
import type { IProviderSettingsService } from "../model-provider/providerFacadeServices.js";
import type { ClaudeCodeStatus, IClaudeCodeService } from "./claudeCode.js";
import { probeClaudeCode, type ClaudeProbeResult } from "./claudeCodeProbe.js";

const logger = createServiceLogger("claude-code");

export const CLAUDE_CODE_PROVIDER_NAME = "Claude Code（本机）";
const CLAUDE_CONTEXT_WINDOW = 200_000;
const CLAUDE_MAX_OUTPUT_TOKENS = 64_000;
/** 默认取最高档；xhigh/max 成本很高，不放进默认可选项，需要时直接用 claude。 */
const CLAUDE_EFFORT_LEVELS = ["low", "medium", "high"] as const;

/** claude 的模型别名，由 claude 自己解析到当前最新版本，随 claude 升级自动跟进。 */
export const CLAUDE_CODE_MODEL_IDS = ["sonnet", "opus", "haiku"] as const;

/**
 * 一个 Claude 模型的「手动模型配置」。
 * 个人模型落盘只允许手动字段（见 provider 包 manual-model-config）：上下文窗口、图片输入等。
 */
export function buildClaudeCodeModelConfig(): ModelConfigObject {
  return {
    enabled: true,
    properties: {
      contextWindow: CLAUDE_CONTEXT_WINDOW,
      inputFormat: { supportsImage: true, supportsVideo: false, supportsPdf: false },
      // claude 渠道不接收 response schema，声明不支持，让上层走不依赖结构化输出的路径。
      supportsJsonSchemaOutput: false,
      supportsNativeWebSearch: false,
      // system 提示由 claude 自己管理，对话中途插入的 system 消息会被忽略。
      supportsMidConversationSystem: false,
    },
    optionSpecs: {
      // 该表达式只为满足 optionSpecs 的必填项；本渠道不走 HTTP 请求体，思考强度由模型层直接读取。
      reasoningLevel: {
        values: [...CLAUDE_EFFORT_LEVELS],
        map: '{"claudeCodeEffort": reasoningLevel}',
      },
      maxOutputTokens: { max: CLAUDE_MAX_OUTPUT_TOKENS },
    },
  } as ModelConfigObject;
}

/**
 * 创建来源时的初始配置。注意不能带 group / builtinModelIds：
 * group 由创建流程自己设置为 standard-personal，传了会被拒绝。
 */
export function buildClaudeCodeProviderConfig(): ProviderConfigObject {
  return {
    // 占位 key 仅用于通过校验；本渠道不使用任何密钥。
    access: { type: "api-key", apiKey: CLAUDE_CODE_PLACEHOLDER_API_KEY },
    // 沿用 anthropic-messages 形态，靠保留域名哨兵 baseUrl 识别为本机 claude 渠道。
    api: { type: "anthropic-messages", baseUrl: CLAUDE_CODE_BASE_URL },
    personalModelIds: [],
  } as ProviderConfigObject;
}

export interface CreateClaudeCodeServiceOptions {
  readonly providerSettings: IProviderSettingsService;
  /** 测试注入：替换对本机 claude 的探测。 */
  readonly probe?: () => Promise<ClaudeProbeResult>;
}

export function createClaudeCodeService(
  options: CreateClaudeCodeServiceOptions,
): IClaudeCodeService {
  const probe = options.probe ?? (() => probeClaudeCode());
  let lastError: string | undefined;

  const findProvider = async () => {
    const view = await options.providerSettings.getView();
    return (
      view.providers.find((p) =>
        isClaudeCodeBaseUrl(p.effectiveConfig.api?.baseUrl ?? undefined),
      ) ?? null
    );
  };

  const status = async (): Promise<ClaudeCodeStatus> => {
    const [probed, provider] = await Promise.all([probe(), findProvider().catch(() => null)]);
    return {
      ...probed,
      enabled: provider !== null,
      ...(provider ? { providerId: provider.providerId, modelCount: provider.models.length } : {}),
      ...(lastError ? { error: lastError } : {}),
    };
  };

  return {
    getStatus: status,

    async enable() {
      lastError = undefined;
      const probed = await probe();
      if (!probed.installed) {
        lastError = "未找到本机的 Claude Code（claude 命令）。请先安装并在终端完成登录。";
        throw new Error(lastError);
      }
      let provider = await findProvider();
      if (!provider) {
        const created = await options.providerSettings.createPersonalProvider({
          providerName: CLAUDE_CODE_PROVIDER_NAME,
          initialConfig: buildClaudeCodeProviderConfig(),
        });
        provider = created.view.providers.find((p) => p.providerId === created.providerId) ?? null;
        if (!provider) throw new Error("创建 Claude Code 模型来源失败");
      }
      // 只增不删：不覆盖用户对已有模型的调整，也不会因为重复启用而产生重复模型。
      const have = new Set(provider.models.map((m) => String(m.modelId)));
      for (const modelId of CLAUDE_CODE_MODEL_IDS) {
        if (have.has(modelId)) continue;
        await options.providerSettings.addPersonalModel(
          provider.providerId,
          modelId as never,
          buildClaudeCodeModelConfig(),
          false,
        );
      }
      logger.info(undefined, "Claude Code 模型来源已注册", { providerId: provider.providerId });
      return status();
    },

    async disable() {
      lastError = undefined;
      const provider = await findProvider().catch(() => null);
      if (provider) {
        await options.providerSettings.deletePersonalProvider(provider.providerId);
        logger.info(undefined, "Claude Code 模型来源已移除", { providerId: provider.providerId });
      }
      return status();
    },
  };
}
