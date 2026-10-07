# Retro and pixel

## Essence
Early-computing looks: bitmap type, limited palettes, hard pixel edges, chunky bevels, CRT glow. Variants include **8/16-bit pixel art**, **classic desktop** (Windows 95 / Mac OS 9 bevels), **terminal/CRT**, and **Y2K** (chrome, bubbles, early-web color). It feels nostalgic and playful and suits games, creative portfolios, community products, events and brands that lean on nostalgia.

## Core ingredients

**Type**
- Pixel/bitmap faces: Press Start 2P, Silkscreen, VT323, Pixelify Sans, DotGothic16 (some CJK glyphs); classic UI faces for desktop looks (system sans at 12–13px with no smoothing feel). Use bitmap faces **at their native pixel multiples** (8, 16, 24, 32px) so edges stay crisp.
- For Chinese, bitmap CJK faces are limited; use a readable sans for body and reserve the pixel face for Latin headings, or choose a CJK pixel font and verify it covers the characters you need.

**Color**
- Limited palettes of 4–16 colors defined as tokens (for example a Game Boy four-green palette, a 16-color VGA-like set, or CRT amber/green on black). Classic desktop: gray `#C0C0C0` surfaces, navy title bars `#000080`, white and dark-gray bevel edges. Y2K: silver/chrome, bright aqua, hot pink, translucent plastic.

**Shape and space**
- Everything snaps to a pixel grid (use 4px or 8px multiples), radius 0, 2–4px stepped borders, bevels made of light and dark 2px edges, no fractional sizes. Use `image-rendering: pixelated` for pixel art and scale by integers.

**Depth**
- Bevel and inset borders (light top-left, dark bottom-right), hard drop shadows with no blur, dithered patterns for gradients.

**Motion**
- Stepped animation: `steps(4)` for sprites and blinking cursors, 80–150ms transitions. No smooth easing for pixel elements.

**Imagery**
- Pixel art illustrations and sprites, dithered images, ASCII, scanline and CRT overlays (2–4% opacity), icons drawn on a 16×16 or 24×24 grid.

**Signature components**
- Window frames with title bars and close boxes, bevelled buttons, dialog boxes, progress bars made of blocks, menu bars, status bars, pixel hearts and coins.

## Execution keys
1. **Integer scaling everywhere.** Fonts, sprites and borders use whole-pixel multiples, so edges stay sharp.
2. **A small palette, enforced by tokens.** Do not introduce a color that is not in the palette.
3. **Pixel type for display, readable type for reading.** Long text must stay legible.
4. **Honest bevels.** One light direction; consistent border width.
5. **One era.** Choose 8-bit, desktop, CRT or Y2K and stay in it.

## Where it breaks
- **Pixel fonts for long text** are slow and tiring to read. *Fix:* pixel faces for headings and labels; a clean body face for paragraphs.
- **Blurry pixels** from non-integer scaling or `devicePixelRatio`. *Fix:* integer sizes, `image-rendering: pixelated`, `font-smooth: never` where supported, `-webkit-font-smoothing: none` for bitmap faces.
- **Palette creep.** *Fix:* keep a fixed token set; test contrast within it.
- **Era mixing without intent.** *Fix:* pick one era; add a second only as a named secondary.
- **Retro as costume on a modern layout.** *Fix:* adopt the layout language of the era (windows, menus, status bars) so the structure supports the look.

## Keeping it legible
Choose palette pairs that meet contrast (the four-green Game Boy set has weak pairs; use the darkest on the lightest). Keep body ≥ 14px; make the primary action a large bevelled button.

## Starter tokens
```css
:root {
  --c0: #0f380f; --c1: #306230; --c2: #8bac0f; --c3: #9bbc0f;
  --px: 4px;
  --font-pixel: "Press Start 2P", "Silkscreen", monospace;
  --font: "DotGothic16", "VT323", "Noto Sans SC", ui-monospace, monospace;
}
.pixel { image-rendering: pixelated; -webkit-font-smoothing: none; }
.win { background: #c0c0c0; border: 2px solid; border-color: #fff #404040 #404040 #fff; box-shadow: 4px 4px 0 #000; }
```
