# Luxury and refined

## Essence
Quiet confidence: large, light, high-contrast serif type, wide-tracked small caps, a restrained palette, and a lot of space around beautiful imagery. Nothing shouts. It suits premium goods, hospitality, high-end services, galleries and fashion.

## Core ingredients

**Type**
- Display in an elegant high-contrast serif (Cormorant Garamond, Bodoni Moda, Playfair Display, Gloock) at large sizes (56–120px) and light-to-regular weights; a quiet sans for body (Hanken Grotesk, Instrument Sans, Figtree) at 15–17px; labels in uppercase with +0.12–0.2em tracking at 12–13px. For Chinese, Noto Serif SC (regular) for display.

**Color**
- Ivory (`#F7F3EC`) or deep ink (`#0F0E0C`), a muted metallic accent (brass `#A68A56`, champagne `#CBB68A`), almost no saturation elsewhere. Text high-contrast against the ground.

**Shape and space**
- Radius 0; 1px fine lines; extreme whitespace (sections 140–200px); full-bleed imagery; symmetrical or carefully asymmetrical compositions on a wide grid.

**Depth**
- None, or a barely perceptible shadow. Layering via image overlap and negative space.

**Motion**
- Slow and smooth: 500–800ms fades, image reveals by clip or slow scale (1.04 → 1), delayed stagger of 100–150ms. No bounce.

**Imagery**
- Large, professional photography with consistent color grading, product on clean grounds, generous cropping. Real images matter more here than in any other style.

**Signature components**
- Full-bleed hero image with a small caption, wide-tracked caps navigation, thin-line buttons, editorial product grids, appointment or inquiry form rather than a hard "Buy".

## Execution keys
1. **Space is the main material.** Give every element room; reduce the number of elements.
2. **Type contrast:** large light serif versus small tracked caps.
3. **Images carry the page.** Invest in imagery; when you lack real images, use quiet color fields or crisp CSS-built compositions rather than clip art.
4. **Slow, smooth motion** conveys confidence.
5. **Precise detail.** Hairlines, alignment, consistent baselines.

## Where it breaks
- **Thin light type on a light ground is hard to read.** *Fix:* keep body at regular weight and ≥ 4.5:1; use the light weight only for large display sizes.
- **Placeholder imagery looks cheap.** *Fix:* avoid generic stock; use real or purposefully abstract images; if none exist, design a typographic hero.
- **Call to action too subtle.** *Fix:* a thin-line button is fine, but it must be clearly visible in the first view and have a measured contrast; add a filled variant for the main action.
- **Tracked caps at 10–11px.** *Fix:* 12px minimum; reserve for non-essential labels.
- **Emptiness without structure.** *Fix:* a clear grid and strong alignment so space looks intentional.

## Keeping it legible
Measure body and caption contrast. Keep the primary action visible in the first view at both widths, and ensure navigation labels at 12–13px with tracking are readable.

## Starter tokens
```css
:root {
  --ground: #f7f3ec; --ink: #0f0e0c; --muted: #5d574c; --accent: #8c7440;
  --line: 1px solid rgb(15 14 12 / 0.18);
  --font-display: "Cormorant Garamond", "Noto Serif SC", Georgia, serif;
  --font-ui: "Hanken Grotesk", "Noto Sans SC", system-ui, sans-serif;
  --section: clamp(96px, 14vw, 200px);
}
.caps { font: 500 0.75rem/1.2 var(--font-ui); letter-spacing: 0.16em; text-transform: uppercase; }
```
