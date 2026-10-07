# Craft floor

The floor applies to **every style**. It is written as outcomes you can check, not as limits on how a style looks. A style may be loud, dark, translucent, pixelated or extreme; the floor only asks that a visitor can read it and use it.

## 1. The floor

| # | Outcome | How you know |
| --- | --- | --- |
| 1 | **The first view explains itself.** At 1440×900 and at 390×844, without scrolling, a visitor can tell what this is, who it is for, and what to do next. | Headline, a one-line value statement, the primary action, and some evidence of the product are all visible. The audit's `firstView` section lists them. |
| 2 | **Text is readable.** Body text, labels and text on controls meet contrast against their *actual* background. | The audit reports no `low-contrast` for body text and controls (≥ 4.5:1; ≥ 3:1 for large text). Decorative glyphs are the only acceptable exceptions. |
| 3 | **Text is large enough to read.** | The audit reports no `tiny-text` below 12px except purposeful, non-essential labels; essential text is ≥ 14px. |
| 4 | **Nothing is broken.** No horizontal scroll, no text clipped or running off the viewport, no overlap hiding content. | The audit reports no `horizontal-scroll` or `text-past-viewport`. |
| 5 | **One system.** The same kind of element looks and behaves the same way everywhere. | Values come from tokens; there are no stray sizes, colors or radii. |
| 6 | **A clear order.** At any viewport the eye knows where to start and where to go next. | Squint test (see `hierarchy-layout.md`): primary element first, then groups. |
| 7 | **Interactions are complete.** Every interactive element has hover, focus-visible, active and disabled where relevant; every data region has loading, empty and error. | Walk through the state matrix in `components-states.md`. |
| 8 | **Content is real and findable.** No lorem ipsum, no invented statistics, no content that only appears if scroll animations fire. | Read the copy; check the page with scroll animations disabled (`prefers-reduced-motion`). |

## 2. Slips that happen in every style

These come up regardless of style. They are execution slips, not style choices.

### The decorative layer outweighs the content
A style's signature (huge type, grid lines, glow, texture, giant numerals) is there to carry the style, not to replace the message. Test: cover the decorative layer; does a visitor still understand the page? If the decoration pushes the headline, value statement or primary action below the fold, scale the decoration, not the content.

### A selector you did not intend wins
The common case: `.nav a { color: … }` overrides `.btn { color: … }`, so a button inside a nav gets the nav link color and becomes unreadable on its own background. Whenever a component lives inside a container that styles descendants (nav, header, footer, prose), check its actual computed color. The audit does this; reading the CSS does not.

### Contrast that was claimed, not measured
Writing "5.8:1" in a comment proves nothing. Contrast depends on the final computed colors, opacity, and what is behind the text. Run the audit; quote its numbers.

### Small labels that carry meaning
Tracked all-caps micro-labels at 10–11px look refined and read poorly. Keep them for non-essential metadata. Anything a visitor needs (units, status, a button label, a field label) is ≥ 12px, ideally ≥ 14px.

### Low-contrast structure
Hairlines, ghost numerals and decorative separators at 10–25% opacity are fine as decoration. They cannot be the only thing that tells the visitor where a section or control is.

### Content that hides until an animation fires
If sections are `opacity: 0` until a scroll observer reveals them, a failed observer, a print view, a screenshot tool or a reduced-motion user sees an empty page. Provide a fallback: reveal by default under `prefers-reduced-motion`, or only hide when JS is confirmed running.

### Repetition without progression
Four sections with the same structure and the same weight read as a template. Vary the rhythm (a big moment, a dense list, a proof strip) so the page has a shape.

### Dead space without a job
Large empty regions are fine when they give the type room or set a mood. They are a problem when they separate related things or leave a region that looks like content failed to load.

### Mixed commitments
Picking glass for the cards, brutalist for the buttons and editorial for the type, without a primary, looks accidental. Commit to a primary style and let a secondary contribute named ingredients only.

### Chinese text and line breaks
Check headings and short blocks at narrow widths: a Chinese word split across lines, or a final line of one or two characters, is a visible flaw. Fix with width, `text-wrap`, or a deliberate break; the audit reports `short-last-line`.

## 3. When the floor and the style pull apart

The style guide has a "Keeping it legible" section for exactly this. The answer is almost always to **compensate**, not to abandon the style: a scrim under text on a glass panel, a solid fill for the primary action in a low-contrast soft-UI interface, a heavier weight for thin neon type, a body face for long text in a pixel-type design.

If the only way to meet the floor is to give up the style's central trait, say so in the Brief and let the user decide.
