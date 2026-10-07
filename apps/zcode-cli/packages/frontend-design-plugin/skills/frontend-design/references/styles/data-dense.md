# Data-dense

## Essence
An instrument panel: a lot of information on one screen, arranged so a trained eye can scan, compare and act quickly. The chrome is quiet so that the data is the loudest thing. It suits analytics, operations, trading, admin and monitoring tools.

## Core ingredients

**Type**
- A compact, legible sans for UI (Geist, IBM Plex Sans, Hanken Grotesk, Inter Tight) and a mono or tabular face for numbers and IDs (JetBrains Mono, IBM Plex Mono, Geist Mono). Base 13–14px, ratio 1.125–1.2, weights 400/500/600. `font-variant-numeric: tabular-nums` everywhere numbers are compared.

**Color**
- Muted neutrals (light `#F7F8FA` or dark `#0F1115`), one accent for selection and the primary action, semantic colors reserved for status (ok, warn, error) and for meaning in charts. Chart palettes of at most 6–8 distinguishable colors.

**Shape and space**
- 4px base, row height 28–36px, control height 28–32px, radius 4–6px, 1px borders at 8–10% ink. Tight but not cramped: row padding 6–10px vertical, 12px horizontal.

**Depth**
- Almost flat. Shadows only for floating layers (menus, popovers, dialogs). Surfaces are separated by a hairline and a one-step tone change.

**Motion**
- 100–150ms color and opacity changes only. No entrance animation.

**Imagery and icons**
- Charts and sparklines are the imagery. Icons are 14–16px, one family, mostly in muted ink.

**Signature components**
- Dense tables with sticky headers and sticky first column, filter bars, KPI strips (number, delta, time frame), command palette, split panes, inline editing, keyboard hints.

## Execution keys
1. **The data is the loudest thing.** Muted chrome, strong numbers. The number the user came for gets the largest size and the strongest contrast.
2. **Alignment is everything.** Numeric columns right-aligned with tabular figures; consistent decimals; units muted next to values.
3. **Every number has context.** A time frame, a comparison (delta, trend), and a unit.
4. **Filters and state always reachable.** Sticky toolbar, visible active filters, clear "reset".
5. **Keyboard-complete.** Focus ring always visible; shortcuts discoverable; row actions available by keyboard.

## Where it breaks
- **Dense becomes cramped** (no row padding, tiny text). *Fix:* keep text ≥ 12px for essential content (13–14px for body), row height ≥ 28px, 12px side padding.
- **Everything competes** (colored badges, bold labels, borders everywhere). *Fix:* muted default; color only for state and for the one thing to notice.
- **Rainbow charts.** *Fix:* single hue for single series; at most 6–8 colors for categories; label directly where possible.
- **Hover-only row actions** unreachable by touch and keyboard. *Fix:* show actions on hover and on focus-within; a visible overflow menu on touch.
- **Wide tables break on small screens.** *Fix:* horizontal scroll with a sticky first column, or switch to a card list under ~640px.

## Keeping it legible
Density is the style's point, so legibility comes from alignment and contrast, not from size. Audit contrast on muted secondary text (it tends to fall to 3:1), and keep body ≥ 13px.

## Starter tokens
```css
:root {
  --bg: #f7f8fa; --surface: #fff; --ink: #14171c; --muted: #5d6673;
  --border: rgb(20 23 28 / 0.1); --accent: oklch(0.55 0.16 255);
  --ok: #1a7f4b; --warn: #a15c00; --err: #b3261e;
  --row: 32px; --pad-x: 12px; --radius: 5px;
  --font: "Geist", "Noto Sans SC", ui-sans-serif, system-ui, sans-serif;
  --font-num: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
}
td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--font-num); }
thead th { position: sticky; top: 0; background: var(--surface); }
```
