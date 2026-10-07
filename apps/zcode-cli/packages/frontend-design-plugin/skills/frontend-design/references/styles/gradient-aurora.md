# Gradient and aurora

## Essence
Color itself is the main material: mesh gradients, aurora blobs, glow, and smooth transitions of hue create atmosphere and brand. It feels warm, luminous and contemporary, and suits AI products, creative tools, launches and consumer brands that want an emotional first impression.

## Core ingredients

**Type**
- A confident geometric or grotesk sans (Sora, Outfit, Plus Jakarta Sans, Hanken Grotesk, Bricolage Grotesque), weights 500–700 for headings, 400 for body. Headline 48–96px with tight tracking (−0.02em); body 16–18px.

**Color**
- A dark or very light ground with **2–3 analogous or split hues** in the gradient (for example blue → violet → pink, or teal → green → yellow). Plain neutral text (`#0E1014` or `#F4F6FA`). One solid accent for actions.

**Shape and space**
- Generous space, large radius (16–32px), content in simple blocks so the gradient has room. Pill-shaped buttons are common.

**Depth and surface (the mechanics)**
- Layered `radial-gradient()` backgrounds, blurred blobs (`filter: blur(80–140px)`, `opacity 0.5–0.8`), `linear-gradient(in oklch, …)`, a 3–6% noise overlay to prevent banding, a soft glow behind key elements, optional gradient borders via `background-clip` tricks.

**Motion**
- Slow drifting blobs (20–40s), gradient position shifts on hover, subtle parallax on the hero. Respect `prefers-reduced-motion`.

**Imagery**
- Abstract 3D shapes, glassy objects, product UI floating over the gradient.

**Signature components**
- Gradient hero, glowing primary button, gradient-bordered cards, gradient text on a single headline phrase, animated background orbs.

## Execution keys
1. **Interpolate well.** Use OKLCH interpolation or analogous hues; complementary pairs blended in sRGB turn gray in the middle.
2. **Gradient for atmosphere, solid for content.** Text and controls sit on calm surfaces or a scrim.
3. **Noise.** A tiny grain removes banding and gives the gradient a tactile feel.
4. **One gradient story.** Reuse the same two or three hues across hero, buttons, and accents.
5. **Plenty of space.** The gradient needs breathing room to read as atmosphere.

## Where it breaks
- **Muddy mid-tones.** *Fix:* interpolate in OKLCH with `in oklch`, add a lighter middle stop, or choose analogous hues.
- **Text on gradients is unreadable at the bright stop.** *Fix:* measure at the worst point; add a scrim or solid plate; keep long text off the gradient.
- **Gradient text with too little contrast.** *Fix:* limit it to a short phrase; check the lightest stop against the ground at large-text contrast (3:1).
- **Banding** on large smooth areas. *Fix:* noise overlay of 3–6%; slightly more chroma variation.
- **Everything glows.** *Fix:* glow on the primary action and one hero element only.
- **Heavy blur is slow.** *Fix:* a few large blobs, pre-rendered images for static backgrounds, animate transform not blur.

## Keeping it legible
Place content on solid or scrimmed surfaces; the primary button gets a solid fill with measured label contrast; check the first view at both widths because gradient backgrounds shift with viewport size.

## Starter tokens
```css
:root {
  --bg: #0b0b14; --ink: #f4f6fa; --muted: #a3a8c0;
  --h1: oklch(0.65 0.22 265); --h2: oklch(0.7 0.22 320); --h3: oklch(0.75 0.17 25);
  --radius: 24px;
}
body { background:
  radial-gradient(60% 50% at 20% 10%, oklch(0.65 0.22 265 / 0.55), transparent 70%),
  radial-gradient(50% 45% at 85% 20%, oklch(0.7 0.22 320 / 0.45), transparent 70%),
  var(--bg); }
.grad-text { background: linear-gradient(in oklch 90deg, var(--h1), var(--h2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
```
