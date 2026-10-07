---
name: frontend-design
description: Guides frontend design when building, redesigning, polishing or reviewing any user interface — pages, components, app shells, landing pages, dashboards, forms, mobile web — in any stack and any visual style. You choose the style freely (or follow the user's or the project's); this skill then gives the execution guide for that style and a measured quality floor so the result is readable and usable whatever the style. Use when the user asks to design, create, restyle, beautify or "make it look good", or asks for a design review. Do not use for logic-only frontend changes. 指导前端设计：风格由你自由选择（或沿用用户、项目已有风格），选定后提供该风格的执行指南，并用实测守住可读性底线。新建、重做、美化界面或做设计评审时使用。
---

# Frontend design

You are the designer. **The style is your choice** — this skill never tells you which style to pick or which to avoid. Its job is to help you execute the style you chose so that it actually works, and to hold a floor that applies to every style: a visitor can read it and use it.

References are in `references/` next to this file; style guides are in `references/styles/`. Read each only when you reach its step.

## Hard rules

1. **Existing conventions win.** If the project defines a design (a `DESIGN.md`, token or theme files, a component library, existing pages), follow it and extend it; do not invent a second system.
2. **Choose a style, then commit to it.** Half-committed mixes look accidental. Whatever you choose, do it fully and consistently.
3. **Decide before you code.** Show the Design Brief (below) before writing UI code.
4. **Values, not adjectives.** "Clean", "modern", "bold" are not decisions. Back each decision with a value, a ratio, a token, or a testable condition.
5. **Real content.** Write believable copy and data first. No lorem ipsum, no "Feature One".
6. **Tokens first.** Colors, type sizes, spacing, radii, shadows, durations are defined once (CSS variables or the project's equivalent) and referenced.
7. **Measure, do not assert.** Never write or claim a contrast ratio, size, or "passes" that you did not measure on the rendered page. Run the audit (step 6).

## Step 0 — Read the context

Look before deciding. Check, and stop at the first that defines a system:

- `DESIGN.md`, `docs/design*`, `STYLEGUIDE*`, brand docs
- token or theme files: global CSS variables, `tailwind.config.*`, `theme.*`, `tokens.*`
- the component library in use (shared `ui/` package, shadcn, MUI, Ant Design, ...) — reuse its components
- two or three existing pages near the one you are building

Then pick the mode:

- **Follow mode** — a system exists. Your Brief lists what you will follow and any new tokens you must add. You do not choose a new style; steps 3–6 still apply as quality standards.
- **Create mode** — nothing exists. Run every step, including choosing a style.

Also read project instructions that govern UI (theming, i18n, platform and mobile differences) and respect them.

## Step 1 — Understand the subject

Read `references/context-and-constraints.md`.

Who uses this, doing what, in what situation? The answer gives you **functional requirements** (a dashboard must be scannable; a landing page must explain itself; a form must be completable). It does not give you a style.

## Step 2 — Content first

Write the actual headings, labels, button text, empty-state copy and a realistic data sample (varied lengths, uneven numbers, one long name, one missing value). Use the user's language; for Chinese UI also apply the CJK rules in `references/typography.md`.

## Step 3 — Choose the style (Create mode)

Read `references/styles/README.md`.

Priority: **the user's stated style → the project's existing style → your own choice.** If you choose, pick any style you judge right for the subject and say why in one sentence. There is no recommended list and no forbidden style.

Then read that style's guide (`references/styles/<style>.md`). It tells you the core ingredients, what makes the style read correctly, where it typically breaks, and how to keep it legible. If there is no guide for your style (a niche style, a mix, something you invent), follow the derivation method in `styles/README.md` and write the same five points for yourself before continuing. For a mix, name a primary and a secondary style.

## Step 4 — Design Brief (mandatory output)

Before writing UI code, show the user a short brief: 6–8 lines, each with a one-sentence reason.

**Create mode**

```
Subject & need     Who uses it, what they must be able to do (from step 1)
Style              <style> — why it fits this subject
Style keys         The 3 execution points from the style guide I will hold to
Type & color       Typeface(s), scale, palette (roles, not just hues)
Space & shape      Base unit, density, radius, depth
First view         Where the headline, the one-line value, the primary action, and the product/evidence sit
Memorable thing    The one detail someone would remember
```

**Follow mode**

```
Following          <DESIGN.md / tokens / components I will use>
New tokens needed  <none | list, each with why existing ones do not fit>
Page structure     <primary action, secondary, pattern taken from existing pages>
Risks              <anything that conflicts with the existing system>
```

Ask the user only if a missing fact would change the brief. Otherwise state your assumption in the brief and proceed.

## Step 5 — Build

Build in this order: tokens → layout skeleton → components → states → polish. Consult as needed:

- `references/hierarchy-layout.md` — emphasis, spacing, grid, containment
- `references/typography.md` — scale, line height, measure, CJK
- `references/color.md` — palette building, contrast, themes
- `references/components-states.md` — state matrix, forms, tables, feedback
- `references/motion-responsive.md` — motion, responsive layout
- `references/stacks.md` — framework-specific writing
- `references/craft-floor.md` — the quality floor and the usual execution slips (all styles)

Stay inside the style you chose. When the style guide says "this style needs X to work", X is not optional.

## Step 6 — Verify by measuring

Read `references/verify-in-browser.md` and `references/review-checklist.md`.

1. Render the page (a browser tool such as `browser-use`, or headless Chrome).
2. Run the audit script on the rendered page at desktop and at mobile width. It reports contrast ratios, tiny text, overflow, and what is in the first view.
3. Take screenshots at 1440×900 and 390×844 and look at them yourself.
4. Fix every failure (or explain in one line why a finding is intentional), then re-run. Do not report the design as done while the audit still reports unexplained failures.

If no browser is available, say so plainly; do not claim the result was verified.

## Working with the result

- When you change an existing screen, keep unrelated code untouched.
- When reviewing someone else's UI, use `references/review-checklist.md` and report findings by severity (blocks use / hurts clarity / polish), each with the concrete fix and value. Judge against the style the design chose, not against your own taste.
