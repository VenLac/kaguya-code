# Corporate clean

## Essence
Trustworthy, orderly, easy to scan. Clear structure, restrained color, familiar patterns, no surprises. It suits products where confidence matters more than personality: B2B, banking, insurance, healthcare, government, enterprise software.

## Core ingredients

**Type**
- A humanist or neutral sans (Source Sans 3, IBM Plex Sans, Public Sans, Figtree). Base 15–16px, ratio 1.2, line-height 1.5–1.6. Headings semibold (600), not black. Sentence case.

**Color**
- White and cool-gray surfaces (`#FFFFFF`, `#F4F6F8`), deep blue (`#1F4E8C`) or teal (`#0F6E73`) as the single brand color, clear semantic colors for status. Contrast comfortably above the minimum.

**Shape and space**
- Radius 6–8px, 1px borders `rgb(0 0 0 / 0.1)`, 8px rhythm, content width 1100–1280px, generous but not extreme whitespace.

**Depth**
- Flat with one soft shadow for floating layers (menus, dialogs). Borders carry most separation.

**Motion**
- 150ms, only for feedback (hover, focus, expand/collapse). No entrance choreography.

**Imagery**
- Documentary photography of real people and settings, diagrams, product screenshots. Icons from one outline family.

**Signature components**
- Clear top navigation with a visible primary action, status badges, data tables, forms with helper text, trust strip (certifications, customers, numbers), FAQ accordion, contact and support entry.

## Execution keys
1. **Predictability.** Standard patterns in standard places. The visitor should never wonder how to navigate.
2. **One brand color doing a clear job** (primary action, links, selection). Everything else neutral.
3. **Plain language.** Specific nouns and verbs; numbers and names for proof.
4. **Trust signals near decisions.** Security, compliance, support and pricing clarity beside the action they support.
5. **Error and consent text is prominent and plain.**

## Where it breaks
- **Bland and indistinguishable.** *Fix:* distinguish through one carefully chosen brand color, good photography, a considered type scale and a few well-made custom details (illustrations, empty states), not through effects.
- **Stock-photo and clip-art feel.** *Fix:* use real product, real people, or abstract diagrams that explain; remove generic handshake or laptop images.
- **Dense walls of text and links.** *Fix:* use the type scale; limit navigation to 5–7 items; group footer links under headings.
- **Everything is a blue button.** *Fix:* one filled primary per view, secondary as outline, tertiary as text.
- **Small gray text.** *Fix:* secondary text still meets 4.5:1; helper text ≥ 13px.

## Keeping it legible
This style is the easiest to keep legible; the risk is under-designing. Verify contrast, focus rings, form errors and table readability with the audit and the state matrix.

## Starter tokens
```css
:root {
  --bg: #f4f6f8; --surface: #fff; --ink: #1b2430; --muted: #526072;
  --brand: #1f4e8c; --brand-contrast: #fff;
  --ok: #1a7f4b; --warn: #a15c00; --err: #b3261e;
  --border: 1px solid rgb(27 36 48 / 0.12);
  --radius: 8px; --font: "Source Sans 3", "Noto Sans SC", system-ui, sans-serif;
}
```
