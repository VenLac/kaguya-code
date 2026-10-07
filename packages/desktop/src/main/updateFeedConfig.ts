/** 发行渠道：VenLac/kaguya-code 的 GitHub Release（公开仓库，匿名读取）。 */
export const GITHUB_UPDATE_OWNER = "VenLac";
export const GITHUB_UPDATE_REPO = "kaguya-code";

export type UpdateFeedConfig =
  | { kind: "github"; owner: string; repo: string }
  | { kind: "manifest"; manifestUrl: string };

/**
 * 更新源的唯一决策点。
 *
 * 打包应用固定走 GitHub Release；只有非打包的开发运行显式传入 feed 覆盖时，
 * 才回退到 manifest provider，配合 `packages/desktop/mock-cdn` 联调。
 * 打包应用忽略覆盖是为了避免更新请求被环境变量或启动参数改道。
 */
export function resolveUpdateFeedConfig(input: {
  isPackaged: boolean;
  updateFeedUrl?: string;
}): UpdateFeedConfig {
  const manifestUrl = input.updateFeedUrl?.trim();
  if (!input.isPackaged && manifestUrl) {
    return { kind: "manifest", manifestUrl };
  }
  return { kind: "github", owner: GITHUB_UPDATE_OWNER, repo: GITHUB_UPDATE_REPO };
}
