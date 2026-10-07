# Soft UI (neumorphism and claymorphism)

## Essence
Surfaces that look gently extruded from, or inflated on, the background. **Neumorphism** uses a single background color with paired light and dark shadows so elements look molded from the same material. **Claymorphism** uses puffy, rounded, pastel 3D shapes with inner highlights. Both feel tactile and calm. They suit small, focused tools (calculators, smart-home controls, music players, wellness apps) and brand moments, more than dense information.

## Core ingredients

**Type**
- A soft geometric sans (Nunito, Quicksand, Outfit, DM Sans) at weights 500–700; titles 20–40px, body 15–17px. In soft styles, make type slightly heavier than usual so it does not wash out.

**Color**
- Neumorphism: one mid-light base (`#E6EAF0`) and shadows derived from it: light `rgb(255 255 255 / 0.9)`, dark `rgb(163 177 198 / 0.6)`. Accent colors only on active state and the primary action. Claymorphism: pastel fields (peach, lilac, mint, sky) with stronger saturated accents.

**Shape and space**
- Radius 16–40px, circles and pills, generous padding (20–32px), spacing 8px base, large touch targets (48–64px).

**Depth and surface (the mechanics)**
- Neumorphic raised: `box-shadow: 8px 8px 16px var(--shadow-dark), -8px -8px 16px var(--shadow-light)`; pressed: the same shadows `inset`. Claymorphic: `box-shadow: inset -6px -6px 12px rgb(0 0 0 / .08), inset 6px 6px 12px rgb(255 255 255 / .7), 0 14px 28px rgb(0 0 0 / .12)`.

**Motion**
- 150–250ms ease transitions between raised and pressed; gentle scale on press (0.98).

**Imagery**
- 3D clay objects, soft illustrations, rounded icons with a consistent stroke; avoid photography with hard contrast.

**Signature components**
- Raised and pressed buttons, toggles and sliders with a molded track, circular dials, knobs, cards that look pillowy.

## Execution keys
1. **Shadow pair is consistent.** Same light direction, same blur and distance scale across the page.
2. **Surface equals background (neumorphism).** The material illusion depends on matching colors.
3. **State uses depth.** Raised = available, pressed/inset = active or selected.
4. **Use sparingly.** Soft elements for a few controls, flat for the rest.
5. **Accent for meaning.** Color marks active state and the primary action, since depth alone is low-contrast.

## Where it breaks
- **Low contrast and unclear boundaries** (the style's main accessibility problem). *Fix:* add a 1px border at 6–10% ink where an element must be perceivable; give text strong ink (≥ 7:1); do not rely on shadow alone to show interactivity.
- **Active and disabled look alike.** *Fix:* use color or an icon change for selected; reduced opacity plus a label change for disabled.
- **Muddy overall look from stacked shadows.** *Fix:* limit soft elements per screen; keep large areas flat.
- **Primary action not obvious.** *Fix:* a solid accent fill with high-contrast label for the primary button.
- **Dark theme.** *Fix:* build a separate dark palette with its own shadow pair (darker and slightly lighter than the base); do not invert.

## Keeping it legible
Text and icons at strong contrast; focus ring with a solid color outline; the primary action as a solid accent; measure the audit's contrast for labels on soft surfaces.

## Starter tokens
```css
:root {
  --base: #e6eaf0; --ink: #2b3340; --accent: oklch(0.58 0.16 255);
  --sh-dark: rgb(163 177 198 / 0.6); --sh-light: rgb(255 255 255 / 0.9);
  --radius: 24px;
}
.raised  { background: var(--base); border-radius: var(--radius); box-shadow: 8px 8px 16px var(--sh-dark), -8px -8px 16px var(--sh-light); }
.pressed { background: var(--base); border-radius: var(--radius); box-shadow: inset 6px 6px 12px var(--sh-dark), inset -6px -6px 12px var(--sh-light); }
.btn-primary { background: var(--accent); color: #fff; border-radius: var(--radius); }
```
