import type {
  CuaPermissionKind,
  Locale,
  PrepareCuaHelperPermissionDragResult,
} from "@zcode/shared";
import { resolveCuaPermissionPanelMessages } from "./cuaPermissionPanelMessages.js";

interface CuaPermissionPanelState {
  permission: CuaPermissionKind;
  locale: Locale;
  iconDataUrl: string | null;
}

declare global {
  interface Window {
    cuaPermissionPanel?: {
      prepareDrag?(): Promise<PrepareCuaHelperPermissionDragResult>;
      startDrag?(): void;
      notifyDragEnded?(): void;
      onState?(callback: (state: CuaPermissionPanelState) => void): () => void;
    };
  }
}

const bridge = window.cuaPermissionPanel;
const tile = document.getElementById("tile");
const hintPrefix = document.getElementById("hintPrefix");
const permissionLabel = document.getElementById("permissionLabel");
const hintSuffix = document.getElementById("hintSuffix");
const completion = document.getElementById("completion");
const icon = document.querySelector<HTMLElement>(".icon");

// 挂载即预热：install+verify 是异步的，必须在用户开始拖之前完成，
// 否则 dragstart 里无法同步发起拖拽（等 I/O 就会错过手势窗口）。
// 顺便拿回 Helper 的真实 display name —— tile 必须显示它而不是硬编码字符串，
// 因为 macOS 权限列表里那一行的名字就是这个值（dev 下带 Dev 后缀），
// 两边一致用户才能确认「拖进去的就是它」。
bridge
  ?.prepareDrag?.()
  .then((result) => {
    const appName = document.getElementById("appName");
    if (result?.helperDisplayName && appName) {
      appName.textContent = result.helperDisplayName;
    }
  })
  .catch(() => {});

bridge?.onState?.((state) => {
  const messages = resolveCuaPermissionPanelMessages(state.locale, state.permission);
  document.documentElement.lang = state.locale;
  document.title = messages.documentTitle;
  if (tile) tile.title = messages.dragTitle;
  if (hintPrefix) hintPrefix.textContent = messages.hintPrefix;
  if (permissionLabel) permissionLabel.textContent = messages.permissionLabel;
  if (hintSuffix) hintSuffix.textContent = messages.hintSuffix;
  if (completion) completion.textContent = messages.completion;
  // 用真实 Kaguya Code 图标替换占位渐变，和系统设置列表里那一行的图标保持一致。
  if (state.iconDataUrl && icon) {
    icon.style.backgroundImage = `url("${state.iconDataUrl}")`;
  }
});

let dragStarted = false;

tile?.addEventListener("dragstart", (event) => {
  // 必须阻止 HTML5 默认拖拽，改由 main 用 webContents.startDrag 发起原生文件拖拽——
  // 只有原生 drag session 才能被系统设置的权限列表接收。
  event.preventDefault();
  dragStarted = true;
  bridge?.startDrag?.();
});

// 拖完授权即完成，浮窗该让位。用拖拽结束而不是在 dragstart 里就收窗：startDrag 只是
// 把 drag session 交给 OS（非阻塞），drag source 立刻消失可能打断正在进行的拖拽。
const notifyDragEnded = () => {
  if (!dragStarted) return; // 只点一下没拖，不该关窗。
  dragStarted = false;
  bridge?.notifyDragEnded?.();
};

// preventDefault 之后 dragend 是否仍触发取决于 Electron 实现，所以再用 mouseup 兜一层
// （原生 drag session 结束后鼠标事件回到页面）。两个信号都受 dragStarted 约束，且 main
// 侧 hide 是幂等的，重复通知无害。收不到任何信号时仍有 freezePosition 兜底：浮窗不乱跑。
tile?.addEventListener("dragend", notifyDragEnded);
document.addEventListener("mouseup", notifyDragEnded);
