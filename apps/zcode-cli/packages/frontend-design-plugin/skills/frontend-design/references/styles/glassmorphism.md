# Glassmorphism

## Essence
Frosted, translucent panels that float over a colorful, softly blurred backdrop. Light passes through the glass; edges catch a thin highlight. It feels airy and layered, and suits media, music, weather, finance dashboards with a lighter tone, system-like overlays, and product pages that want depth.

## Core ingredients

**Type**
- A clean, slightly rounded or geometric sans (Plus Jakarta Sans, Outfit, DM Sans, Manrope). Weights 400/500/600; white or near-white text on dark glass, dark ink on light glass. Titles 20–40px, body 15–16px.

**Color**
- The **backdrop** carries the color: two to four vivid blurred shapes (blobs) or a photo, such as violet, blue, coral, teal. Glass panels are white or black with low alpha. One accent for actions.

**Shape and space**
- Radius 16–28px; panels padded 20–32px; spacing 8px base; panels overlap the backdrop shapes and sometimes each other.

**Depth and surface (the mechanics)**
- `background: rgb(255 255 255 / 0.10–0.25)` (light glass) or `rgb(20 20 30 / 0.35–0.55)` (dark glass); `backdrop-filter: blur(14–24px) saturate(140–180%)`; `border: 1px solid rgb(255 255 255 / 0.20–0.35)`; a soft shadow `0 10px 40px rgb(0 0 0 / 0.18)`; optional inner top highlight `inset 0 1px 0 rgb(255 255 255 / 0.4)`.

**Motion**
- Slow drifting of backdrop blobs (20–40s loops, small distances); panels fade and scale slightly (200–300ms).

**Imagery**
- Blurred gradient blobs, abstract 3D shapes, rich photography behind the glass.

**Signature components**
- Cards, nav bars, modals, music/weather widgets, stat panels, sidebars floating over the backdrop.

## Execution keys
1. **Something worth blurring sits behind the glass.** On a flat background glass has no effect. Provide colored shapes or imagery behind panels.
2. **Three properties together:** blur, translucency, and a thin light border. Missing one flattens the effect.
3. **Layering order is clear.** Backdrop → glass panels → content. Do not stack glass on glass beyond two layers.
4. **Consistent light direction.** Highlight on the top and left edges, shadow below.
5. **Limit the number of glass layers on screen** (about 3–5) and their area; blur is expensive.

## Where it breaks
- **Text illegible over a bright part of the backdrop.** *Fix:* raise panel alpha, add a tint, or place a scrim; measure text contrast at the brightest and darkest spot under the panel (the audit marks gradient or image backgrounds as unverified, so check by eye).
- **Glass on glass on glass becomes mud.** *Fix:* at most two overlapping layers; nested elements inside a panel are solid or slightly tinted, not glass.
- **No fallback.** *Fix:* `@supports not (backdrop-filter: blur(1px))` → use a more opaque solid panel; include `-webkit-backdrop-filter` for Safari.
- **Performance drops** with large blur areas or animated blurred layers. *Fix:* limit area, avoid animating blur radius, animate transform of the backdrop shapes.
- **Washed-out look on light backdrops.** *Fix:* use darker or more saturated backdrop shapes, or use dark glass.

## Keeping it legible
Raise the panel's alpha until measured text contrast meets 4.5:1 at the worst spot; keep a solid-fill primary button so the key action does not depend on the backdrop; keep borders visible enough (≥ 0.2 alpha) to define edges.

## Starter tokens
```css
:root {
  --glass: rgb(255 255 255 / 0.14); --glass-border: rgb(255 255 255 / 0.28);
  --glass-shadow: 0 10px 40px rgb(0 0 0 / 0.2);
  --blur: 18px; --radius: 22px;
  --ink: #fff; --accent: #ffd36e;
}
.glass { background: var(--glass); border: 1px solid var(--glass-border); border-radius: var(--radius);
  box-shadow: var(--glass-shadow), inset 0 1px 0 rgb(255 255 255 / 0.35);
  -webkit-backdrop-filter: blur(var(--blur)) saturate(160%); backdrop-filter: blur(var(--blur)) saturate(160%); }
@supports not (backdrop-filter: blur(1px)) { .glass { background: rgb(30 30 50 / 0.85); } }
```
