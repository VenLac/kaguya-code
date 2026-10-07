# Components and states

Phase 6. A design is finished when every interactive element has every state and every data region has every non-happy path. Reuse the project's component library when one exists; this file tells you what to check, not what to rebuild.

## 1. State matrix for every interactive component

| State | Requirement |
| --- | --- |
| Default | clearly interactive: affordance through shape, color or underline, not by hover alone |
| Hover | subtle change (background or border shift ~4–8% of text color), 100–150ms; pointer devices only: wrap in `@media (hover: hover)` |
| Focus-visible | 2px ring, 2px offset, ≥ 3:1 against neighbors, via `:focus-visible`; never `outline: none` without an equal replacement |
| Active / pressed | one step darker or 1–2px translate; immediate (<100ms) |
| Disabled | reduced contrast but still legible; `disabled` or `aria-disabled`; no hover change; explain why nearby if the reason is not obvious |
| Loading | keep the control's width, show a spinner and keep the label or a verb ("Saving…"); block repeat submits |
| Selected / checked | not color alone: add a check, indicator bar or weight change |
| Error | red border + icon + message text below; message says what to do |
| Success | transient confirmation, not a blocking dialog |
| Read-only | looks like text with a field affordance, still focusable and copyable |

## 2. Data regions: five states, not one

Every list, table, chart or feed has all of these designed:

1. **Loading** — skeleton matching the final layout (same row height, widths varying 60–90%); show it after ~300ms to avoid flicker; subtle shimmer or none.
2. **Empty (first use)** — say what this area is for and offer the one action that fills it. Illustration optional, copy required.
3. **Empty (no results)** — echo the query or filters and offer "clear filters".
4. **Error** — what happened in plain words, whether the data is safe, a Retry button. Do not show raw error codes as the main message.
5. **Partial / stale** — data loaded but refreshing or from cache: indicate with a quiet inline status.

## 3. Component rules

**Buttons**
- One filled primary per view; secondary is outline or tonal; tertiary is text. Destructive uses the error color but is not primary by default.
- Heights follow the density you chose (28/32/36/40/48px), horizontal padding 12–20px, label is a verb ("Save changes", not "OK").
- Icon-only buttons need an accessible name and a tooltip.

**Inputs and forms**
- Label above the field, always visible; placeholder is an example, never the label.
- Height follows the density you chose (36–44px); text 15–16px (iOS zooms inputs below 16px).
- Helper text under the field; error text replaces it and is announced (`aria-describedby`, `aria-invalid`).
- Validate on blur and on submit, not on every keystroke (except password strength and character counters). Do not clear what the user typed on error.
- Group long forms under short headings; use the right input type and `autocomplete`; mark the minority case (optional or required), not both.

**Selects, menus, popovers**
- Keyboard: arrow keys move, Enter selects, Esc closes and returns focus. Prefer native `<select>` on mobile.
- Popover width ≥ trigger width; collision-aware; max height with scroll.

**Tables**
- Sticky header, row hover, optional zebra only if rows are very wide; numeric columns right-aligned with tabular numerals; truncate long text with a tooltip; sort affordance on the header; responsive strategy: horizontal scroll with a sticky first column, or switch to a card list under ~640px.
- Row actions are visible or reachable by keyboard, not hover-only.
- Bulk selection shows a contextual action bar and a count.

**Cards**
- Only for independent, actionable units. Whole card clickable *or* contains explicit actions, not both competing.

**Modals and dialogs**
- Use sparingly; prefer inline or a side panel when context must remain visible. Trap focus, close on Esc and scrim click, restore focus on close, set `aria-modal`. Width 400–560px for confirms, up to 720px for forms.
- Destructive confirmations name the object and use the specific verb ("Delete 3 files"), not "Yes". Prefer **undo** over confirm for reversible actions.

**Toasts**
- Auto-dismiss in 4–6s, pausable on hover/focus, `role="status"` (or `alert` for errors), never the only place critical information appears, include an Undo where applicable.

**Navigation**
- Current location is obvious (indicator + weight + color). No more than 7 top-level items; mobile bottom tabs 3–5.
- Breadcrumbs for hierarchy deeper than two levels.

**Tabs vs. segmented control vs. radio:** tabs switch views of the same object; segmented control switches a mode or filter; radio selects one option in a form.

**Tooltips**
- Supplementary only, never the sole carrier of essential info; delay 300–500ms; appear on keyboard focus too.

**Badges and status**
- Short text, color plus an icon or dot; consistent mapping across the product.

## 4. Feedback timing

| Delay | What the user should see |
| --- | --- |
| < 100ms | pressed/active feedback |
| 100ms–1s | spinner or button loading state if > ~300ms |
| 1–10s | skeleton or progress with context |
| > 10s | determinate progress, ability to leave, notification on completion |

Optimistic updates for low-risk actions, with rollback and a clear error if the request fails.

## 5. Accessibility baseline

- Semantic elements first: `button`, `a`, `label`, `nav`, `main`, `table`, headings in order. Add ARIA only to fill gaps.
- Everything operable by keyboard in a logical tab order; visible focus; skip link on pages with heavy navigation.
- Images have `alt` (empty `alt=""` for decorative); icons that carry meaning have names.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Text resizes to 200% without breaking layout; no fixed-height text containers.

## 6. Internationalization

- Allow ~30–40% text expansion for Latin languages; avoid fixed-width buttons and tabs.
- Use logical properties (`margin-inline-start`, `padding-block`) so RTL works.
- Never concatenate translated strings; format dates, numbers and currency with `Intl`.
- CJK text is shorter but taller: re-check line height and truncation.
