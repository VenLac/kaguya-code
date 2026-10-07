# Color and theme

Phase 5. Build color in a fixed order: neutrals → accent → semantic → surfaces → verify contrast. Then define light and dark deliberately.

## 1. Order of work

1. **Neutrals.** They cover ~90% of the screen. Pick a hue and tint them toward it with very low chroma (OKLCH chroma 0.005–0.02). Pure gray looks lifeless next to a colored accent.
2. **One accent.** Used for the primary action, links, selection, focus and one highlight. Everything else stays neutral.
3. **Semantic colors.** Success, warning, error, info. They carry meaning, not decoration.
4. **Surfaces.** Page, surface, raised, overlay (see §5).
5. **Verify contrast** (see §4) in every theme.

## 2. Choosing the accent

- The accent follows the **style and the subject**. Any hue is legitimate, including indigo, violet and gradients, when the style or brand calls for them. What matters is that it is a decision with a reason, not a default you reached for.
- Start from the style guide's palette logic (a neon style uses one or two neons on a dark ground; an editorial style uses one ink color on paper; a playful style uses three or four colors with assigned roles), then tune.
- **Locale matters.** In mainland-China finance contexts, red means rising and green falling — the opposite of many Western conventions. Check the audience before assigning up/down colors.
- **Roles, not hues.** Decide which color means "primary action", which means "selected", which means each status. Use each role consistently.
- Accent area is set by the style: a few percent for restrained styles, large fields for loud ones (60/30/10 is a useful default: neutral 60, secondary 30, accent 10).

## 3. Building ramps in OKLCH

Use OKLCH so steps look evenly spaced and hues stay stable. Keep hue constant, vary lightness, and raise then lower chroma across the ramp (peak near the middle).

```css
/* 10-step lightness ladder (L values), constant hue H */
/* 50: 0.97  100: 0.93  200: 0.87  300: 0.78  400: 0.68 */
/* 500: 0.58  600: 0.48  700: 0.40  800: 0.30  900: 0.22  */
--accent-500: oklch(0.58 0.19 255);
--accent-600: oklch(0.50 0.18 255);
--neutral-50: oklch(0.975 0.006 255);
--neutral-900: oklch(0.22 0.012 255);
```

Check gamut: very high chroma at extreme lightness falls outside sRGB; reduce chroma rather than letting the browser clip it. Provide a hex fallback only if you must support old browsers.

## 4. Contrast requirements

| Element | Minimum contrast |
| --- | --- |
| Body text and text under 24px (or 19px bold) | 4.5 : 1 |
| Large text (≥ 24px, or ≥ 19px bold) | 3 : 1 |
| UI component boundaries, icons that carry meaning | 3 : 1 |
| Focus indicator against adjacent colors | 3 : 1 |
| Placeholder and secondary text | 4.5 : 1 (treat like text) |

- White text on an accent generally needs the accent at OKLCH L ≲ 0.55; always compute the ratio rather than trusting a rule of thumb.
- Do not communicate state by color alone: pair with an icon, text or shape (error = red + icon + message).
- Disabled controls may fall below 4.5:1 but must remain discernible (≈ 3:1) and explain themselves where possible.

## 5. Surfaces and elevation

Define four tokens and reuse them:

| Token | Role |
| --- | --- |
| `--color-bg` | page background |
| `--color-surface` | cards, panels, inputs |
| `--color-surface-raised` | popovers, dropdowns, hovered rows |
| `--color-overlay` | modal scrim `oklch(0 0 0 / 0.4–0.6)` |

- **Light theme:** show elevation with a 1px border and a soft shadow, not with big lightness jumps.
- **Dark theme:** show elevation with lighter surfaces (about +0.03 to +0.05 OKLCH L per level) and drop heavy shadows.
- Borders: `1px` at 8–12% of the text color; use stronger borders only for inputs and focus.

## 6. Semantic color set

For each of success / warning / error / info define a trio:

| Part | Light theme L | Dark theme L |
| --- | --- | --- |
| Tint background | ~0.96 | ~0.26 |
| Border | ~0.85 | ~0.38 |
| Text/icon | ~0.40 | ~0.80 |

Hues: green ~145–155, amber ~75–85, red ~25–30, blue ~245–255. Warning text on a yellow tint must still reach 4.5:1: use a dark amber for text, not yellow.

## 7. Dark mode is a second design

- Do not invert. Background `oklch(0.14–0.20 0.01 H)` (not `#000`), primary text `oklch(0.92–0.95 …)` (not `#fff`), secondary `oklch(0.70 …)`.
- Raise accent lightness 0.05–0.10 and slightly lower chroma so it does not vibrate.
- Replace shadows with borders and lighter surfaces; borders become white at 6–12% alpha.
- Re-check every semantic color and every chart color; dim large photographic images slightly (`filter: brightness(0.9)`).
- Implementation: tokens on `:root` for light, overrides under `@media (prefers-color-scheme: dark)` and under an explicit `[data-theme="dark"]` (and `[data-theme="light"]` to force light) so the user can choose; set `color-scheme: light dark` so native controls follow.

## 8. Gradients and effects

Gradients, glow, glass and noise are materials. Whether to use them is a style decision; the points below are about making them work.

- **Muddy midpoints.** Blending complementary hues in sRGB produces a gray middle. Interpolate in OKLCH (`linear-gradient(in oklch, …)`) or add a lighter intermediate stop, or keep the hues analogous.
- **Banding.** Smooth, low-contrast gradients on large areas band. A 3–6% noise overlay, or slightly more chroma variation, hides it.
- **Text on gradients.** Measure contrast at the worst point behind the text, not the average. Put a scrim or a solid plate behind text that crosses a bright stop.
- **Gradient text.** Fine as a headline accent; make sure the lightest stop still meets large-text contrast against the background.
- **Blur and glow cost performance.** Large `blur()` blobs and many `backdrop-filter` layers are expensive on low-end devices; limit the count and the area, and give a solid fallback.
- **Dark glow vs. light glow.** Glow reads on dark backgrounds and disappears on light ones; on light, use shadow or color fields instead.

## 9. Token naming

Two layers: primitives hold the raw ramps (`--blue-500`); semantic tokens are what components use.

```css
:root {
  color-scheme: light dark;
  --color-bg: var(--neutral-50);
  --color-surface: oklch(1 0 0);
  --color-text: var(--neutral-900);
  --color-text-muted: oklch(0.45 0.012 255);
  --color-border: oklch(0.22 0.012 255 / 0.12);
  --color-accent: var(--accent-500);
  --color-accent-contrast: oklch(0.99 0 0);
  --color-focus: var(--accent-500);
}
```

Components reference semantic tokens only. Renaming a theme then touches one layer.

## 10. Data visualization colors

- Categorical series: at most 6–8 distinguishable hues, with lightness varied so they survive grayscale and common color-vision deficiencies; label directly instead of relying on a legend where possible.
- Sequential data: one hue, light to dark. Diverging data: two hues meeting at a neutral midpoint.
- If a data-visualization skill is available in the session, load it before building charts.
