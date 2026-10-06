import { useEffect, useRef } from "react";
import {
  MOON_MOTION,
  approach,
  frameDelta,
  mapPointerToCanvas,
  needsRebuild,
  resolveCanvasMetrics,
  type CanvasSignature,
} from "./moonMotion.js";
import { getMoonTexture, getMoonTextureU8, sampleMoonTexture, TEX_H, TEX_W } from "./texture.js";

/**
 * 字符月亮：由数千个圆润字符（· ∘ c o O 0 @ ●）按明暗排布成的月球。
 * 字符固定在屏幕网格上，月面纹理在它们底下缓缓自转；光标靠近时字符被轻轻推开并泛起主题强调色，
 * 光源会朝光标偏移（像月相）。深色主题“越亮越密”，浅色主题自动反相成“越暗越密”的铅笔素描感。
 *
 * 尺寸一律取布局尺寸（clientWidth/Height，不受祖先 transform 影响），并在每帧自检，
 * 签名变化（含入场动画、缩放、DPR、drawing buffer）即重建；规则见 docs/specs/lunar-moon.md。
 *
 * 性能：WebGL2 实例化绘制——月面采样、光照、选字符全在着色器里完成，整轮月亮只有 1–2 次 draw call，
 * JS 每帧只处理光标附近被扰动的字符。无交互时降到 30fps，使用省电 GPU，窗口不可见时完全暂停。
 * 不支持 WebGL2 时退化为静态的一帧（Canvas 2D）。
 */
export interface LunarMoonProps {
  className?: string;
  /** 月亮半径占画布短边的比例，默认 0.46 */
  size?: number;
  /** 月亮中心在画布中的位置（0–1），默认居中 */
  x?: number;
  y?: number;
  /** 自转角速度（rad/s），默认 0.09；0 为静止 */
  rotationSpeed?: number;
  /** 是否响应光标（光标在窗口内任何位置都生效，因为画布本身不拦截指针） */
  interactive?: boolean;
  /** 整体不透明度，默认 1 */
  opacity?: number;
  /** 诊断日志：lunar-icons 不依赖 UI 包，由调用方接到自己的 logger */
  onDiagnostic?: (level: "info" | "warn", message: string, detail?: Record<string, unknown>) => void;
}

const RAMP = [" ", "·", ".", ":", "∘", "c", "o", "O", "0", "@", "●"] as const;
const HOT = ["·", "˙", "°", "∘", "◦", "○", "◌", "◎", "❍", "✿", "❀"] as const;
const L = RAMP.length;
const Q = 4; // 相邻两级字符之间的预混合档数
const NB = (L - 1) * Q + 1;
const NS = NB + L; // 图集精灵总数：基础 + 热点
const AC = 12; // 图集每行格数
const FONT = '"JetBrains Mono","DejaVu Sans Mono","SF Mono",Menlo,Consolas,"Noto Sans Mono",monospace';
const TILT = 0.25;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aGrid;   // 字符固定的屏幕位置 (css px)
layout(location=1) in vec4 aN;      // 视空间法线 u,v,w + 边缘微光
layout(location=2) in vec3 aDyn;    // 位移 ox,oy + 热度
uniform vec2 uRes;
uniform float uDpr, uSpr, uRows, uAC, uNB, uNL, uInvert;
uniform vec2 uCS, uCK;              // (cosθ, sinθ), (cosTilt, sinTilt)
uniform vec3 uLight;
uniform int uPass;                  // 0 = 基础字符层, 1 = 光标热点符号层
uniform sampler2D uTex;
out vec2 vUV;
out float vA;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  float u = aN.x, v = aN.y, w = aN.z;
  float y1 = v * uCK.x + w * uCK.y, z1 = -v * uCK.y + w * uCK.x;
  float xm = u * uCS.x - z1 * uCS.y, zm = u * uCS.y + z1 * uCS.x;
  vec2 tc = vec2(atan(xm, zm) / 6.28318531 + 0.5, 0.5 - asin(clamp(y1, -1.0, 1.0)) / 3.14159265);
  float alb = textureLod(uTex, tc, 0.0).r * 1.25;
  float lam = sqrt(max(0.0, dot(vec3(u, v, w), uLight)));
  float bb = clamp(alb * (0.07 + 0.93 * lam) * 1.02 + aN.w, 0.0, 1.0);
  if (uInvert > 0.5) bb = 0.08 + (1.0 - bb) * 0.9;
  float hk = aDyn.z > 0.01 ? min(1.0, aDyn.z * 1.3) : 0.0;
  float idx, alpha = 1.0;
  if (uPass == 0) {
    idx = floor(bb * (uNB - 1.0) + 0.5);
    if (hk >= 0.85 || idx < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // 空白字符不画
  } else {
    if (hk < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    idx = uNB + min(uNL - 1.0, floor(bb * (uNL - 1.0) + 0.5) + 2.0);
    alpha = hk;
  }
  vec2 tl = (aGrid + aDyn.xy) * uDpr - vec2(uSpr * 0.5);
  float still = 1.0 - smoothstep(0.0, 0.6, length(aDyn.xy) * uDpr);
  tl = mix(tl, floor(tl + 0.5), still);   // 静止时贴齐像素（字形清晰），位移时亚像素（运动顺滑）
  vec2 p = (tl + corner * uSpr) / uRes;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  vUV = (vec2(mod(idx, uAC), floor(idx / uAC)) + corner) / vec2(uAC, uRows);
  vA = alpha;
}`;
const FS = `#version 300 es
precision mediump float;
in vec2 vUV; in float vA;
uniform sampler2D uAtlas;
out vec4 o;
void main() { o = texture(uAtlas, vUV) * vA; }`;

function parseColor(css: string, fallback: [number, number, number]): [number, number, number] {
  const m = css.match(/[\d.]+/g);
  if (!m || m.length < 3) return fallback;
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}
const luminance = ([r, g, b]: [number, number, number]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function resolveCssColor(value: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

export function LunarMoon({ className, size = 0.46, x = 0.5, y = 0.5, rotationSpeed = 0.09, interactive = true, opacity = 1, onDiagnostic }: LunarMoonProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // 回调放进 ref：调用方每次渲染传新函数也不会让 effect 重跑（重跑会销毁并重建 GL 上下文）
  const diagnosticRef = useRef(onDiagnostic);
  diagnosticRef.current = onDiagnostic;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const omega = reduce ? 0 : rotationSpeed;
    const gl = cv.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
    const ctx2d = gl ? null : cv.getContext("2d");
    if (!gl && !ctx2d) return undefined;

    const report = (level: "info" | "warn", message: string, detail?: Record<string, unknown>) => diagnosticRef.current?.(level, message, detail);
    // 现场属性：生产构建下 UI logger 被禁用，排查「月亮异常」时只能读这个
    const setState = (state: "ready" | "lost" | "error") => { cv.dataset.lunarMoon = state; };

    // ---------- 布局（CSS 像素） ----------
    let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0, rh = 10, cw = 6, maxD = 7, MR = 90, sprSize = 0, N = 0;
    let gx = new Float32Array(0), gy = new Float32Array(0);
    let dyn = new Float32Array(0);
    let built: CanvasSignature | null = null;
    let invert = false;
    let atlasCv: HTMLCanvasElement | null = null;
    let staticCells: { u: number; v: number; w: number; rim: number }[] = [];

    const buildAtlas = () => {
      const cs = getComputedStyle(cv);
      const fg = parseColor(cs.color, [238, 243, 250]);
      const brandRaw = cs.getPropertyValue("--color-brand").trim();
      const brand = parseColor(brandRaw ? resolveCssColor(brandRaw) : "", [169, 214, 255]);
      invert = luminance(fg) < 0.5;
      sprSize = Math.ceil(rh * 1.6 * dpr);
      const rows = Math.ceil(NS / AC), half = sprSize / 2;
      const a = document.createElement("canvas");
      a.width = AC * sprSize; a.height = rows * sprSize;
      const g = a.getContext("2d")!;
      g.font = `500 ${rh * dpr}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
      const alphaOf = (l: number) => 0.3 + 0.7 * Math.pow(l / (L - 1), 0.8);
      const put = (k: number, ch: string, col: [number, number, number], al: number) => {
        if (ch === " ") return;
        g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${al})`;
        g.fillText(ch, (k % AC) * sprSize + half, Math.floor(k / AC) * sprSize + half);
      };
      for (let k = 0; k < NB; k++) {
        const l = Math.floor(k / Q), t = (k % Q) / Q;
        put(k, RAMP[l]!, fg, alphaOf(l) * (1 - t * 0.5));
        if (t > 0 && l + 1 < L) put(k, RAMP[l + 1]!, fg, alphaOf(l + 1) * t);
      }
      for (let l = 0; l < L; l++) put(NB + l, HOT[l]!, brand, Math.min(1, alphaOf(l) + 0.2));
      atlasCv = a;
    };

    // 当前签名：每帧与 built 比较，不一致就重建（不依赖某个事件一定触发）
    const readSignature = (): CanvasSignature => ({
      width: Math.max(1, cv.clientWidth), height: Math.max(1, cv.clientHeight),
      dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      bufferWidth: gl ? gl.drawingBufferWidth : cv.width, bufferHeight: gl ? gl.drawingBufferHeight : cv.height,
    });

    const layout = () => {
      // 布局尺寸取 clientWidth/Height：getBoundingClientRect 含 transform，入场动画的 scale(0.9)
      // 会让画布内部分辨率按 0.9 倍确定，而 ResizeObserver 不会因 transform 再次触发
      const m = resolveCanvasMetrics(cv.clientWidth, cv.clientHeight, window.devicePixelRatio);
      W = m.width; H = m.height; dpr = m.dpr;
      cv.width = m.pixelWidth; cv.height = m.pixelHeight;
      built = readSignature();
      cx = W * x; cy = H * y; R = Math.min(W, H) * size;
      rh = clamp(R * 0.034, 7, 12); cw = rh * 0.62; maxD = rh * 0.7; MR = clamp(R * 0.3, 70, 180);
      buildAtlas();
      const cols = Math.ceil((2 * R) / cw), rows = Math.ceil((2 * R) / rh);
      const x0 = cx - (cols * cw) / 2 + cw / 2, y0 = cy - (rows * rh) / 2 + rh / 2;
      const sd: number[] = [], gxA: number[] = [], gyA: number[] = [];
      staticCells = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const px = x0 + i * cw, py = y0 + j * rh, u = (px - cx) / R, v = (cy - py) / R, rr = u * u + v * v;
        if (rr > 0.992) continue;
        const w = Math.sqrt(1 - rr), e = Math.sqrt(1 - w * w), t = clamp((e - 0.93) / 0.065, 0, 1), rim = 0.12 * t * t * (3 - 2 * t);
        sd.push(px, py, u, v, w, rim); gxA.push(px); gyA.push(py);
        if (!gl) staticCells.push({ u, v, w, rim });
      }
      N = gxA.length;
      gx = Float32Array.from(gxA); gy = Float32Array.from(gyA);
      dyn = new Float32Array(N * 3);
      return new Float32Array(sd);
    };

    // ---------- WebGL ----------
    let prog: WebGLProgram | null = null, vao: WebGLVertexArrayObject | null = null;
    let bufStatic: WebGLBuffer | null = null, bufDyn: WebGLBuffer | null = null, texAlb: WebGLTexture | null = null, texAtlas: WebGLTexture | null = null;
    const U: Record<string, WebGLUniformLocation | null> = {};
    let glReady = false;

    const compile = (type: number, src: string) => {
      const s = gl!.createShader(type)!; gl!.shaderSource(s, src); gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const setupGL = () => {
      if (!gl) return;
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
      gl.useProgram(prog);
      for (const n of ["uRes", "uDpr", "uSpr", "uRows", "uAC", "uNB", "uNL", "uInvert", "uCS", "uCK", "uLight", "uPass", "uTex", "uAtlas"]) U[n] = gl.getUniformLocation(prog, n);
      vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      bufStatic = gl.createBuffer(); bufDyn = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bufStatic);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(0, 1);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8); gl.vertexAttribDivisor(1, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufDyn);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 12, 0); gl.vertexAttribDivisor(2, 1);
      texAlb = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texAlb);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, TEX_W, TEX_H, 0, gl.RED, gl.UNSIGNED_BYTE, getMoonTextureU8());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      texAtlas = gl.createTexture();
      gl.uniform1i(U.uTex!, 0); gl.uniform1i(U.uAtlas!, 1);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);
      glReady = true;
    };
    const uploadAtlas = () => {
      if (!gl || !atlasCv) return;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texAtlas);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCv);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.useProgram(prog);
      gl.uniform1f(U.uSpr!, sprSize); gl.uniform1f(U.uRows!, Math.ceil(NS / AC)); gl.uniform1f(U.uInvert!, invert ? 1 : 0);
    };
    const rebuild = () => {
      const sd = layout();
      if (gl) {
        if (!glReady) return;
        gl.useProgram(prog); gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufStatic); gl.bufferData(gl.ARRAY_BUFFER, sd, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufDyn); gl.bufferData(gl.ARRAY_BUFFER, dyn, gl.DYNAMIC_DRAW);
        gl.viewport(0, 0, cv.width, cv.height);
        gl.uniform2f(U.uRes!, cv.width, cv.height); gl.uniform1f(U.uDpr!, dpr);
        gl.uniform1f(U.uAC!, AC); gl.uniform1f(U.uNB!, NB); gl.uniform1f(U.uNL!, L);
        uploadAtlas();
      }
      needDraw = true;
    };

    // ---------- 静态回退（无 WebGL2） ----------
    const drawStatic = () => {
      if (!ctx2d || !atlasCv) return;
      const tex = getMoonTexture();
      ctx2d.setTransform(1, 0, 0, 1, 0, 0); ctx2d.clearRect(0, 0, cv.width, cv.height);
      const ck = Math.cos(TILT), sk = Math.sin(TILT), half = sprSize / 2;
      for (let i = 0; i < N; i++) {
        const c = staticCells[i]!;
        const y1 = c.v * ck + c.w * sk, z1 = -c.v * sk + c.w * ck;
        const a = sampleMoonTexture(tex, c.u, y1, z1);
        const lam = Math.max(0, c.u * -0.4 + c.v * 0.3 + c.w * 0.85);
        let b = clamp(a * (0.07 + 0.93 * Math.sqrt(lam)) * 1.02 + c.rim, 0, 1);
        if (invert) b = 0.08 + (1 - b) * 0.9;
        const idx = Math.round(b * (NB - 1)); if (idx < 1) continue;
        ctx2d.drawImage(atlasCv, (idx % AC) * sprSize, Math.floor(idx / AC) * sprSize, sprSize, sprSize, Math.round(gx[i]! * dpr - half), Math.round(gy[i]! * dpr - half), sprSize, sprSize);
      }
    };

    // ---------- 交互 ----------
    // 光标位置不再单独平滑：直接用最近一次 pointermove（已换算到画布布局坐标）。
    // 位移/热度/光源都是一阶逼近（无速度状态，无过冲），速率见 MOON_MOTION。
    let px = -9999, py = -9999, pOn = false;
    const onMove = (e: PointerEvent) => {
      px = e.clientX; py = e.clientY; pOn = true;
      busy = true; // 光标一动就满帧率，不等下一帧的 busy 判定，否则首帧会被 30fps 节流
      wake();
    };
    const onLeave = () => { pOn = false; wake(); };
    if (gl && interactive && !reduce) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("mouseleave", onLeave);
    }

    // last 为 null 表示刚被唤醒：第一帧用固定步长，避免 performance.now() 与 rAF 时间戳相减得到负数
    let theta = 0, last: number | null = null, lastDraw = 0, visible = true, raf = 0, disposed = false, needDraw = true, busy = false;
    const light = [-0.4, 0.3, 0.85], lightT = [-0.4, 0.3, 0.85];

    const handleLost = (reason: string) => {
      if (!glReady && cv.dataset.lunarMoon === "lost") return;
      glReady = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      setState("lost");
      report("warn", "WebGL 上下文丢失，等待恢复", { reason });
    };

    const frame = (now: number) => {
      raf = 0;
      if (disposed || !visible || document.hidden || !glReady || N === 0) return;
      // 上下文丢失事件可能晚到，先主动问一次
      if (gl!.isContextLost()) { handleLost("isContextLost"); return; }
      // 自检：入场动画、缩放、DPR 变化、drawing buffer 被驱动改动……只要签名变了就重建，不依赖事件
      if (needsRebuild(built, readSignature())) {
        report("info", "画布签名变化，重建月亮", { from: built, to: readSignature() });
        rebuild();
        if (N === 0) return;
      }
      // 无交互时 30fps 足够（自转很慢）；有交互时跑满刷新率
      const interval = busy ? 0 : 30;
      if (now - lastDraw < interval) { raf = requestAnimationFrame(frame); return; }
      const dt = frameDelta(now, last); last = now; lastDraw = now;
      theta += omega * dt;

      const rect = cv.getBoundingClientRect();
      const track = pOn;
      let smx = 0, smy = 0;
      if (track) {
        const p = mapPointerToCanvas(px, py, rect, cv.clientWidth, cv.clientHeight);
        smx = p.x; smy = p.y;
        const nx = clamp((smx - cx) / R, -1.4, 1.4), ny = clamp((smy - cy) / R, -1.4, 1.4), l = Math.hypot(nx * 1.1, ny * 1.1, 0.8);
        lightT[0] = (nx * 1.1) / l; lightT[1] = (-ny * 1.1) / l; lightT[2] = 0.8 / l;
      } else { lightT[0] = -0.4; lightT[1] = 0.3; lightT[2] = 0.85; }
      let lightMoving = false;
      for (let i = 0; i < 3; i++) {
        const dl = lightT[i]! - light[i]!;
        light[i] = approach(light[i]!, lightT[i]!, MOON_MOTION.lightRate, dt);
        if (Math.abs(dl) > 1e-3) lightMoving = true;
      }
      const ll = Math.hypot(light[0]!, light[1]!, light[2]!);

      // 只有光标附近、或还在回位的字符才需要 JS 计算；其余完全交给 GPU
      const MR2 = MR * MR, cap = maxD * 1.25;
      let dirty = false, hotCount = 0, moving = false;
      for (let i = 0; i < N; i++) {
        const o3 = i * 3;
        let tx = 0, ty = 0, h = 0;
        if (track) {
          const dx = gx[i]! - smx, dy = gy[i]! - smy;
          if (dx > -MR && dx < MR && dy > -MR && dy < MR) {
            const d2 = dx * dx + dy * dy;
            if (d2 < MR2) {
              const d = Math.sqrt(d2) + 1e-3, f = 1 - d / MR, k = f * f * maxD;
              tx = ((dx * 0.85 - dy * 0.4) / d) * k; ty = ((dy * 0.85 + dx * 0.4) / d) * k; h = f;
            }
          }
        }
        let oxi = dyn[o3]!, oyi = dyn[o3 + 1]!, hv = dyn[o3 + 2]!;
        if (tx === 0 && ty === 0 && h === 0 && oxi === 0 && oyi === 0 && hv === 0) continue;
        const tl = Math.hypot(tx, ty); if (tl > cap) { tx *= cap / tl; ty *= cap / tl; }
        // 推开时快跟、回位时慢落：都是一阶逼近，不会像旧弹簧那样过冲抖动
        const pushing = tx !== 0 || ty !== 0;
        const rate = pushing ? MOON_MOTION.pushRate : MOON_MOTION.returnRate;
        oxi = approach(oxi, tx, rate, dt); oyi = approach(oyi, ty, rate, dt);
        hv = approach(hv, h, h > hv ? MOON_MOTION.heatRiseRate : MOON_MOTION.heatFallRate, dt);
        if (!pushing && Math.abs(oxi) + Math.abs(oyi) < 2e-3) { oxi = oyi = 0; }
        if (h === 0 && hv < 2e-3) hv = 0;
        dyn[o3] = oxi; dyn[o3 + 1] = oyi; dyn[o3 + 2] = hv;
        dirty = true; moving = true; if (hv > 0.01) hotCount++;
      }
      busy = track || moving || lightMoving;

      gl!.viewport(0, 0, cv.width, cv.height);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.useProgram(prog); gl!.bindVertexArray(vao);
      if (dirty) { gl!.bindBuffer(gl!.ARRAY_BUFFER, bufDyn); gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, dyn); }
      gl!.uniform2f(U.uCS!, Math.cos(theta), Math.sin(theta));
      gl!.uniform2f(U.uCK!, Math.cos(TILT), Math.sin(TILT));
      gl!.uniform3f(U.uLight!, light[0]! / ll, light[1]! / ll, light[2]! / ll);
      gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, texAlb);
      gl!.activeTexture(gl!.TEXTURE1); gl!.bindTexture(gl!.TEXTURE_2D, texAtlas);
      gl!.uniform1i(U.uPass!, 0); gl!.drawArraysInstanced(gl!.TRIANGLE_STRIP, 0, 4, N);
      if (hotCount > 0) { gl!.uniform1i(U.uPass!, 1); gl!.drawArraysInstanced(gl!.TRIANGLE_STRIP, 0, 4, N); }
      needDraw = false;
      raf = requestAnimationFrame(frame);
    };
    function wake() { if (!raf && visible && !document.hidden && glReady) { last = null; raf = requestAnimationFrame(frame); } }
    const start = () => {
      if (gl) wake();
      else if (needDraw) { drawStatic(); needDraw = false; }
    };

    const onLost = (e: Event) => { e.preventDefault(); handleLost("webglcontextlost"); };
    const onRestored = () => {
      try { setupGL(); rebuild(); setState("ready"); report("info", "WebGL 上下文已恢复"); start(); }
      catch (error) { setState("error"); report("warn", "WebGL 上下文恢复失败", { error: String(error) }); }
    };
    cv.addEventListener("webglcontextlost", onLost);
    cv.addEventListener("webglcontextrestored", onRestored);

    const ro = new ResizeObserver(() => { rebuild(); if (!gl) drawStatic(); start(); });
    const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; if (visible) start(); });
    const onVis = () => { if (!document.hidden) start(); };
    document.addEventListener("visibilitychange", onVis);
    // 主题切换（<html> 的 class 变化）后重建图集以换色
    const mo = new MutationObserver(() => { if (!atlasCv || (gl && !glReady)) return; buildAtlas(); uploadAtlas(); needDraw = true; if (!gl) drawStatic(); start(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

    // 贴图首次生成放到下一个宏任务，避免阻塞首屏
    const timer = window.setTimeout(() => {
      try {
        if (gl) setupGL();
        else getMoonTexture();
        ro.observe(cv); io.observe(cv);
        rebuild(); if (!gl) drawStatic(); start();
        setState("ready");
        report("info", "月亮初始化完成", { webgl2: !!gl, width: W, height: H, dpr, cells: N });
      } catch (error) {
        // 着色器失败：保持空白，不影响界面；原因留给诊断回调和现场属性
        setState("error");
        report("warn", "月亮初始化失败", { error: String(error) });
      }
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect(); mo.disconnect();
      cv.removeEventListener("webglcontextlost", onLost);
      cv.removeEventListener("webglcontextrestored", onRestored);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      delete cv.dataset.lunarMoon;
      if (gl) gl.getExtension("WEBGL_lose_context")?.loseContext(); // 及时释放 GPU 上下文
    };
  }, [size, x, y, rotationSpeed, interactive]);

  return <canvas ref={ref} aria-hidden="true" className={className} style={{ display: "block", width: "100%", height: "100%", pointerEvents: "none", opacity }} />;
}
