import {
  CLAUDE_CODE_BASE_URL,
  CLAUDE_CODE_PLACEHOLDER_API_KEY,
  isClaudeCodeBaseUrl,
} from "@zcode/shared/node";
import type { ModelConfigObject, ProviderConfigObject } from "@zcode/provider";
import { createServiceLogger } from "../logger/serviceLogger.js";
import type { IProviderSettingsService } from "../model-provider/providerFacadeServices.js";
import type { ClaudeCodeModelInfo, ClaudeCodeStatus, IClaudeCodeService } from "./claudeCode.js";
import {
  probeClaudeCode,
  probeClaudeModels,
  type ClaudeModelProbeResult,
  type ClaudeModelSpec,
  type ClaudeProbeResult,
} from "./claudeCodeProbe.js";

const logger = createServiceLogger("claude-code");

export const CLAUDE_CODE_PROVIDER_NAME = "Claude Code（本机）";
/** 默认取最高档；xhigh/max 成本很高，不放进默认可选项，需要时直接用 claude。 */
const CLAUDE_EFFORT_LEVELS = ["low", "medium", "high"] as const;

/**
 * 一个 Claude 模型的「手动模型配置」。上下文窗口与最大输出来自本机 claude 的实测
 * （不同模型差别很大：sonnet/opus 是 1M，haiku 是 200k）。
 * 个人模型落盘只允许手动字段（见 provider 包 manual-model-config）。
 */
export function buildClaudeCodeModelConfig(spec: ClaudeModelSpec): ModelConfigObject {
  return {
    enabled: true,
    properties: {
      contextWindow: spec.contextWindow,
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
      maxOutputTokens: { max: spec.maxOutputTokens },
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

interface ModelViewLike {
  readonly modelId: unknown;
  readonly enabled?: boolean;
  readonly effectiveConfig?: {
    readonly properties?: { readonly contextWindow?: unknown };
    readonly optionSpecs?: { readonly maxOutputTokens?: { readonly max?: unknown } };
  };
}

const positiveNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;

/** 模型来源视图里的模型 → 设置卡片展示用的摘要（上下文窗口/最大输出取生效配置）。 */
function toModelInfo(model: ModelViewLike): ClaudeCodeModelInfo {
  const contextWindow = positiveNumber(model.effectiveConfig?.properties?.contextWindow);
  const maxOutputTokens = positiveNumber(model.effectiveConfig?.optionSpecs?.maxOutputTokens?.max);
  return {
    id: String(model.modelId),
    enabled: model.enabled !== false,
    ...(contextWindow ? { contextWindow } : {}),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
  };
}

export interface CreateClaudeCodeServiceOptions {
  readonly providerSettings: IProviderSettingsService;
  /** 测试注入：替换对本机 claude 的探测。 */
  readonly probe?: () => Promise<ClaudeProbeResult>;
  /** 测试注入：替换对模型的实测。 */
  readonly probeModels?: (executablePath: string) => Promise<ClaudeModelProbeResult>;
}

export function createClaudeCodeService(
  options: CreateClaudeCodeServiceOptions,
): IClaudeCodeService {
  const probe = options.probe ?? (() => probeClaudeCode());
  const probeModels = options.probeModels ?? ((path: string) => probeClaudeModels(path));
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
      ...(provider
        ? {
            providerId: provider.providerId,
            modelCount: provider.models.length,
            models: provider.models.map((model) => toModelInfo(model as ModelViewLike)),
          }
        : {}),
      ...(lastError ? { error: lastError } : {}),
    };
  };

  /** 要求本机 claude 已安装且已登录；探测模型需要真实请求，未登录会全部失败。 */
  const requireReady = async (): Promise<ClaudeProbeResult & { executablePath: string }> => {
    const probed = await probe();
    if (!probed.installed || !probed.executablePath) {
      lastError = "未找到本机的 Claude Code（claude 命令）。请先安装并在终端完成登录。";
      throw new Error(lastError);
    }
    if (!probed.loggedIn) {
      lastError = "claude 还没有登录。请先在终端运行 claude 完成登录。";
      throw new Error(lastError);
    }
    return { ...probed, executablePath: probed.executablePath };
  };

  /**
   * 把实测结果同步到来源的模型列表（一次只改一个模型，每次重新取视图以拿到最新 revision）：
   * - 已有同 id 模型：更新为真实配置；
   * - 旧版本留下的别名模型（sonnet/opus/haiku）：改名为真实 id 并更新配置，保留其排序与启用状态；
   * - 其余：新增。
   */
  const syncModelList = async (
    providerId: string,
    specs: readonly ClaudeModelSpec[],
  ): Promise<void> => {
    for (const spec of specs) {
      const view = await options.providerSettings.getView();
      const provider = view.providers.find((p) => p.providerId === providerId);
      if (!provider) throw new Error("Claude Code 模型来源不存在");
      const have = new Set(provider.models.map((m) => String(m.modelId)));
      const personalConfig = buildClaudeCodeModelConfig(spec);
      const originalModelId = have.has(spec.id)
        ? spec.id
        : have.has(spec.alias)
          ? spec.alias
          : undefined;
      if (originalModelId) {
        await options.providerSettings.savePersonalModelDraft({
          providerId: providerId as never,
          originalModelId: originalModelId as never,
          nextModelId: spec.id as never,
          personalConfig,
          basedOnRevision: view.revision,
        });
      } else {
        await options.providerSettings.addPersonalModel(
          providerId as never,
          spec.id as never,
          personalConfig,
          false,
        );
      }
    }
  };

  const probeAndSync = async (providerId: string, executablePath: string): Promise<void> => {
    const { specs, failedAliases } = await probeModels(executablePath);
    if (specs.length === 0) {
      lastError = "没能从本机 claude 获取任何可用模型，请确认 claude 已登录且网络可用。";
      throw new Error(lastError);
    }
    await syncModelList(providerId, specs);
    lastError = failedAliases.length
      ? `这些模型本机 claude 不可用，已跳过：${failedAliases.join("、")}`
      : undefined;
  };

  return {
    getStatus: status,

    async enable() {
      lastError = undefined;
      const ready = await requireReady();
      let provider = await findProvider();
      if (!provider) {
        const created = await options.providerSettings.createPersonalProvider({
          providerName: CLAUDE_CODE_PROVIDER_NAME,
          initialConfig: buildClaudeCodeProviderConfig(),
        });
        provider = created.view.providers.find((p) => p.providerId === created.providerId) ?? null;
        if (!provider) throw new Error("创建 Claude Code 模型来源失败");
      }
      await probeAndSync(provider.providerId, ready.executablePath);
      logger.info(undefined, "Claude Code 模型来源已注册", { providerId: provider.providerId });
      return status();
    },

    async syncModels() {
      lastError = undefined;
      const ready = await requireReady();
      const provider = await findProvider();
      if (!provider) {
        lastError = "Claude Code 还没有启用。";
        throw new Error(lastError);
      }
      await probeAndSync(provider.providerId, ready.executablePath);
      logger.info(undefined, "Claude Code 模型已同步", { providerId: provider.providerId });
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
