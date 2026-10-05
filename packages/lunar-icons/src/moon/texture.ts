// 月面反照率贴图：经纬度 384×192 的单通道图，一次生成、全局复用。
// 月海按真实位置摆放（雨海、静海、危海…），环形山拒绝采样保证互不重叠，第谷/哥白尼带放射亮纹。
export const TEX_W = 384;
export const TEX_H = 192;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const a = (i: number, j: number, k: number) => hash3(ix + i, iy + j, iz + k);
  const l = (p: number, q: number, t: number) => p + (q - p) * t;
  return l(
    l(l(a(0, 0, 0), a(1, 0, 0), fx), l(a(0, 1, 0), a(1, 1, 0), fx), fy),
    l(l(a(0, 0, 1), a(1, 0, 1), fx), l(a(0, 1, 1), a(1, 1, 1), fx), fy),
    fz,
  );
}
const fbm = (x: number, y: number, z: number, o: number) => {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < o; i++) {
    s += a * vnoise(x * f, y * f, z * f);
    n += a;
    f *= 2;
    a *= 0.5;
  }
  return s / n;
};

type Vec3 = readonly [number, number, number];
const D2R = Math.PI / 180;
const sph = (lat: number, lon: number): Vec3 => {
  lat *= D2R;
  lon *= D2R;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
};

const MARIA = (
  [
    [33, -16, 0.3, 1], [18, -52, 0.5, 0.85], [28, 18, 0.17, 1], [8, 31, 0.2, 1], [17, 59, 0.13, 1],
    [-4, 52, 0.17, 0.9], [-15, 34, 0.1, 0.9], [-21, -15, 0.2, 0.9], [-24, -39, 0.1, 1], [60, 0, 0.15, 0.7], [2, -2, 0.09, 0.8],
  ] as const
).map(([la, lo, r, s]) => ({ c: sph(la, lo), r, s, cosLim: Math.cos(Math.min(3, r + 0.2)) }));

interface Crater { c: Vec3; r: number; keep: number; rays: boolean; bright: boolean; cosLim: number; u: Vec3; v: Vec3; seed: number }

function buildCraters(): Crater[] {
  const rnd = mulberry(20260);
  const raw: Omit<Crater, "cosLim" | "u" | "v" | "seed">[] = [];
  ([[-43, -11, 0.085, true], [10, -20, 0.065, true], [8, -38, 0.045, false], [23, -47, 0.04, false], [-9, -61, 0.05, false]] as const).forEach(
    ([la, lo, r, rays]) => raw.push({ c: sph(la, lo), r, keep: rays ? r * 3 : r, rays, bright: true }),
  );
  for (let tries = 0; tries < 6000 && raw.length < 55; tries++) {
    const u = rnd() * 2 - 1, p = rnd() * Math.PI * 2, q = Math.sqrt(1 - u * u);
    const r = 0.04 + Math.pow(rnd(), 1.8) * 0.1;
    const c: Vec3 = [q * Math.cos(p), u, q * Math.sin(p)];
    const ok = raw.every((k) => Math.acos(Math.min(1, c[0] * k.c[0] + c[1] * k.c[1] + c[2] * k.c[2])) > r * 1.6 + k.keep * 1.6 + 0.03);
    if (ok) raw.push({ c, r, keep: r, rays: false, bright: false });
  }
  return raw.map((k) => {
    const c = k.c, up: Vec3 = Math.abs(c[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u: Vec3 = [c[1] * up[2] - c[2] * up[1], c[2] * up[0] - c[0] * up[2], c[0] * up[1] - c[1] * up[0]];
    const ul = Math.hypot(...u);
    u = [u[0] / ul, u[1] / ul, u[2] / ul];
    const v: Vec3 = [c[1] * u[2] - c[2] * u[1], c[2] * u[0] - c[0] * u[2], c[0] * u[1] - c[1] * u[0]];
    return { ...k, cosLim: Math.cos(Math.min(3, k.r * (k.rays ? 7 : 1.5))), u, v, seed: rnd() * 6 };
  });
}

function albedo(x: number, y: number, z: number, craters: Crater[]) {
  let a = 0.9 + (fbm(x * 2.5, y * 2.5, z * 2.5, 3) - 0.5) * 0.1 + (fbm(x * 9 + 5, y * 9, z * 9, 3) - 0.5) * 0.06;
  let m = 0;
  for (const s of MARIA) {
    const dt = x * s.c[0] + y * s.c[1] + z * s.c[2];
    if (dt < s.cosLim) continue;
    const d = Math.acos(Math.min(1, dt)) + (fbm(x * 4 + 3, y * 4, z * 4, 3) - 0.5) * 0.14;
    m = Math.max(m, smooth(s.r * 1.05, s.r * 0.55, d) * s.s);
  }
  if (z < 0.25) m = Math.max(m, smooth(0.7, 0.8, fbm(x * 2.2 + 7, y * 2.2, z * 2.2, 3)) * 0.45);
  a *= 1 - 0.62 * m;
  for (const k of craters) {
    const dt = x * k.c[0] + y * k.c[1] + z * k.c[2];
    if (dt < k.cosLim) continue;
    const d = Math.acos(Math.min(1, dt)), rel = d / k.r;
    if (rel < 1) a -= 0.12 * smooth(1, 0.5, rel);
    const e = (rel - 1) / 0.13;
    a += (k.bright ? 0.32 : 0.2) * Math.exp(-e * e);
    if (k.rays && rel > 1) {
      const pu = x * k.u[0] + y * k.u[1] + z * k.u[2], pv = x * k.v[0] + y * k.v[1] + z * k.v[2];
      const phi = Math.atan2(pv, pu);
      const ray = Math.pow(0.5 + 0.5 * Math.cos(phi * 9 + 3 * Math.sin(phi * 3 + k.seed)), 5);
      a += 0.22 * ray * Math.exp(-(d - k.r) / (k.r * 5));
    }
  }
  return clamp(a, 0.04, 1.2);
}

let cached: Float32Array | null = null;
/** 生成（或取缓存）贴图；约 100–200ms，首次调用时执行。 */
export function getMoonTexture(): Float32Array {
  if (cached) return cached;
  const craters = buildCraters();
  const tex = new Float32Array(TEX_W * TEX_H);
  for (let j = 0; j < TEX_H; j++) {
    const lat = (0.5 - (j + 0.5) / TEX_H) * Math.PI, y = Math.sin(lat), q = Math.cos(lat);
    for (let i = 0; i < TEX_W; i++) {
      const lon = ((i + 0.5) / TEX_W) * Math.PI * 2 - Math.PI;
      tex[j * TEX_W + i] = albedo(q * Math.sin(lon), y, q * Math.cos(lon), craters);
    }
  }
  cached = tex;
  return tex;
}

/** 双线性采样（经度环绕、纬度夹紧）。 */
export function sampleMoonTexture(tex: Float32Array, x: number, y: number, z: number): number {
  const fu = (Math.atan2(x, z) / (Math.PI * 2) + 0.5) * TEX_W - 0.5;
  const fv = clamp((0.5 - Math.asin(y < -1 ? -1 : y > 1 ? 1 : y) / Math.PI) * TEX_H - 0.5, 0, TEX_H - 1.001);
  let i0 = Math.floor(fu);
  const j0 = Math.floor(fv), tu = fu - i0, tv = fv - j0;
  i0 = ((i0 % TEX_W) + TEX_W) % TEX_W;
  const i1 = (i0 + 1) % TEX_W;
  const a = tex[j0 * TEX_W + i0]!, b = tex[j0 * TEX_W + i1]!, c = tex[(j0 + 1) * TEX_W + i0]!, d = tex[(j0 + 1) * TEX_W + i1]!;
  return (a + (b - a) * tu) * (1 - tv) + (c + (d - c) * tu) * tv;
}

let cachedU8: Uint8Array | null = null;
/** 供 GPU 使用的 8 位贴图（反照率 / 1.25，着色器里再乘回去）。 */
export function getMoonTextureU8(): Uint8Array {
  if (cachedU8) return cachedU8;
  const f = getMoonTexture();
  const u8 = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) u8[i] = Math.round(clamp(f[i]! / 1.25, 0, 1) * 255);
  cachedU8 = u8;
  return u8;
}

const dataUrlCache = new Map<string, string>();
/**
 * 月面纹理的 PNG（经纬度展开、可无缝横向平铺），用于头像等小尺寸的“自转月球”。
 * dark：暗色底下偏亮的银蓝月壤；light：浅色底下偏深的灰蓝，保证对比。
 */
export function getMoonTextureDataUrl(tone: "dark" | "light" = "dark"): string {
  const hit = dataUrlCache.get(tone);
  if (hit) return hit;
  const tex = getMoonTexture();
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(TEX_W, TEX_H);
  // 低端 = 月海（暗）；高端 = 高地（亮）
  const lo = tone === "dark" ? [70, 84, 118] : [120, 134, 168];
  const hi = tone === "dark" ? [236, 242, 252] : [206, 216, 236];
  for (let i = 0; i < tex.length; i++) {
    const t = clamp((tex[i]! - 0.18) / 0.95, 0, 1);
    img.data[i * 4] = lo[0]! + (hi[0]! - lo[0]!) * t;
    img.data[i * 4 + 1] = lo[1]! + (hi[1]! - lo[1]!) * t;
    img.data[i * 4 + 2] = lo[2]! + (hi[2]! - lo[2]!) * t;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const url = canvas.toDataURL("image/png");
  dataUrlCache.set(tone, url);
  return url;
}
