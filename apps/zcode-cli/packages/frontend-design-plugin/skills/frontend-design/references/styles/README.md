# Styles: choosing, mixing, and deriving

This directory holds **execution guides**, one per style. They describe how to make a style work. They do not rank styles, recommend styles, or warn you off any of them. Any style is allowed.

## 1. Who decides the style

In this order:

1. **The user** — "like Linear", "cyberpunk", "minimal", "make it feel like a 90s magazine". Use it.
2. **The project** — an existing design system or existing pages. Follow it.
3. **You** — nothing was specified. Choose what you judge right for the subject, and say why in one sentence.

A subject suggests *requirements* (see `../context-and-constraints.md`), not a style. A finance dashboard can be Swiss, dark-technical, or brutalist; each can be done well, and each has different things to get right.

## 2. Available guides

Listed alphabetically. Order carries no preference.

| Guide | One-line essence |
| --- | --- |
| `bento-grid.md` | A grid of varied-size tiles, each tile one idea, product UI inside the tiles |
| `brutalist.md` | Raw structure on purpose: thick borders, hard shadows, flat blocks, loud type |
| `corporate-clean.md` | Trustworthy and orderly: clear structure, restrained color, no surprises |
| `cyberpunk-neon.md` | Dark HUD with neon light: glow, angled frames, techno type |
| `dark-technical.md` | Developer/terminal feel: near-black, mono, one vivid accent, thin borders |
| `data-dense.md` | Instrument-panel density: compact rows, tabular numbers, muted chrome |
| `editorial.md` | Magazine typography: serif display, narrow measure, rules and captions |
| `glassmorphism.md` | Frosted translucent panels floating over a colorful backdrop |
| `gradient-aurora.md` | Gradient and mesh color as the main material; glowing, atmospheric |
| `luxury-refined.md` | Quiet, high-end: large light serif, wide-tracked caps, space, imagery |
| `minimal-swiss.md` | Grid, type and whitespace carry everything; flat and precise |
| `playful-pop.md` | Saturated, rounded, characterful; stickers, thick outlines, springy motion |
| `retro-pixel.md` | Pixel and early-computing looks: bitmap type, limited palettes, hard edges, Y2K variants |
| `soft-ui.md` | Soft extruded surfaces: neumorphism and claymorphism |
| `warm-organic.md` | Earthy, tactile, human: natural palette, soft shapes, texture |

Every guide has the same structure:

1. **Essence** — what the style is.
2. **Core ingredients** — type, color, shape and space, depth, motion, imagery, signature components, with concrete values.
3. **Execution keys** — what makes it read as this style.
4. **Where it breaks** — the failure modes particular to this style, and the fix.
5. **Keeping it legible** — how to meet the floor (`../craft-floor.md`) *inside* this style.
6. **Starter tokens** — a CSS starting point.

## 3. Mixing styles

A mix is a legitimate choice. Make it deliberate:

- Name a **primary** and a **secondary**. The primary decides layout, type and color; the secondary contributes one or two named ingredients (for example, Swiss layout with a glass panel for one overlay).
- Share one axis (usually the grid or the type) so the two feel like one system.
- Do not average. Averaging two styles gives neither.
- Read both guides' "Where it breaks" sections; mixed styles inherit both sets of failures.

## 4. Styles without a guide

If the style is niche, a named reference ("like Stripe", "Dieter Rams", "vaporwave"), or something you are inventing, derive the guide yourself before building. Answer these five points in a few lines each, and put them in the Brief:

1. **Essence.** In one sentence, what does this look like and feel like? Name the real-world reference (a printed object, a screen era, a material, a product) that it comes from.
2. **Ingredients on seven axes.** Type; color; shape and space; depth and surface; motion; imagery and icons; signature components. Give a value or range for each, not an adjective. If you do not know a value, derive it from the reference (what typefaces, what palette sizes, what edge treatment does the reference actually use?).
3. **Mechanics.** What *technically* produces the look (backdrop-filter, hard offset shadows, bitmap fonts with integer scaling, text-stroke, mesh gradients)? Style is mostly a few mechanics applied consistently. List them.
4. **Failure modes.** What does this style look like when under-done (reads as an unfinished default), over-done (noise), or when it costs legibility (thin neon text, translucent panels over bright spots, low-contrast soft shadows)? Write the fix for each.
5. **Legibility plan.** For each place the style reduces contrast, size, or clarity, say how you compensate (a scrim under text, a heavier weight, a solid fill for the primary action).

When translating a named reference ("like Linear"), do not copy surface details. Extract the axes: its type, its density, its color roles, its shape language, its motion, and what it does *not* do.

## 5. Using a guide well

- The guide's values are a working starting point, not a limit. Adjust to the subject; keep the internal consistency.
- "Where it breaks" is the most valuable section. Read it before building and check against it before finishing.
- The floor in `../craft-floor.md` applies to every style. A style can be loud; the visitor must still be able to read it and know what to do.
