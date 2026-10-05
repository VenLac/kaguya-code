import { ZCODE_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV } from "@zcode/shared";
import {
  createSingleFeatureRollout,
  type SingleFeatureRollout,
  type SingleFeatureRolloutLogger,
} from "./singleFeatureRollout.js";

export { ZCODE_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV };

type DesktopContextPromptRolloutLogger = SingleFeatureRolloutLogger;
export const DESKTOP_CONTEXT_PROMPT_CACHE_TTL_MS = 60 * 60 * 1_000;

interface DesktopContextPromptConfig {
  enabled: boolean;
  configVersion?: string;
}

type DesktopContextPromptRollout = SingleFeatureRollout<DesktopContextPromptConfig>;

function resolveDesktopContextPromptConfig(payload: unknown): DesktopContextPromptConfig | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const envelope = payload as {
    code?: unknown;
    success?: unknown;
    data?: {
      configs?: {
        desktopContextPrompt?: {
          enabled?: unknown;
          config_version?: unknown;
        } | null;
      } | null;
    } | null;
  };
  if ((envelope.code !== undefined && envelope.code !== 0) || envelope.success === false) {
    return null;
  }
  const config = envelope.data?.configs?.desktopContextPrompt;
  if (config === undefined || config === null) {
    // 服务端成功响应但未下发该单功能配置，语义是未启用；不能继续沿用旧的开启快照。
    return { enabled: false };
  }
  if (typeof config?.enabled !== "boolean") {
    return null;
  }
  const configVersion =
    typeof config.config_version === "string" && config.config_version.trim().length > 0
      ? config.config_version.trim()
      : undefined;
  return {
    enabled: config.enabled,
    ...(configVersion ? { configVersion } : {}),
  };
}

export function createDesktopContextPromptRollout(options: {
  fetchConfig?: (signal: AbortSignal) => Promise<unknown>;
  logger: DesktopContextPromptRolloutLogger;
  timeoutMs?: number;
  cacheTtlMs?: number;
}): DesktopContextPromptRollout {
  return createSingleFeatureRollout<DesktopContextPromptConfig>({
    resolveConfig: resolveDesktopContextPromptConfig,
    defaultValue: { enabled: false },
    logTag: "desktop-context-prompt",
    fetchConfig: options.fetchConfig,
    logger: options.logger,
    timeoutMs: options.timeoutMs,
    cacheTtlMs: options.cacheTtlMs,
  });
}
