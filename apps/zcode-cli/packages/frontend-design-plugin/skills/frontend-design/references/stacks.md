# Stack notes

Principles in the other references are stack-agnostic and expressed as CSS variables. This file shows how to land them in common stacks. **Detect the stack in phase 0 and use the project's own tools; do not add a new styling system.**

## 1. Token foundation (works everywhere)

Define tokens once in a global stylesheet. Components read them; nothing else hard-codes values.

```css
:root {
  color-scheme: light dark;

  /* color: semantic layer (primitives live above this) */
  --color-bg: oklch(0.975 0.006 255);
  --color-surface: oklch(1 0 0);
  --color-text: oklch(0.22 0.012 255);
  --color-text-muted: oklch(0.45 0.012 255);
  --color-border: oklch(0.22 0.012 255 / 0.12);
  --color-accent: oklch(0.58 0.19 255);
  --color-accent-contrast: oklch(0.99 0 0);

  /* type */
  --font-sans: "Your Sans", ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  --text-sm: 0.8rem; --text-base: 1rem; --text-lg: 1.25rem; --text-xl: 1.563rem; --text-2xl: 1.953rem;
  --leading-body: 1.55; --leading-heading: 1.15;

  /* space (4px base) */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;

  /* shape and depth */
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;
  --shadow-1: 0 1px 2px oklch(0.25 0.02 255 / 0.08);

  /* motion */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 400ms;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* dark overrides */ }
}
:root[data-theme="dark"] { /* same dark overrides */ }
```

Dark overrides are listed twice on purpose so both the OS preference and an explicit user choice work. Generate them from one source (a build step, a mixin, or a small script) instead of copy-pasting.

## 2. Tailwind

- **v4:** declare tokens in CSS with `@theme { --color-accent: ...; --font-sans: ...; }`; utilities such as `bg-accent` are generated from them.
- **v3:** extend `theme.extend.colors/fontFamily/spacing/borderRadius` and point values at the CSS variables (`accent: "var(--color-accent)"`) so theming stays in CSS.
- Do not scatter arbitrary values (`w-[317px]`, `text-[#7c3aed]`); add a token instead.
- Extract repeated utility groups into a component, not into `@apply` piles.
- Dark mode: use the project's configured strategy (`class`/`data-theme` or media); keep one.

## 3. React

- Variants through a single typed API (`cva`, `tv`, or a variant map), not boolean-prop explosions.
- Compose from the project's primitives (Radix, Headless UI, React Aria, the in-repo `ui/` package) for focus handling, keyboard behavior and ARIA; do not rebuild menus, dialogs or comboboxes by hand.
- Keep presentational components free of data fetching; pass loading/empty/error as props or render them in the container.
- Animate with CSS first; add a motion library only when the project already has one or the interaction truly needs layout or spring animation.

## 4. Vue / Svelte

- Scoped styles read the same CSS variables. Use transitions provided by the framework for enter/leave, with durations from tokens.
- Use the framework's accessible primitives (Headless UI Vue, Bits UI, Melt, Radix Vue) rather than hand-rolled widgets.

## 5. Plain HTML/CSS

- One `tokens.css`, one `base.css` (reset, typography, focus), one stylesheet per page or component group. Use native `<dialog>`, `<details>`, `popover` and `<select>` where they fit.
- Use `@layer reset, tokens, base, components, utilities;` to keep specificity predictable.

## 6. Component libraries (MUI, Ant Design, shadcn/ui, Element, etc.)

- Theme through the library's theme object/tokens, not by overriding class names with `!important`.
- Customize the tokens that carry your direction: color palette, font family, radius, density/size, shadows. Leave the rest alone.
- A heavily default-themed library is a recognizable look; the quickest differentiation is a deliberate typeface, accent, radius and spacing density.

## 7. Fonts and assets

- Prefer packaged fonts (`@fontsource/*`) when the app must run offline or in Electron; use a CDN only for web-only products.
- Subset to needed scripts; limit to the weights actually used (usually 3).
- SVG icons from one set, imported per icon to keep bundles small.

## 8. Theming and i18n hooks

- Respect existing theme and language switchers; read them, don't add a parallel one.
- Use logical CSS properties and `Intl` formatting so layouts hold across languages and writing modes.

## 9. Before finishing in any stack

- No raw hex, no raw px for spacing or font sizes outside the token layer.
- Component states implemented as CSS (`:hover`, `:focus-visible`, `[disabled]`, `[aria-invalid]`, `[data-state]`), not only as JS class toggles.
- The project's lint, typecheck and formatting commands pass, and you report their actual results.
