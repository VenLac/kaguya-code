# Cyberpunk neon

## Essence
A dark HUD lit by neon: glowing lines, angled frames, techno type, a sense of a screen in a rainy night city. It is atmospheric and high-energy. It suits games, music, events, security or AI products with a sci-fi identity.

## Core ingredients

**Type**
- Techno or condensed display for headings (Orbitron, Rajdhani, Chakra Petch, Audiowide) and a mono for data (Share Tech Mono, JetBrains Mono). Uppercase headings with +0.04–0.1em tracking; body in a readable sans or mono at 15–16px. Check that the display face has CJK glyphs, otherwise pair a CJK face for the same weight.

**Color**
- Near-black with a blue or purple cast (`#07080F`, `#0B0A1A`), **two** neon hues at most (cyan `#00F0FF`, magenta `#FF2BD6`, optionally yellow `#FCEE09` as a sparse accent), body text in a soft off-white (`#D8DEF0`), not neon.

**Shape and space**
- Angled corners via `clip-path: polygon(...)` (cut corners 8–16px), 1–2px neon outlines, HUD-style brackets and ticks, dense panels with small caps labels.

**Depth**
- Glow instead of shadow: `box-shadow: 0 0 12px color-mix(in oklch, var(--neon) 60%, transparent)` and a matching `text-shadow` on headings only. Scanline or grid overlay at 3–6% opacity, one subtle vignette.

**Motion**
- Short flicker or glitch on headline entry (≤ 400ms, once), pulsing glow on the primary action (slow, 2–3s), scanning lines. Everything respects `prefers-reduced-motion`.

**Imagery**
- Dark photography with color grading toward the neon palette, wireframe or 3D objects, UI fragments with data readouts.

**Signature components**
- Cut-corner buttons with neon outline, HUD panels with corner brackets, glowing dividers, terminal-style data blocks, status LEDs.

## Execution keys
1. **Two neons and a dark ground.** Assign roles (cyan = primary/interactive, magenta = emphasis/danger).
2. **Light comes from the neon.** Glow color matches the element's accent; no white glow.
3. **Frames are angled; text is flat.** Clip-path shapes carry the style so type stays clean.
4. **Sparse effects.** Glitch and flicker on one or two moments, not on every element.
5. **Data as decoration.** Small readouts, coordinates and labels fill space with meaning.

## Where it breaks
- **Thin neon text on black is hard to read, and glow bleeds the letterforms.** *Fix:* use neon for headings 24px+ and outlines; body text off-white at regular weight; keep `text-shadow` blur ≤ 8px.
- **Too many colors.** *Fix:* two neons; everything else neutral.
- **Constant motion and glitch** tires the eye and hurts accessibility. *Fix:* effects on entry and hover only; stop on `prefers-reduced-motion`.
- **Clip-path cuts off focus rings and content.** *Fix:* draw focus with `outline` on a wrapper or use a drop-shadow filter; leave inner padding at the cut corners.
- **Heavy effects hurt performance.** *Fix:* limit blurred glows and full-screen overlays; prefer gradients and borders to large filters.

## Keeping it legible
Body text at off-white on near-black gives high contrast; make sure neon-on-dark text (links, labels) is measured. Provide a solid fill for the primary action (neon background with dark text) so it reads without glow.

## Starter tokens
```css
:root {
  --bg: #07080f; --panel: #0d0f1c; --ink: #d8def0; --muted: #8b93b3;
  --neon-a: #00f0ff; --neon-b: #ff2bd6;
  --line: 1px solid color-mix(in oklch, var(--neon-a) 55%, transparent);
  --cut: 12px;
  --font-display: "Chakra Petch", "Noto Sans SC", sans-serif;
  --font-mono: "Share Tech Mono", ui-monospace, monospace;
}
.hud { background: var(--panel); border: var(--line);
  clip-path: polygon(var(--cut) 0, 100% 0, 100% calc(100% - var(--cut)), calc(100% - var(--cut)) 100%, 0 100%, 0 var(--cut)); }
.glow-text { text-shadow: 0 0 8px color-mix(in oklch, var(--neon-a) 70%, transparent); }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
```
