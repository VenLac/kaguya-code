import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_FRAME_DT,
  MOON_MOTION,
  WAKE_FRAME_DT,
  approach,
  frameDelta,
  mapPointerToCanvas,
  needsRebuild,
  resolveCanvasMetrics,
  type CanvasSignature,
} from "../src/moon/moonMotion.js";

/** 以固定帧率逼近 target，返回每一帧的值（从 0 → 1）。 */
function stepResponse(rate: number, fps: number, seconds: number): number[] {
  const dt = 1 / fps;
  const out: number[] = [];
  let value = 0;
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    value = approach(value, 1, rate, dt);
    out.push(value);
  }
  return out;
}

test("字符位移 100ms 内到达 90% 以上，且任何时刻都不过冲", () => {
  const frames = stepResponse(MOON_MOTION.pushRate, 60, 1);
  assert.ok(frames[5]! >= 0.9, `6 帧（100ms）后应 >= 0.9，实际 ${frames[5]}`);
  assert.ok(Math.max(...frames) <= 1, "一阶逼近不应超过目标");
});

test("光源 200ms 内到达 85% 以上", () => {
  const frames = stepResponse(MOON_MOTION.lightRate, 60, 1);
  assert.ok(frames[11]! >= 0.85, `12 帧（200ms）后应 >= 0.85，实际 ${frames[11]}`);
});

test("approach 与帧率无关：同样的时长，60fps 与 30fps 结果一致", () => {
  const at60 = stepResponse(MOON_MOTION.pushRate, 60, 0.2).at(-1)!;
  const at30 = stepResponse(MOON_MOTION.pushRate, 30, 0.2).at(-1)!;
  assert.ok(Math.abs(at60 - at30) < 1e-9);
});

test("尺寸解析取布局尺寸：scale(0.9) 下 rect 为 446、布局为 496 时按 496 建画布", () => {
  const metrics = resolveCanvasMetrics(496, 496, 1.33);
  assert.equal(metrics.width, 496);
  assert.equal(metrics.pixelWidth, Math.round(496 * 1.33));
  assert.equal(metrics.dpr, 1.33);
});

test("dpr 上限 1.5，尺寸至少 1", () => {
  assert.equal(resolveCanvasMetrics(100, 100, 3).dpr, 1.5);
  const empty = resolveCanvasMetrics(0, 0, 1);
  assert.equal(empty.pixelWidth, 1);
  assert.equal(empty.pixelHeight, 1);
});

test("指针换算：容器缩放 0.9 时，屏幕中心对应画布布局中心", () => {
  // 布局 496×496，缩放 0.9 后屏幕上是 446.4×446.4，左上角在 (100, 50)
  const rect = { left: 100, top: 50, width: 446.4, height: 446.4 };
  const center = mapPointerToCanvas(100 + 223.2, 50 + 223.2, rect, 496, 496);
  assert.ok(Math.abs(center.x - 248) < 1e-9);
  assert.ok(Math.abs(center.y - 248) < 1e-9);
});

test("指针换算：无缩放时就是相对偏移；rect 为 0 时不产生 NaN", () => {
  const plain = mapPointerToCanvas(
    30,
    40,
    { left: 10, top: 10, width: 200, height: 200 },
    200,
    200,
  );
  assert.deepEqual(plain, { x: 20, y: 30 });
  const degenerate = mapPointerToCanvas(
    30,
    40,
    { left: 10, top: 10, width: 0, height: 0 },
    200,
    200,
  );
  assert.ok(Number.isFinite(degenerate.x) && Number.isFinite(degenerate.y));
});

const base: CanvasSignature = {
  width: 496,
  height: 496,
  dpr: 1.33,
  bufferWidth: 660,
  bufferHeight: 660,
};

test("重建判定：签名任一项变化都要重建，完全相同则不重建", () => {
  assert.equal(needsRebuild(null, base), true);
  assert.equal(needsRebuild(base, { ...base }), false);
  assert.equal(needsRebuild(base, { ...base, width: 446 }), true);
  assert.equal(needsRebuild(base, { ...base, height: 300 }), true);
  assert.equal(needsRebuild(base, { ...base, dpr: 1 }), true);
  assert.equal(needsRebuild(base, { ...base, bufferWidth: 446 }), true);
  assert.equal(needsRebuild(base, { ...base, bufferHeight: 90 }), true);
});

test("驱动夹紧 drawing buffer 后，以重建时记录的实际值为准，不会每帧重建", () => {
  const clamped = { ...base, bufferWidth: 512, bufferHeight: 512 };
  // 重建时记录了夹紧后的实际尺寸；之后每帧读到的还是同一组数
  assert.equal(needsRebuild(clamped, { ...clamped }), false);
});

test("步长：唤醒后第一帧固定 1/60；时间戳倒退不为负；过长被钳制", () => {
  assert.equal(frameDelta(1000, null), WAKE_FRAME_DT);
  assert.equal(frameDelta(990, 1000), 0);
  assert.ok(Math.abs(frameDelta(1016, 1000) - 0.016) < 1e-9);
  assert.equal(frameDelta(5000, 1000), MAX_FRAME_DT);
});
