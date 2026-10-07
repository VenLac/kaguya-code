# Self-review and design-review checklist

Step 6, and the checklist for reviewing someone else's UI. Always judge a design **against the style it chose**: a brutalist page is not wrong for being raw, a Swiss page is not wrong for being sparse. What is wrong is failing the floor or failing the style's own keys.

## 1. Measure and look

1. Render the page and run the audit in `verify-in-browser.md` at desktop width (1440×900) and mobile width (390×844).
2. Take screenshots at both widths (and both themes if the product has them) and look at them.
3. Exercise key states: hover and focus on the main controls, the empty state, the error state, a loading state, a long-content case.
4. Fix, then re-run. Stop when the audit has no unexplained failures.

If no browser is available, say so, and review the code against this checklist; do not claim the visual result was verified.

## 2. Checklist

Mark each as pass, fail or not applicable.

### The floor (all styles)

- [ ] First view at 1440×900 and 390×844 shows the headline, a one-line value statement, the primary action, and some evidence of the product.
- [ ] Audit: no unexplained `low-contrast`, `horizontal-scroll`, `text-past-viewport`, `no-h1`, `h1-below-fold`, `no-action-in-first-view`.
- [ ] Audit: no essential text under 12px; `tiny-text` findings are confirmed non-essential.
- [ ] Every contrast figure quoted in comments or in the report came from the audit, not from estimation.
- [ ] One system: values come from tokens; same element, same treatment.
- [ ] A clear order at both widths (squint test: primary element first, then groups).
- [ ] No content depends on a scroll animation firing; it is visible with `prefers-reduced-motion`.

### The chosen style

- [ ] The three style keys named in the Brief are all present in the build.
- [ ] None of the style guide's "Where it breaks" failure modes is visible.
- [ ] The style's compensations for legibility are in place (see "Keeping it legible" in its guide).
- [ ] Nothing from a different style has been added without being named as the secondary.

### Hierarchy and layout

- [ ] One primary action per view; it is the most prominent interactive element.
- [ ] Spacing uses the scale; groups are separated by at least twice their inner gap.
- [ ] At most 3–4 left alignment edges (unless the style deliberately breaks the grid); text lines capped at 45–75 characters.

### Typography and color

- [ ] Sizes come from the scale; the number of families is deliberate.
- [ ] Body ≥ 14px for essential text; line-height fits the script (CJK about 1.7).
- [ ] Numbers in tables and counters use tabular figures.
- [ ] State is not communicated by color alone.
- [ ] Light and dark themes (if both exist) were each audited.

### Components and states

- [ ] Interactive elements have hover, focus-visible, active, disabled and, where relevant, loading and error.
- [ ] Data regions have loading, empty (first use and no results), error and partial states.
- [ ] Forms: visible labels, helper and error text, values kept on error; destructive actions are specific and reversible where possible.

### Motion and responsive

- [ ] Each animation has a purpose; durations and easing come from tokens; `prefers-reduced-motion` handled.
- [ ] Only `transform` and `opacity` animate for movement.
- [ ] Touch targets ≥ 44px on touch layouts; long names, big numbers and a single-row dataset render acceptably.

### Accessibility and robustness

- [ ] Everything works by keyboard with visible focus and a sensible tab order.
- [ ] Semantic elements used; icon-only controls and images have accessible names.
- [ ] Layout survives 200% zoom and text expansion.

### Follow mode only

- [ ] No new color, size, font or spacing value outside the existing tokens, and no second component for something the library already provides.

## 3. Reporting a review

Group findings by severity and give the concrete fix with a value:

- **Blocks use** — unreadable contrast, unreachable controls, broken layout at a common width, first view that does not explain itself, missing error handling.
- **Hurts clarity** — weak hierarchy, inconsistent spacing, unclear primary action, missing states, a style's keys missing.
- **Polish** — alignment, radius and shadow consistency, microcopy, motion refinement.

Format each finding as: **where** → **what is wrong** (with the measured number if it is a measurement) → **why it matters** → **fix (with values)**. Example:

> Top navigation, "Install" button → measured 1.18:1 (needs 4.5:1) because `.nav a` sets the link color and overrides `.btn` → visitors cannot read the main call to action → scope the link color to `.nav a:not(.btn)` so the button keeps its own color.

Do not report taste preferences as defects. If something is a choice within the page's chosen style, leave it.
