/**
 * CUA 权限拖拽浮窗的 preload。
 *
 * 只暴露这个浮窗真正需要的三件事，不复用主窗口那个庞大的 preload —— 浮窗是个浮在系统设置之上
 * 的无焦点窗口，攻击面越小越好。
 *
 * `startDrag` 必须是 send 而不是 invoke：Electron 要求在 dragstart 事件链路里同步发起原生拖拽，
 * invoke 的 Promise 往返会错过 OS 的拖拽手势窗口，表现为「按住拖动但什么都没被拖出来」。
 */
import { contextBridge, ipcRenderer } from "electron";
import { PlatformChannels, type CuaPermissionKind, type Locale } from "@zcode/shared";

const CUA_PERMISSION_PANEL_STATE_CHANNEL = "zcode:cua-permission-panel-state";

interface CuaPermissionPanelState {
  permission: CuaPermissionKind;
  /** main 进程维护的 Kaguya Code 当前界面语言；浮窗不得另读系统语言或 localStorage。 */
  locale: Locale;
  /** 真实 Kaguya Code 图标（data URL）；读不到时为 null，页面保留占位图形。 */
  iconDataUrl: string | null;
}

contextBridge.exposeInMainWorld("cuaPermissionPanel", {
  /** 挂载时预热已验证的 Helper 路径 + 指纹，让后续 dragstart 能同步 startDrag。 */
  prepareDrag: () => ipcRenderer.invoke(PlatformChannels.PrepareCuaHelperPermissionDrag),
  /** 同步发起原生文件拖拽。必须在 dragstart 处理器里直接调用。 */
  startDrag: () => ipcRenderer.send(PlatformChannels.StartCuaHelperPermissionDrag),
  /** 拖拽手势结束，浮窗可以收走了。 */
  notifyDragEnded: () => ipcRenderer.send(PlatformChannels.NotifyCuaHelperPermissionDragEnded),
  /** 接收 main 推送的当前权限阶段与应用图标，用于切换文案和 tile 图标。 */
  onState: (callback: (state: CuaPermissionPanelState) => void) => {
    const listener = (_event: unknown, payload: CuaPermissionPanelState) => callback(payload);
    ipcRenderer.on(CUA_PERMISSION_PANEL_STATE_CHANNEL, listener);
    return () => ipcRenderer.removeListener(CUA_PERMISSION_PANEL_STATE_CHANNEL, listener);
  },
});
