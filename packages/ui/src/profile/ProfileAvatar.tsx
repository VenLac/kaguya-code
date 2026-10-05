import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getMoonTextureDataUrl } from "@zcode/lunar-icons";
import { cn } from "@/components/lib/utils.js";
import { useLocalProfile } from "@/profile/localProfile.js";

/** 当前是否深色主题（<html class="dark">）。 */
function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

/**
 * 默认头像：一轮缓缓自转的月球。纹理横向无缝平铺，用 transform 平移（GPU 合成），
 * 上面叠一层球面明暗，看起来就是一颗在转的小月亮。
 */
export function SpinningMoonAvatar({ size, className }: { size: number; className?: string }) {
  const dark = useIsDark();
  const url = useMemo(() => getMoonTextureDataUrl(dark ? "dark" : "light"), [dark]);
  const style = {
    "--moon-size": `${size}px`,
    width: size,
    height: size,
    backgroundColor: dark ? "#0e1422" : "#dbe5f3",
  } as CSSProperties;
  return (
    <span aria-hidden="true" data-lunar-avatar="moon" className={cn("lunar-moon-avatar", className)} style={style}>
      <span className="lunar-moon-avatar__map" style={{ backgroundImage: `url(${url})` }} />
    </span>
  );
}

/** 个人头像：用户设置了图片就显示图片，否则是自转的月球。 */
export function ProfileAvatar({ size = 32, className }: { size?: number; className?: string }) {
  const { avatar } = useLocalProfile();
  if (avatar) {
    return (
      <img
        src={avatar}
        alt=""
        data-lunar-avatar="image"
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return <SpinningMoonAvatar size={size} className={className} />;
}
