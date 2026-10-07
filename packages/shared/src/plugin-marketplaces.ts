export interface DefaultPluginMarketplace {
  id: string;
  source: string;
  name: string;
  description: string;
  pluginCount: number;
  lastUpdated?: string;
}

export const ZCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID = "zcode-plugins-official";

/** Settings 三类资源发现共用；Bootstrap 单测与官方 definition 的 defaultEnabled 机械对照。 */
export const DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS: ReadonlySet<string> = new Set([
  "browser-use@zcode-plugins-official",
  "image-search@zcode-plugins-official",
  "documents@zcode-plugins-official",
  "pdf@zcode-plugins-official",
  "presentations@zcode-plugins-official",
  "spreadsheets@zcode-plugins-official",
  // node_repl 宿主：不进市场、不对用户露出，也不贡献任何 skill/command/subagent，但必须
  // 始终可用 —— node_repl 的注册门禁是「Browser Use 或 Computer Use 任一启用」，宿主自己
  // 不参与那个判断。Browser Use 默认开着，宿主若默认关就等于它上来就没有宿主。
  "node-repl-host@zcode-plugins-official",
  "skill-creator@zcode-plugins-official",
  "frontend-design@zcode-plugins-official",
  "plugin-creator@zcode-plugins-official",
  "zcode-guide@zcode-plugins-official",
  // 电脑控制回退为默认关闭，故 computer-use 不在此名单内。
  // 该集合必须与 official-plugin-definitions.ts 里标了 defaultEnabled 的插件逐一对应，
  // bootstrap 的「Settings 默认启用集合与 CLI 的官方插件声明一致」单测机械对照两者。
]);

/**
 * 对用户隐藏的官方插件：node-repl-host 是 Browser Use 与 Computer Use 共用的运行时宿主，
 * 没有 skill / command / subagent，必须始终启用（见上面的默认启用集合）。设置页列出它会让用户
 * 能把它关掉（Browser Use 随即失去宿主），@ 引用 Picker 列出它则毫无意义，两处共用这一判定。
 * 只按官方市场里的具名 id 判断，不误伤第三方市场的同名插件。
 */
const HIDDEN_OFFICIAL_PLUGIN_IDS: ReadonlySet<string> = new Set([
  "node-repl-host@zcode-plugins-official",
]);

export function isUserVisiblePluginId(pluginId: string): boolean {
  return !HIDDEN_OFFICIAL_PLUGIN_IDS.has(pluginId);
}

export const DEFAULT_PLUGIN_MARKETPLACES: DefaultPluginMarketplace[] = [
  {
    // Kaguya Code 官方唯一市场：本地 seed 分片与 CDN 分片在 Agent storage 内合并。
    // CDN manifest 的 name 必须与该 canonical id 一致。
    id: ZCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID,
    source: "https://cdn-zcode.z.ai/zcode/official-plugin/marketplace.json",
    name: ZCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID,
    description: "Official Kaguya Code plugins marketplace: built-in and community plugins for Kaguya Code.",
    pluginCount: 0,
  },
];

// 商店「公开」分段只有一个 Kaguya Code 官方市场 id，内置与 CDN 不再拆分身份。
export const PUBLIC_STORE_MARKETPLACE_IDS = [ZCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID] as const;

export function isPublicStoreMarketplaceId(id: string): boolean {
  return (PUBLIC_STORE_MARKETPLACE_IDS as readonly string[]).includes(id);
}
