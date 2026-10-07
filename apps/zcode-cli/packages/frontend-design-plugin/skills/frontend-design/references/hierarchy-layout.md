# Hierarchy, layout and spacing

Phase 3. Decide what matters most, then place and space everything so the eye finds it in that order. Each rule: rule → why → values → when to break.

## 1. One primary per view

- **Rule:** every screen or section has exactly one primary message or action. Everything else is secondary or background.
- **Why:** when everything is emphasized, nothing is. Users scan; they do not read.
- **Values:** at most **three emphasis levels** per view (primary, secondary, tertiary). Primary uses two or more channels at once (size + weight, or color + space); secondary uses one; tertiary uses none beyond being smaller or muted.
- **Channels, strongest first:** size, contrast/color, weight, whitespace around it, position (top-left of reading order), shape (filled vs outline).
- **Break when:** a screen is a genuine peer list (a file browser); then hierarchy lives in the list structure, not in one hero element.

## 2. Three tests to run on any layout

1. **Squint test.** Blur your eyes or view the screenshot at 25% size. You should still see the primary element first, then the groups. If it is mush, hierarchy is weak.
2. **Removal test.** For each element ask "if I delete this, what is lost?" If the answer is "nothing", delete it. Decoration that survives this test is rare.
3. **Grayscale test.** Mentally remove color. Hierarchy should survive on size, weight, spacing and position alone; color then only reinforces it.

## 3. Spacing system

- **Rule:** one base unit, one scale, used everywhere.
- **Values:** base 4px (dense) or 8px (everything else). Scale: `4, 8, 12, 16, 24, 32, 48, 64, 96, 128`. Use at most about six distinct values on one screen.
- **Proximity:** gap *inside* a group ≤ half the gap *between* groups. Example: label→input 6–8px, field→field 16–20px, section→section 40–64px.
- **Padding vs gap:** container padding ≥ the largest gap inside it, otherwise content looks cramped against its own edge.
- **Rhythm:** vary section heights and layouts deliberately. Ten sections of identical height and structure read as a template.
- **Break when:** optical correction is needed (icon next to text, large display type with built-in side bearing). Adjust by 1–3px by eye, keep the exception local.

## 4. Grid and measure

- **Columns:** 12 on desktop, 8 on tablet, 4 on mobile. Gutters 16 / 24 / 32px. Page margin 16px on mobile, 24–48px on desktop.
- **Content widths:** reading text 60–72ch (about 640–720px); marketing container 1120–1280px; app shell fluid with content capped at 1200–1440px for forms and settings.
- **Alignment:** a screen has at most 3–4 distinct left edges. Align text baselines across a row, not box tops. Numbers in tables are right-aligned with tabular figures; text is left-aligned; never center a table column of mixed lengths.
- **Alignment of text:** left-aligned by default. Center only short, self-contained text (a heading and one or two lines). Never justify on screens.

## 5. Containment: choose it deliberately

- **Rule:** space, dividers, surfaces and bordered cards each group things differently and each has a cost. Choose the one that fits your style and use it consistently.
- **Why:** unplanned nesting (a card in a card in a card) adds noise and eats width without adding meaning. Planned containment (a bento grid of tiles, a brutalist bordered block, a hairline-ruled editorial page) is a style, and works because it is consistent.
- **Values:** by default, separate a surface with **one** of border, shadow or background difference; combine them only when the style defines the combination (a brutalist thick border plus a hard shadow). Keep nesting to two levels unless the style requires more.
- **Use a card when** an item is an independent, actionable unit (a project, a product, a plan). If the style is built from tiles, give each tile one idea.
- **Nested radius:** inner radius = outer radius − padding (outer 16px with 8px padding → inner 8px).

## 6. Page patterns that work

**Landing page** — Hero (value proposition + one primary CTA + proof or product visual) → proof (logos or real numbers) → how it works (3–4 steps, vary the layout) → one deep feature section per major benefit, alternating layouts → social proof with real names/roles → pricing or CTA → footer. Only one primary CTA style per page; repeat it, don't invent new ones.

**Dashboard** — Page title + global filters → KPI strip (3–5 numbers, each with a delta and a time frame) → primary chart or timeline → supporting table. Put the question the user came to answer in the top-left.

**List/detail or table pages** — Sticky header with search, filters and primary action; dense rows with a clear primary column; row actions revealed on hover *and* focus, always reachable on touch; empty and filtered-empty states.

**Settings** — Left nav (or top tabs on mobile) + sectioned form, one section per concern. Each section: title, one-line explanation, controls, and its own save (or auto-save with feedback).

**Forms** — Single column, labels above, related fields grouped under a short heading, optional marked rather than required marked when most are required, primary button left-aligned with the inputs, secondary action visually quieter.

**App shell** — Navigation (left rail 56–72px collapsed or 220–280px expanded, or bottom tabs on mobile) + top bar for context and actions + content. The shell does not compete with the content: low contrast, no large color blocks.

## 7. Targets and ergonomics

- Pointer targets: at least 32×32px on desktop dense UIs, 44×44px on touch (48px recommended). Space between adjacent targets ≥ 8px.
- Primary actions in thumb reach on mobile (bottom third) when they are used often.
- Do not hide essential actions behind hover; hover is a convenience on top of a visible or focusable path.

## 8. Depth

- Define three elevation levels and reuse them: base (no shadow), raised (cards, popovers), overlay (modals, menus). Do not invent a new shadow per component.
- Dark themes show elevation with lighter surfaces, not shadows (see `color.md`).

## Common failures, quick fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Page feels flat or boring | one font size, one weight, one gap | widen the scale between levels; vary section spacing |
| Page feels noisy | too many boxes, colors, weights | apply the removal test; drop borders; limit to one accent |
| Elements feel random | many left edges, many spacing values | snap to the grid and the scale |
| Primary button is not obvious | competing filled buttons | one filled primary per view; others outline or text |
| Cramped even though there is space | gap inside group ≈ gap between groups | separate groups by at least 2× the inner gap |
