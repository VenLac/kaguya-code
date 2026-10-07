# Brutalist

## Essence
An interface that shows its structure on purpose: hard edges, thick outlines, flat color, raw type. There are two strands. **Neo-brutalism** is loud and graphic (thick black borders, offset hard shadows, saturated flat colors). **Raw web brutalism** is stark and unpolished on purpose (system fonts, plain links, black on white). Pick one strand and keep it; they do not blend well.

## Core ingredients

**Type**
- Neo: a heavy grotesk for headings (Archivo 800–900, Bricolage Grotesque 800, Space Grotesk 700) and a mono for labels (Space Mono, JetBrains Mono). Display 56–120px, body 16–18px, uppercase labels with +0.04em tracking.
- Raw: system serif/sans/mono (Times, Arial, Courier), underlined links, body ≥ 16px.

**Color**
- Neo: off-white ground (`#FFFDF5`), pure ink (`#000` or `#111`), two to four saturated flat colors with fixed roles (for example yellow `#FFD60A`, pink `#FF5CA8`, blue `#3A5BFF`, green `#2BD97C`). No gradients, no transparency.
- Raw: black and white, links in pure blue/purple, one alarm color at most.

**Shape and space**
- Borders 2–4px solid ink, **one width everywhere**. Radius 0, or a single 4–8px value used consistently.
- Visible grid, tight gutters (8–16px), generous inner padding on blocks (16–32px).

**Depth**
- Hard offset shadow with no blur: `4px 4px 0 #000` (6–8px on large blocks). Pressed state moves the element by the offset and removes the shadow.

**Motion**
- 80–120ms, linear or ease-out; hover moves a block 2–4px. No long easing flourishes.

**Imagery and icons**
- High-contrast or halftone photos, collage, stickers, raw screenshots inside thick borders. Icons with a thick stroke (2.5–3px).

**Signature components**
- Bordered cards with offset shadows, chunky buttons, sticker-like tags, marquee strips, large numbered lists, tables with full-grid borders.

## Execution keys
1. **Two tokens carry the style:** border width and shadow offset. Define them once; every block uses them.
2. **Assigned color roles.** Say which color is the primary action, which is highlight, which is surface. Do not decorate with random colors.
3. **Big contrast in type.** Heavy, large display against plain body text. The size jump is what makes it feel intentional.
4. **Visible structure.** Section boundaries are drawn (borders), not implied.
5. **Controlled irregularity.** One or two elements rotated ≤ 2° or offset from the grid; everything else aligned.

## Where it breaks
- **Chaos instead of intent.** Many border widths, shadow sizes, and colors. *Fix:* lock the two tokens and a palette of three or four.
- **Vibrating or illegible color pairs** (yellow on pink, blue on black). *Fix:* text is ink on light blocks or white on dark blocks; measure any text on a colored block.
- **Offset shadows push content past the viewport** and cause horizontal scroll on mobile. *Fix:* include the shadow in padding or margin; reduce the offset to 3px on small screens.
- **Giant display text pushes the message below the fold.** *Fix:* use `clamp()` and check that the headline, the value statement, and the primary action are all visible in the first view.
- **Hard shadows on everything.** *Fix:* reserve them for interactive elements and key cards; flat blocks elsewhere.

## Keeping it legible
Ink on light blocks; body ≥ 16px; a 3px focus outline with a 3px offset in a contrasting color; physical hover and active states already communicate interactivity. Check text-on-color contrast with the audit.

## Starter tokens
```css
:root {
  --ink: #111; --paper: #fffdf5;
  --yellow: #ffd60a; --pink: #ff5ca8; --blue: #3a5bff;
  --bw: 3px; --offset: 4px; --radius: 0;
  --font-display: "Archivo", "Noto Sans SC", system-ui, sans-serif;
  --font-mono: "Space Mono", ui-monospace, monospace;
}
.block { border: var(--bw) solid var(--ink); border-radius: var(--radius);
  box-shadow: var(--offset) var(--offset) 0 var(--ink); background: var(--paper); }
.block:active { transform: translate(var(--offset), var(--offset)); box-shadow: none; }
```
