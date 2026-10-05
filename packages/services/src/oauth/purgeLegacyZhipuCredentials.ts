import type { ICredentialService } from "../credential/credential.js";

/** 智谱账号登录移除后残留的 OAuth 会话凭据（物理 key 固定）。 */
const LEGACY_ZHIPU_CREDENTIAL_KEYS = [
  "oauth:active_provider",
  "oauth:login_attribution",
  ...(["bigmodel", "zai"] as const).flatMap((provider) => [
    `oauth:${provider}:access_token`,
    `oauth:${provider}:refresh_token`,
    `oauth:${provider}:user_info`,
  ]),
  "zcodejwttoken",
] as const;

/** 启动时清掉旧的智谱账号会话；key 不存在时删除是幂等的，失败不影响启动。 */
export async function purgeLegacyZhipuCredentials(credentialService: ICredentialService): Promise<void> {
  await Promise.all(
    LEGACY_ZHIPU_CREDENTIAL_KEYS.map((key) => credentialService.delete(key).catch(() => undefined)),
  );
}
