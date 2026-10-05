/**
 * 本机个人资料：用户名与头像，只存在这台设备上（localStorage），不上传。
 * 没设置头像时显示默认的“自转月球”。
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "zcode.profile.v1";
const MAX_NAME_LENGTH = 24;

export interface LocalProfile {
  /** 自定义显示名；空表示沿用默认。 */
  readonly name: string;
  /** 自定义头像（data URL）；空表示使用默认的月球。 */
  readonly avatar: string;
}

const EMPTY: LocalProfile = Object.freeze({ name: "", avatar: "" });
let snapshot: LocalProfile = read();
const listeners = new Set<() => void>();

function read(): LocalProfile {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    return Object.freeze({
      name: typeof parsed.name === "string" ? parsed.name.slice(0, MAX_NAME_LENGTH) : "",
      avatar: typeof parsed.avatar === "string" && parsed.avatar.startsWith("data:image/") ? parsed.avatar : "",
    });
  } catch {
    return EMPTY;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  // 多窗口同步
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    snapshot = read();
    emit();
  });
}

export function getLocalProfile(): LocalProfile {
  return snapshot;
}

export function setLocalProfile(patch: Partial<LocalProfile>): void {
  const next: LocalProfile = Object.freeze({
    name: (patch.name ?? snapshot.name).trim().slice(0, MAX_NAME_LENGTH),
    avatar: patch.avatar ?? snapshot.avatar,
  });
  snapshot = next;
  try {
    if (!next.name && !next.avatar) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 容量不足等：保留内存态，下次启动会回到默认值。
  }
  emit();
}

export function useLocalProfile(): LocalProfile {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLocalProfile,
    () => EMPTY,
  );
}

/** 把用户选的图片裁成正方形并缩到 size×size，输出体积很小的 WebP/PNG data URL。 */
export async function imageFileToAvatarDataUrl(file: File, size = 160): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}
