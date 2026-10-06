# 字符月亮（LunarMoon）

状态：已实现（「偶发只显示一条」的根因未确认，见文末）。范围仅限 `packages/lunar-icons/src/moon/`，以及两个调用方（新会话首页、主题 Hero）传入的诊断回调。

## 背景与问题

1. **画布尺寸被入场动画污染。** 首页月亮容器有 `scale: 0.9 → 1` 的入场动画（`styles.css` 的 `lunar-moon-in`）。组件在挂载后的 `setTimeout(0)` 里用 `getBoundingClientRect()` 测量，该值包含 transform，于是画布内部分辨率按 0.9 倍确定（实测 446，而布局尺寸是 496）。ResizeObserver 只看布局尺寸，动画结束后不会重测，错误一直保留：画面被拉伸约 11%，字符的坐标系与光标坐标系错位，月球远端约偏 50px。
2. **光标不跟手。** 三层串联滤波叠加：光标平滑（约 117ms 到 90%）、字符位移的欠阻尼弹簧（过冲 33%）、光源偏移（到 90% 要 750ms）。位移幅度只有约 6px。
3. **偶发只显示一条（未定位）。** Windows 上出现过月亮只剩一条带，操作一下窗口后恢复。判断是挂载时的初始状态偏差、之后没有重建。组件现在所有失败都被 `catch {}` 吞掉，WebGL 上下文丢失后只靠 `restored` 事件恢复，没有任何自检。

## 状态所有者

`LunarMoon` 是以下状态的唯一所有者，调用方只传入 props，不读写这些状态：

| 状态                               | 所有者                   | 说明                 |
| ---------------------------------- | ------------------------ | -------------------- |
| 画布内部分辨率、网格、缓冲区、图集 | `LunarMoon`（`rebuild`） | 只由 `layout()` 写入 |
| 光标位置、光源方向、字符位移/热度  | `LunarMoon`（帧循环）    | 仅内存，不持久化     |
| 贴图                               | `texture.ts`             | 全局只读缓存         |

纯计算逻辑（滤波步进、尺寸解析、指针换算、重建判定）放在 `moonMotion.ts`，无 DOM、无 WebGL，可直接单测。

## 规则

### 尺寸与坐标

- 布局尺寸一律取 `clientWidth` / `clientHeight`，它们不受 transform（含 `scale`）影响。不再用 `getBoundingClientRect()` 的宽高作为布局尺寸。
- 指针换算：`local = (client - rect.origin) * (clientSize / rect.size)`。动画期间容器被缩放时，屏幕坐标仍能映射回画布的布局坐标。
- 画布内部分辨率 = `round(布局尺寸 × dpr)`，`dpr = min(devicePixelRatio, 1.5)`。

### 自愈

- 记录每次重建时的签名：`{ clientWidth, clientHeight, dpr, drawingBufferWidth, drawingBufferHeight }`。
- 帧循环每帧读取当前签名，与已建签名不一致就重建。这样无论是动画、缩放、DPR 变化（换屏、系统缩放）还是驱动层改了 drawing buffer，都不依赖某个事件一定触发。
- 重建后以新的实际签名为准，不会因 drawing buffer 被驱动夹紧而每帧重建。
- `gl.isContextLost()` 为真时当作上下文丢失处理，不等事件。

### 上下文丢失与恢复

- `webglcontextlost`：阻止默认行为，停止帧循环，`dataset.lunarMoon = "lost"`，记 `warn`。
- `webglcontextrestored`：重新创建 GL 资源并重建，成功则 `"ready"`，记 `info`；失败则 `"error"`，记 `warn`。
- 初始化失败（着色器编译、链接）：`dataset.lunarMoon = "error"`，记 `warn`。页面保持空白，不影响界面。
- `canvas.dataset.lunarMoon` 取值 `"ready" | "lost" | "error"`，用于排查和 E2E 断言。生产构建下 UI logger 被禁用，所以这个属性是生产环境唯一可读的现场。

### 光标交互

要点是**跟手**：无过冲，响应在人眼可感知的延迟之内。

- 光标位置不再做单独平滑，直接使用最近一次 `pointermove` 的位置。
- 字符位移用一阶指数逼近（无速度状态，因而无过冲）：靠近时 `k = 28/s`（到 90% 约 80ms），回位时 `k = 10/s`（约 230ms，柔和回落）。
- 热点符号：出现 `k = 30/s`，消退 `k = 6/s`。
- 光源偏移 `k = 12/s`（到 90% 约 190ms）。
- 最大位移 `rh × 1.0`（原 `rh × 0.7`），上限 `maxD × 1.25`；影响半径不变。
- 所有逼近都按 `dt` 做帧率无关处理：`current += (target - current) × (1 - exp(-k × dt))`。
- `dt` 不得为负：唤醒后的第一帧使用固定 `1/60`，其余用 `clamp((now - last) / 1000, 0, 0.05)`。
- `pointermove` 到达时立即进入满帧率（不再受 30fps 空闲节流影响）。

### 不变

- `prefers-reduced-motion` 下不响应光标、不自转。
- 窗口不可见时暂停。
- 不支持 WebGL2 时退化为静态一帧（Canvas 2D）。

## 对外接口

- 新增可选 prop `onDiagnostic?: (level: "info" | "warn", message: string, detail?: Record<string, unknown>) => void`。`lunar-icons` 不依赖 UI 包，因此日志由调用方注入；调用方接到 `@/logger.js`。
- 其余 props 不变。

## 验收场景

单测（`packages/lunar-icons/test/moonMotion.test.ts`）：

1. 阶跃响应：位移 `k=28` 在 100ms 内到达 ≥ 90%，且任何时刻不超过目标（无过冲）；光源 `k=12` 在 200ms 内 ≥ 85%。
2. `approach` 帧率无关：同样的总时长，60fps 与 30fps 结果一致（容差内）。
3. 尺寸解析：`scale(0.9)` 下 `clientWidth=496`、`rect.width=446` 时，布局尺寸取 496；内部分辨率 = `round(496 × dpr)`。
4. 指针换算：容器缩放 0.9、屏幕坐标在容器中心时，换算结果等于画布布局中心。
5. 重建判定：签名任一项变化返回 `true`，完全相同返回 `false`；drawing buffer 被夹紧后以实际值为准不重复重建。
6. `dt` 计算：唤醒后的第一帧为 `1/60`；`now < last` 时不为负；超过 50ms 被钳制。

手工（桌面端首页，Windows 与 Linux 各一次）：

- 入场动画结束后，`canvas.width` 等于 `round(clientWidth × dpr)`。
- 光标贴近月面时，字符在约 80ms 内被推开，不抖动。
- 快速拖动窗口、切换深浅主题、切换会话再切回，月亮始终完整。

## 未覆盖（如实说明）

「偶发只显示一条」的根因未在 Linux 软件渲染下复现。本次修订只加了自愈检查、上下文丢失处理和现场属性；如果 Windows 上仍出现，请在出现时读取 `canvas.dataset.lunarMoon`、`canvas.width/height` 与 `clientWidth/clientHeight` 并反馈。
