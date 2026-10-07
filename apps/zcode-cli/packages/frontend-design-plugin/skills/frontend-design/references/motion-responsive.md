# Motion and responsive design

Phase 7.

## Part A — Motion

### 1. Purpose test

Motion must do one of four jobs. If an animation does none, delete it.

1. **Orient** — show where something came from or went (a panel sliding from its trigger).
2. **Confirm** — acknowledge an action (button press, toggle, saved).
3. **Relate** — keep continuity between states (a list item expanding into detail).
4. **Delight, once** — one memorable moment per page or flow (a staged hero entrance).

### 2. Durations

| Kind | Duration |
| --- | --- |
| Micro: hover, press, color change | 100–150ms |
| Small: tooltip, dropdown, toggle | 150–200ms |
| Medium: modal, drawer, accordion | 200–300ms |
| Large: page transition, hero entrance | 400–700ms |

Exit animations are shorter than enter (about 70%). Anything repeated many times (list row hover, tab switch) stays ≤ 200ms. Nothing blocking runs longer than 300ms in a frequent flow.

### 3. Easing

| Use | Curve |
| --- | --- |
| Enter (decelerate) | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Exit (accelerate) | `cubic-bezier(0.7, 0, 0.84, 0)` |
| Move between positions | `cubic-bezier(0.65, 0, 0.35, 1)` |
| Progress, loops | `linear` |

Springs suit playful styles; keep overshoot under ~10% for UI, larger only for rewards.

### 4. Performance rules

- Animate `transform` and `opacity` (and sparingly `filter`). Do not animate `width`, `height`, `top`, `left`, `margin`.
- Animate height via `grid-template-rows: 0fr → 1fr` or `interpolate-size`, not `height: auto` hacks.
- Use `will-change` only on elements about to animate, and remove it afterward.
- Avoid layout shift: reserve space for images and async content (`aspect-ratio`, skeletons).

### 5. Orchestrated entrance (the one big moment)

- Stagger 40–80ms per item, at most 8 items, total ≤ 600ms; translate 12–24px plus opacity.
- Run once per page load or when scrolled into view (`IntersectionObserver`), never every time.
- If the style is calm, skip it and use a single quiet fade.

### 6. Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Replace large movement with opacity or an instant change; keep functional feedback (a focus ring still appears).

### 7. Do not

- Loop attention-seeking animations next to content people are trying to read.
- Heavy parallax, scroll-jacking, or animation that delays access to the content.
- Animate every hover on a page; pick the few that carry meaning.

## Part B — Responsive design

### 1. Mobile first

Write the base styles for the smallest screen and add complexity with `min-width` queries. Stack order on mobile equals priority order.

### 2. Breakpoints and fluid sizing

- Default breakpoints (adjust to content, not devices): `480 / 768 / 1024 / 1280px`.
- Fluid type and spacing with `clamp()`, for example `padding-inline: clamp(16px, 4vw, 48px)`.
- Components that live in different-sized containers use container queries (`container-type: inline-size`).
- Use `100dvh` (not `100vh`) for full-height mobile layouts; respect safe areas with `env(safe-area-inset-*)`.

### 3. Pattern conversions

| Desktop pattern | Mobile pattern |
| --- | --- |
| Left sidebar nav | Bottom tab bar (≤ 5) or a drawer |
| Multi-column grid | Single column; horizontal scroll carousel only for browsable media |
| Data table | Card list with key fields, or horizontal scroll with sticky first column |
| Hover-revealed actions | Always-visible overflow menu or swipe actions |
| Modal dialog | Bottom sheet or full-screen page |
| Side-by-side detail | Push navigation |
| Dense toolbar | Primary action + overflow |

### 4. Touch and input

- Targets ≥ 44px; spacing ≥ 8px; primary controls reachable by thumb.
- Input text ≥ 16px to prevent iOS zoom; correct `inputmode` and `type`.
- Use `@media (hover: hover) and (pointer: fine)` for hover-only refinements.
- No horizontal page scroll at any width; check long words and wide code blocks (`overflow-x: auto` on the block).

### 5. Images and media

- Always set `width/height` or `aspect-ratio`; `object-fit: cover` for crops; `srcset`/`sizes` for photos; lazy-load below the fold.

### 6. What to test

Check 375, 768 and 1440px wide (plus a 320px sanity check and 1920px for wide layouts), in both orientations when the product is used on phones, and with long content (a 60-character name, a 5-digit count) and short content (one row).
