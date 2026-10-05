import {
  CODEX_API_BASE_URL,
  clearCodexAuth,
  CodexAuthError,
  ensureFreshCodexAuth,
  isCodexBaseUrl,
  readCodexAuth,
  resolveCodexAuthPath,
  startCodexLogin,
  type CodexFetch,
  type CodexLoginSession,
} from "@zcode/shared/node";
import type { ModelConfigObject, ProviderConfigObject } from "@zcode/provider";
import { createServiceLogger } from "../logger/serviceLogger.js";
import type { IProviderSettingsService } from "../model-provider/providerFacadeServices.js";
import type { CodexAuthStatus, ICodexAuthService } from "./codexAuth.js";

const logger = createServiceLogger("codex-auth");

export const CODEX_PROVIDER_NAME = "ChatGPT · Codex";
/**
 * 拉模型列表时声明的客户端版本。服务器会按 minimal_client_version 过滤模型——版本太旧只会返回
 * 一两个隐藏模型（0.99.0 实测只返回 1 个）。依次尝试，取第一个返回了可见模型的版本。
 */
const CODEX_CLIENT_VERSIONS = ["0.250.0", "1.0.0", "99.0.0"] as const;

/** 拉不到官方列表时的兜底（2026-10 账号实测可用的一批）；账号无权使用的模型可以在“模型来源”里删除。 */
export const CODEX_FALLBACK_MODELS: readonly CodexModelSpec[] = [
  { id: "gpt-5.5", efforts: ["low", "medium", "high", "xhigh"] },
  { id: "gpt-5.6-luna", efforts: ["low", "medium", "high", "xhigh", "max"] },
  { id: "gpt-5.6-terra", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] },
  { id: "gpt-5.6-sol", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] },
  { id: "gpt-6-luna", efforts: ["low", "medium", "high", "xhigh", "max"] },
  { id: "gpt-6-sol", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] },
  { id: "gpt-6-astra", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] },
  { id: "gpt-6.1-sol", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] },
];

export interface CodexModelSpec {
  readonly id: string;
  readonly efforts: readonly string[];
  readonly contextWindow?: number;
}

/**
 * 一个 GPT/Codex 模型的“手动模型配置”。
 * 个人模型落盘时只允许手动字段（见 provider 包 manual-model-config）：上下文窗口、图片输入、
 * 结构化输出等；supportsText / supportsToolCall / outputFormat 等由系统推导，maxOutputTokens 只能给上限。
 * 推理强度（reasoningLevel）可带映射表达式，映射到 Responses 的 reasoning.effort。
 */
export function buildCodexModelConfig(spec: CodexModelSpec): ModelConfigObject {
  const efforts = spec.efforts.length ? [...spec.efforts] : ["low", "medium", "high"];
  return {
    enabled: true,
    properties: {
      contextWindow: spec.contextWindow ?? 272_000,
      inputFormat: { supportsImage: true, supportsVideo: false, supportsPdf: false },
      supportsJsonSchemaOutput: true,
      supportsNativeWebSearch: false,
      // Codex 后端用 instructions 承载系统提示，不接受对话中途再插入 system 消息。
      supportsMidConversationSystem: false,
    },
    optionSpecs: {
      reasoningLevel: { values: efforts, map: '{"reasoning": {"effort": reasoningLevel, "summary": "auto"}}' },
      // 上限；ChatGPT Codex 后端不接受 max_output_tokens，请求层会把它去掉。
      maxOutputTokens: { max: 128_000 },
    },
  } as ModelConfigObject;
}

/**
 * 创建来源时的初始配置。注意不能带 group / builtinModelIds：
 * group 由创建流程自己设置为 standard-personal，传了会被拒绝（"initialConfig 不能包含 group"）。
 */
export function buildCodexProviderConfig(models: readonly CodexModelSpec[]): ProviderConfigObject {
  return {
    // 占位 key：真正的鉴权由请求层用 ChatGPT 账号令牌替换。
    access: { type: "api-key", apiKey: "codex-oauth" },
    api: { type: "openai-responses", baseUrl: CODEX_API_BASE_URL },
    personalModelIds: models.map((m) => m.id),
  } as ProviderConfigObject;
}

/** 解析 ChatGPT 后端 /models 的响应（字段名容错）。 */
export function parseCodexModelList(payload: unknown): CodexModelSpec[] {
  const raw = (payload as { models?: unknown })?.models;
  if (!Array.isArray(raw)) return [];
  const result: CodexModelSpec[] = [];
  for (const item of raw) {
    const record = item as Record<string, unknown>;
    const id = String(record.slug ?? record.id ?? "").trim();
    if (!id || record.visibility === "hide" || record.visibility === "hidden") continue;
    const levels = (record.supported_reasoning_levels ?? record.reasoning_levels) as unknown;
    const efforts = Array.isArray(levels)
      ? levels.map((l) => (typeof l === "string" ? l : String((l as { effort?: unknown })?.effort ?? ""))).filter(Boolean)
      : [];
    const context = typeof record.context_window === "number" ? record.context_window : undefined;
    result.push({ id, efforts: efforts.length ? efforts : ["low", "medium", "high"], ...(context ? { contextWindow: context } : {}) });
  }
  return result;
}

export interface CreateCodexAuthServiceOptions {
  readonly providerSettings: IProviderSettingsService;
  readonly openExternal?: (url: string) => void;
  readonly fetch?: CodexFetch;
  readonly authFilePath?: string;
}

export function createCodexAuthService(options: CreateCodexAuthServiceOptions): ICodexAuthService {
  const filePath = options.authFilePath ?? resolveCodexAuthPath();
  const fetchImpl = options.fetch ?? fetch;
  let session: CodexLoginSession | null = null;
  let lastError: string | undefined;

  const findProvider = async () => {
    const view = await options.providerSettings.getView();
    return view.providers.find((p) => isCodexBaseUrl(p.effectiveConfig.api?.baseUrl ?? undefined)) ?? null;
  };

  const status = async (): Promise<CodexAuthStatus> => {
    const record = await readCodexAuth(filePath);
    const provider = record ? await findProvider().catch(() => null) : null;
    return {
      loggedIn: Boolean(record),
      ...(record?.email ? { email: record.email } : {}),
      ...(record?.planType ? { planType: record.planType } : {}),
      loginInProgress: session !== null,
      ...(lastError ? { error: lastError } : {}),
      ...(provider ? { providerId: provider.providerId, modelCount: provider.models.length } : {}),
      ...(modelsSource ? { modelsSource } : {}),
    };
  };

  /** 模型列表的来源：live = 刚从 ChatGPT 拉到；fallback = 拉取失败，用了内置列表。 */
  let modelsSource: "live" | "fallback" | undefined;

  const fetchModels = async (): Promise<CodexModelSpec[]> => {
    try {
      const auth = await ensureFreshCodexAuth({ filePath, fetch: fetchImpl });
      if (!auth) return [];
      for (const version of CODEX_CLIENT_VERSIONS) {
        const response = await fetchImpl(`${CODEX_API_BASE_URL}/models?client_version=${version}`, {
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
            "chatgpt-account-id": auth.tokens.accountId,
            originator: "codex_cli_rs",
            accept: "application/json",
          },
        });
        if (!response.ok) {
          logger.warn("拉取 Codex 模型列表失败", { version, status: response.status });
          continue;
        }
        const list = parseCodexModelList(await response.json());
        if (list.length) return list;
        logger.info("该客户端版本下没有可见模型，尝试更高版本", { version });
      }
    } catch (error) {
      logger.warn("拉取 Codex 模型列表失败，使用内置列表", { error: String(error) });
    }
    return [];
  };

  /** 保证“ChatGPT · Codex”来源存在，并让它的模型与目标列表一致（只增删，不覆盖用户对已有模型的调整）。 */
  const syncProvider = async (): Promise<void> => {
    const fetched = await fetchModels();
    modelsSource = fetched.length ? "live" : "fallback";
    if (!fetched.length) logger.warn("未能获取在线模型列表，使用内置列表");
    const models = fetched.length ? fetched : [...CODEX_FALLBACK_MODELS];
    let provider = await findProvider();
    if (!provider) {
      const created = await options.providerSettings.createPersonalProvider({
        providerName: CODEX_PROVIDER_NAME,
        initialConfig: buildCodexProviderConfig([]),
      });
      provider = created.view.providers.find((p) => p.providerId === created.providerId) ?? null;
      if (!provider) throw new Error("创建 Codex 模型来源失败");
    }
    const have = new Set(provider.models.map((m) => String(m.modelId)));
    for (const spec of models) {
      if (have.has(spec.id)) continue;
      await options.providerSettings.addPersonalModel(provider.providerId, spec.id as never, buildCodexModelConfig(spec), false);
    }
    // 官方列表可用时，移除来源里已不在列表中的模型（兜底列表不做删除，避免误删）。
    if (fetched.length) {
      const want = new Set(fetched.map((m) => m.id));
      for (const modelId of have) {
        if (!want.has(modelId)) await options.providerSettings.deletePersonalModel(provider.providerId, modelId as never).catch(() => undefined);
      }
    }
  };

  return {
    getStatus: status,

    async startLogin() {
      session?.cancel();
      lastError = undefined;
      const next = await startCodexLogin({ filePath, fetch: fetchImpl });
      session = next;
      void next.completion
        .then(async () => {
          lastError = undefined;
          try {
            await syncProvider();
            logger.info("Codex 登录完成并已注册模型来源");
          } catch (error) {
            // 登录本身已经成功（令牌已落盘），只是注册模型来源失败：如实说明，用户可以点“同步模型”重试。
            lastError = `登录成功，但添加模型失败：${error instanceof Error ? error.message : String(error)}`;
            logger.warn("Codex 登录成功但注册模型来源失败", { error: lastError });
          }
        })
        .catch((error: unknown) => {
          // 用户主动取消不算错误。
          if (error instanceof CodexAuthError && error.code === "login-cancelled") return;
          lastError = error instanceof Error ? error.message : String(error);
          logger.warn("Codex 登录失败", { error: lastError });
        })
        .finally(() => {
          if (session === next) session = null;
        });
      options.openExternal?.(next.authorizeUrl);
      return { authorizeUrl: next.authorizeUrl };
    },

    async cancelLogin() {
      session?.cancel();
      session = null;
      return status();
    },

    async logout() {
      session?.cancel();
      session = null;
      const provider = await findProvider().catch(() => null);
      if (provider) await options.providerSettings.deletePersonalProvider(provider.providerId).catch(() => undefined);
      await clearCodexAuth(filePath);
      lastError = undefined;
      return status();
    },

    async syncModels() {
      if (!(await readCodexAuth(filePath))) throw new CodexAuthError("not-logged-in", "尚未登录 Codex");
      await syncProvider();
      return status();
    },
  };
}
