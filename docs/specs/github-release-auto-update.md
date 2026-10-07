# 自动检测更新：以 GitHub Release 为更新源

状态：代码与 CI 已实现；端到端更新流程**未在真实 Release 上验证**（见文末“验证记录”）。范围：Desktop 主进程更新器的更新源、打包产物命名、CI 发布的更新清单。不涉及更新弹窗/菜单 UI、强制更新、Web 端。

## 背景

更新器代码（启动检查、每小时轮询、下载、安装、更新说明）已完整存在，但 `initAutoUpdater({ enabled: false })` 把它整体关闭，理由是"没有更新源"。同时它的 feed 固定指向上游的 manifest 接口。

发行渠道现在是 `VenLac/kaguya-code` 的 GitHub Release（公开仓库）。CI 发布时刻意排除了 `latest*.yml`，所以 electron-updater 也读不到清单。

产品决策：启用完整的自动检测、下载、安装，更新源为 GitHub Release。

## 规则

1. **更新源。** 打包后的应用使用 electron-updater 的 `github` provider（owner `VenLac`，repo `kaguya-code`），匿名访问，不携带设备标识，不访问上游服务。
2. **开发联调通道保留。** 非打包运行且显式传入 `--zcode-update-feed-url` / `ZCODE_UPDATE_FEED_URL` 时，沿用现有 manifest provider（配合 `packages/desktop/mock-cdn`）。打包应用继续忽略该覆盖（已有行为）。
3. **只跟随正式版。** `allowPrerelease` 固定为 `false`。带连字符的标签是预发布，CI 已标记为非 Latest，不会被检测到。`receivePreviewUpdates` 设置没有 UI 入口，本变更不支持预览通道，更新器对该设置不再起作用。
4. **检测时机。** 启动时检查一次，之后每小时轮询（现有行为，不改）。`checking` / `downloading` 状态下不重复发起（现有行为）。
5. **下载与安装策略。** 沿用现有：不自动下载，用户在更新弹窗确认后下载；`autoDownloadAndInstallUpdates` 设置为 `true` 时自动下载并安装；Windows 需显式点安装，其他平台退出时安装。
6. **产物名不含空格。** GitHub 上传会把资产名里的空格替换为 `.`，而 `latest*.yml` 记录的是原始文件名，空格会让下载 404。产物名里的 `productName` 空格统一替换为 `-`（`Kaguya Code` → `Kaguya-Code`）。安装包显示名、`productName`、appId 不变。
7. **发布清单。** Release 必须附带各平台的更新清单与 blockmap：`latest.yml`（win）、`latest-linux.yml`、`latest-linux-arm64.yml`、`latest-mac.yml`，以及 `*.blockmap`。两个 macOS runner 都会产出 `latest-mac.yml`，发布前必须合并为一个，`files` 取并集，不能互相覆盖。

## 状态所有者

| 状态                            | 所有者                                                | 说明                                                     |
| ------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| 更新源选择（github / manifest） | `autoUpdater.ts` 的 `resolveUpdateFeedConfig`         | 纯函数，唯一决定 feed 的位置；`initAutoUpdater` 只调用它 |
| 更新器状态机                    | `autoUpdater.ts` 现有 `menuState`                     | 本变更不改                                               |
| 更新清单内容                    | CI release job + `scripts/merge-update-manifests.mjs` | 唯一合并点；运行时只读                                   |

事件顺序：发布 tag → 五个平台并行构建出安装包与各自的 `latest*.yml` → release job 合并同名清单 → 上传到同一个 Release → 应用轮询时读 Latest Release 的清单。Latest 指向的 Release 在附件上传完成前可能已可见，此时清单读取 404；更新器把它当作一次失败的检查，下一个轮询周期重试（现有错误处理，不新增兜底）。

## 已知限制（如实记录，不在本次解决）

- **macOS 未签名。** CI 默认不签名 mac 包。Squirrel.Mac 安装时校验签名，未签名包可以检测、下载，但安装会失败。需要签名后才完整可用；本变更不处理签名。
- **deb / rpm / pacman** 的安装需要系统提权，由 electron-updater 调用 pkexec/sudo，不保证无交互。AppImage 与 Windows 是最可靠的路径。
- **首次发布这条链路之前的版本**（例如 1.0.3）不含启用的更新器，需要用户手动安装一次包含本变更的版本。

## 不做

- 不支持预览通道、不新增更新相关设置项。
- 不改更新弹窗、菜单、强制更新（`forceUpdateGuard` 已是空桩）。
- 不处理 macOS 签名与公证。
- 不删除 `ManifestUpdateProvider`：开发联调与 `mock-cdn` 仍使用它。

## 验收

1. `resolveUpdateFeedConfig`：打包应用 → github provider（owner/repo 正确，不含 `deviceMid`）；非打包且带 feed 覆盖 → manifest provider 且携带该 url；非打包无覆盖 → github provider。
2. `allowPrerelease` 在任何情况下都为 `false`。
3. `merge-update-manifests`：两个 `latest-mac.yml` 合并后 `files` 为并集且无重复 url，`version` 一致；版本不一致时失败并报错；其他单份清单原样输出。
4. `electron-builder.config.js` 生成的产物名模板不含空格（`Kaguya-Code-${version}-…`）。
5. 打包后 `latest*.yml` 里的 `url` / `path` 与 Release 资产名一致（逐个比对，无空格）。
6. 手动端到端：用较低版本的包 + 一个已发布的更高版本 Release，应用启动后日志出现 `update-available`，弹窗展示版本与更新说明。无法在本机完成时在汇报中明确说明。

## 验证记录

- 通过：`resolveUpdateFeedConfig` 4 项、`merge-update-manifests` 8 项（并集、去重、版本不一致失败、资产校验）；`pnpm typecheck`、`pnpm lint`（0 error）、`pnpm architecture:check --changed`。
- 既有问题，非本次引入：`tsc -p packages/desktop/tsconfig.main.json` 约 100 条报错（`pnpm typecheck` 不含该项目，`autoUpdater.ts` / `updateFeedConfig.ts` 无报错）。
- 用本地旧清单跑资产校验会失败：旧清单带空格文件名，GitHub 资产名是 `Kaguya.Code-…`，正好印证产物改名的必要性。
- **未验证**：真实 tag 触发的 CI 发布、`latest*.yml` 在 Release 上的实际内容、客户端 `update-available` 流程、macOS / Windows 安装。首次发布后需用较低版本的包做一次端到端验收（验收第 5、6 条）。
