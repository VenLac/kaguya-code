import type { ApiClient } from "@zcode/shared";
import type { OAuthRuntimeConfig } from "../runtimeConfig.js";
import type { OAuthProviderAdapter } from "./providerAdapter.js";

/**
 * 智谱平台（BigModel / Z.ai）账号登录已整体移除：不再创建任何 OAuth provider adapter，
 * 因此无法发起登录、也不会恢复历史会话。模型访问改用 API Key，或 Codex（ChatGPT 账号）渠道。
 */
export function createOAuthProviderAdapters(
  _config: OAuthRuntimeConfig,
  _options: { apiClient?: ApiClient } = {},
): OAuthProviderAdapter[] {
  return [];
}

export type { OAuthProviderAdapter, OAuthProviderContext } from "./providerAdapter.js";
