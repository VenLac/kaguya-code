# Minimal and Swiss

## Essence
Grid, type and whitespace carry everything. Flat, precise, and unadorned: strong alignment, a disciplined type scale, a small palette, and content with room around it. It is the International Typographic Style meeting the web. It suits product studios, documentation, portfolios, tools and any subject that benefits from clarity.

## Core ingredients

**Type**
- One grotesk family in two or three weights (Hanken Grotesk, Schibsted Grotesk, Instrument Sans, Geist). Large headings (48–120px) with tight tracking (−0.02em to −0.03em), small restrained body (15–17px), a clear size jump (at least 3:1 between heading and body). Flush-left, ragged-right; numerals as graphic elements.

**Color**
- White or off-white (`#FFFFFF`, `#F2F2EF`) and black ink (`#111`), plus **one** signal color (red `#E4002B`, orange `#FF5A00`, blue `#0050FF`). Dark variant with the same discipline.

**Shape and space**
- Strict 12-column grid; at most 3–4 left edges; 8px base; spacing multiples of 8; radius 0–4px; hairlines (1px) for structure; asymmetric layouts (text in some columns, image in others).

**Depth**
- Flat. No shadows except for floating layers.

**Motion**
- Minimal: 150–250ms for state changes, a restrained reveal on scroll. Nothing decorative.

**Imagery**
- Few, crisp images, documentary or product photography, diagrams on the grid, a single illustration style.

**Signature components**
- Index lists with large numerals, tables as design elements, ruled sections, text-only navigation, oversized headings aligned to the grid.

## Execution keys
1. **Alignment is the decoration.** Everything snaps to the grid; a few strong left edges.
2. **Scale contrast does the hierarchy.** Not color, not boxes.
3. **Whitespace is structure.** Groups separate by space and hairlines, not by cards.
4. **One signal color** for the primary action and the single thing to notice.
5. **Restraint with substance.** Real copy, real content, nothing filler.

## Where it breaks
- **Looks empty or unfinished.** *Fix:* make the type scale bold enough (heading at least 3× body), use a strong grid, and put real content in; whitespace works only around something strong.
- **Everything is the same size and gray.** *Fix:* a dominant element per view and one signal color.
- **Thin gray text for refinement.** *Fix:* body ink at ≥ 7:1 where possible; secondary text ≥ 4.5:1; avoid light weights below 18px.
- **Navigation too subtle to find.** *Fix:* clear labels, visible active state, a visible primary action in the first view.
- **Sparseness hides the primary action below the fold.** *Fix:* check the first view at 1440×900 and 390×844.

## Keeping it legible
This style is naturally high-contrast; the risk is under-weight type and a hidden primary action. Verify the first view and the secondary text contrast.

## Starter tokens
```css
:root {
  --bg: #f2f2ef; --ink: #111; --muted: #54545a; --signal: #e4002b;
  --rule: 1px solid #11111a33; --u: 8px;
  --font: "Hanken Grotesk", "Noto Sans SC", system-ui, sans-serif;
  --step-0: 1rem; --step-3: clamp(2.5rem, 6vw, 6rem);
}
.grid { display: grid; grid-template-columns: repeat(12, 1fr); column-gap: calc(var(--u) * 3); }
h1 { font: 600 var(--step-3)/0.98 var(--font); letter-spacing: -0.03em; }
```
