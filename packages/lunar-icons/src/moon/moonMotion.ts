// 字符月亮的纯计算逻辑：无 DOM、无 WebGL，便于单测。规则见 docs/specs/lunar-moon.md。

/** 光标交互的响应速率（1/s）。全部是一阶逼近，无速度状态，因此不会过冲。 */
export const MOON_MOTION = {
  /** 字符被推开时的跟随速率：到 90% 约 80ms */
  pushRate: 28,
  /** 字符回位的速率：到 90% 约 230ms，柔和回落 */
  returnRate: 10,
  /** 热点符号出现 / 消退 */
  heatRiseRate: 30,
  heatFallRate: 6,
  /** 光源朝光标偏移：到 90% 约 190ms */
  lightRate: 12,
  /** 最大位移 = 行高 × 该系数 */
  maxDisplacementPerRow: 1.0,
} as const;

/** 帧间隔上限（秒）：标签页切回时避免一次性大步进。 */
export const MAX_FRAME_DT = 0.05;
/** 唤醒后第一帧使用的固定步长，避免用 performance.now() 与 rAF 时间戳相减得到负数。 */
export const WAKE_FRAME_DT = 1 / 60;
export const MAX_DPR = 1.5;

/** 帧率无关的一阶逼近：current 朝 target 前进 1 - exp(-rate·dt)。 */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * 计算本帧步长。`last === null` 表示刚被唤醒，使用固定步长；
 * 其余情况钳制到 [0, MAX_FRAME_DT]，rAF 时间戳早于 last 时不会出现负值。
 */
export function frameDelta(now: number, last: number | null): number {
  if (last === null) return WAKE_FRAME_DT;
  const dt = (now - last) / 1000;
  return dt < 0 ? 0 : dt > MAX_FRAME_DT ? MAX_FRAME_DT : dt;
}

export interface CanvasSignature {
  /** 布局尺寸（CSS px），来自 clientWidth/clientHeight，不受 transform 影响 */
  width: number;
  height: number;
  dpr: number;
  /** 驱动实际给出的 drawing buffer 尺寸（可能被夹紧） */
  bufferWidth: number;
  bufferHeight: number;
}

/** 布局尺寸 → 内部分辨率。 */
export function resolveCanvasMetrics(
  clientWidth: number,
  clientHeight: number,
  devicePixelRatio: number,
): { width: number; height: number; dpr: number; pixelWidth: number; pixelHeight: number } {
  const width = Math.max(1, clientWidth);
  const height = Math.max(1, clientHeight);
  const dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
  return {
    width,
    height,
    dpr,
    pixelWidth: Math.max(1, Math.round(width * dpr)),
    pixelHeight: Math.max(1, Math.round(height * dpr)),
  };
}

/** 已建签名与当前签名不一致即需要重建。每帧调用，必须便宜。 */
export function needsRebuild(built: CanvasSignature | null, current: CanvasSignature): boolean {
  if (!built) return true;
  return (
    built.width !== current.width ||
    built.height !== current.height ||
    built.dpr !== current.dpr ||
    built.bufferWidth !== current.bufferWidth ||
    built.bufferHeight !== current.bufferHeight
  );
}

/**
 * 屏幕坐标 → 画布布局坐标（CSS px）。
 * rect 来自 getBoundingClientRect（含 transform），client* 是布局尺寸；
 * 两者之比就是祖先累积的缩放，动画期间容器被缩放时仍能对上。
 */
export function mapPointerToCanvas(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  layoutWidth: number,
  layoutHeight: number,
): { x: number; y: number } {
  const sx = rect.width > 0 ? layoutWidth / rect.width : 1;
  const sy = rect.height > 0 ? layoutHeight / rect.height : 1;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}
