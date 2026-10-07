# Bento grid

## Essence
A page built from a grid of rounded tiles of different sizes, like a bento box. Each tile holds one idea (a feature, a number, a small product demo). It feels organized, modern and scannable, and it suits product pages and dashboards that want to show many things at once.

## Core ingredients

**Type**
- A clean grotesk or humanist sans (Geist, Hanken Grotesk, Figtree, Instrument Sans). Tile titles 16–20px semibold, tile body 14–15px, one or two large display numerals (48–96px) for stat tiles.

**Color**
- Neutral page (`#F6F6F4` light or `#0E0F11` dark), tiles a step lighter or darker than the page, one accent. Individual tiles may carry a soft tint or a subtle gradient to give each its own identity.

**Shape and space**
- One radius for all tiles (16–28px), a consistent gap (12–16px), inner padding 20–28px. Tiles span 1, 2, or 3 columns and 1 or 2 rows on a 4- or 6-column grid.

**Depth**
- Either a 1px border at 6–10% ink or a soft shadow, not both. A very subtle inner highlight at the top edge works in dark mode.

**Motion**
- Tiles lift 2–4px on hover (150–200ms); inside tiles, small looping product animations (a cursor, a number counting) at low intensity.

**Imagery**
- Product UI fragments cropped to the tile edge, charts, 3D or abstract objects. Cropping bleeds off the tile edge to suggest more.

**Signature components**
- A hero tile (largest), stat tiles, a tile with an embedded interactive widget, a logo/proof tile, a CTA tile.

## Execution keys
1. **Vary the spans and have one hero tile.** Equal tiles read as a grid of cards; one dominant tile gives an entry point.
2. **One idea per tile.** A title, one sentence, one visual. If a tile needs a paragraph it is the wrong shape.
3. **Constant gap and radius.** Everything else can vary; the gap and radius cannot.
4. **Real product pieces.** Tiles filled with real UI fragments, real numbers, real charts beat abstract decoration.
5. **Read order is still linear on mobile.** Collapse to one column in a sensible order: hero, proof, features, CTA.

## Where it breaks
- **Every tile equal weight.** *Fix:* make one tile span 2×2 and another 2×1; vary visual type (text, number, image, chart).
- **Filler content** (an icon and a generic sentence). *Fix:* each tile shows something specific; delete tiles that cannot.
- **Misaligned edges** from mixed spans. *Fix:* define the grid in `grid-template-columns` with explicit spans; avoid manual margins.
- **Too many gradients and glows** competing across tiles. *Fix:* one background treatment, one accent; tint at most two or three tiles.
- **Mobile becomes a long identical stack.** *Fix:* reorder, merge small tiles into a single list tile, keep the primary action reachable.

## Keeping it legible
Text sits on the tile surface, not on its decoration. Measure text on tinted or gradient tiles at the worst point. Keep the primary action in the first view, either in a header or in the hero tile.

## Starter tokens
```css
:root {
  --page: #f6f6f4; --tile: #ffffff; --ink: #15171a; --muted: #5b6168;
  --accent: oklch(0.62 0.17 255);
  --radius: 22px; --gap: 14px; --pad: 24px;
  --border: 1px solid oklch(0.2 0.01 255 / 0.08);
}
.bento { display: grid; gap: var(--gap); grid-template-columns: repeat(4, 1fr); }
.tile { background: var(--tile); border: var(--border); border-radius: var(--radius); padding: var(--pad); overflow: hidden; }
.tile--hero { grid-column: span 2; grid-row: span 2; }
@media (max-width: 720px) { .bento { grid-template-columns: 1fr; } .tile--hero { grid-column: auto; grid-row: auto; } }
```
