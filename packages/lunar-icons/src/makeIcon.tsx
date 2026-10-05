import { createElement, forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { ICON_DATA } from "./generated.js";

/**
 * 月字图标：24×24 网格，圆头圆角描边，主体带 16% 透明度的“柔填充”（双色调）。
 * 接口与 lucide-react 的图标组件保持一致（size / color / strokeWidth / absoluteStrokeWidth / className / ref）。
 */
export const DEFAULT_STROKE = 1.7;
export const TONE_OPACITY = 0.16;

export function makeIcon(canon: string, displayName: string): LucideIcon {
  const entry = ICON_DATA[canon];
  if (!entry) throw new Error(`lunar-icons: 缺少图标 ${canon}`);
  const [tone, main] = entry;
  const Icon = forwardRef<SVGSVGElement, LucideProps>(function LunarIcon(
    { color = "currentColor", size = 24, strokeWidth = DEFAULT_STROKE, absoluteStrokeWidth, className, children, ...rest },
    ref,
  ) {
    const sizeNumber = Number(size);
    const sw = absoluteStrokeWidth && Number.isFinite(sizeNumber) && sizeNumber > 0 ? (Number(strokeWidth) * 24) / sizeNumber : strokeWidth;
    const hasA11y = children !== undefined && children !== null;
    const a11y = !hasA11y && !("aria-label" in rest) && !("aria-labelledby" in rest) && !("role" in rest) && !("title" in rest) ? { "aria-hidden": true } : {};
    return createElement(
      "svg",
      {
        ref,
        xmlns: "http://www.w3.org/2000/svg",
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: color,
        strokeWidth: sw,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        className: ["lucide", "lunar", `lucide-${canon}`, className].filter(Boolean).join(" "),
        ...a11y,
        ...rest,
      },
      tone ? createElement("g", { fill: color, fillOpacity: TONE_OPACITY, stroke: "none", dangerouslySetInnerHTML: { __html: tone } }) : null,
      createElement("g", { dangerouslySetInnerHTML: { __html: main } }),
      children,
    );
  });
  Icon.displayName = displayName;
  return Icon as unknown as LucideIcon;
}
