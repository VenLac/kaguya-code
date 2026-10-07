# Editorial

## Essence
Magazine and newspaper typography on screen: serif display type with strong contrast, a narrow reading column, rules instead of boxes, captions, pull quotes, and a printed-paper palette. The type is the design. It suits brand stories, publications, portfolios, long-form product narratives and anything that wants to feel considered.

## Core ingredients

**Type**
- Display in a high-contrast serif (Fraunces, Newsreader, Instrument Serif, Playfair Display, DM Serif Display). Body in a text serif (Source Serif 4, Lora) or a humanist sans (Instrument Sans). Display 48–96px, ratio 1.333, body 17–19px with line-height 1.6–1.7, labels in small caps or tracked caps (+0.08em) at 12–13px.
- For Chinese: Noto Serif SC for display and body, with a sans for UI labels; line-height 1.8.

**Color**
- Paper (`#F6F1E7`, `#FAF7F0`) and ink (`#1B1A17`); one accent such as vermilion (`#D9432B`) or a deep green/blue used for links, one rule, one number. Dark variant: warm near-black (`#14120F`) with cream text.

**Shape and space**
- Radius 0–2px; 1px hairline rules; text column 60–66ch; wide margins; a 12-column grid with asymmetric use (text in 5 columns, image in 7). Generous vertical rhythm.

**Depth**
- None. Rules, whitespace and scale create structure.

**Motion**
- Slow fades (300–400ms), image reveals; no bounce.

**Imagery**
- Large, well-cropped photography with captions and credits; duotone or black-and-white treatments applied consistently; illustrations in a single line style.

**Signature components**
- Drop cap, pull quote, byline and dateline, figure with caption, section numerals (used as navigation, readable), footnotes, table of contents.

## Execution keys
1. **Scale contrast.** A very large headline against modest body text is what makes the page feel edited.
2. **A strict text column.** Do not stretch lines; the column is the signature.
3. **Rules instead of boxes.** Use 1px lines to divide, not cards.
4. **Captions and credits** make images feel like journalism.
5. **One accent used with discipline.**

## Where it breaks
- **Serif display too thin at small sizes or on dark backgrounds.** *Fix:* use the optical-size axis (Fraunces `opsz`) or a heavier weight below 24px; avoid ultra-light weights on dark.
- **Everything is huge and nothing is readable.** *Fix:* one oversized element per view, and the value statement and primary action still in the first view.
- **Decoration (ghost numerals, giant outlines) replaces content.** *Fix:* decorative numerals must still be readable if the visitor needs them (≥ 3:1 for large type), and must not displace the headline.
- **Wide measure on large screens.** *Fix:* cap with `max-width: 66ch`, center or offset the column deliberately.
- **Missing hierarchy in long text.** *Fix:* subheads every 3–5 paragraphs, pull quotes, figures.

## Keeping it legible
Ink on paper is high-contrast by default; check the accent color on paper at link size and the muted caption color. Keep captions ≥ 13px.

## Starter tokens
```css
:root {
  --paper: #f6f1e7; --ink: #1b1a17; --muted: #5e5a52; --accent: #d9432b;
  --rule: 1px solid rgb(27 26 23 / 0.2);
  --font-display: "Fraunces", "Noto Serif SC", Georgia, serif;
  --font-text: "Source Serif 4", "Noto Serif SC", Georgia, serif;
  --font-ui: "Instrument Sans", "Noto Sans SC", system-ui, sans-serif;
  --measure: 66ch;
}
.prose { max-width: var(--measure); font: 1.125rem/1.7 var(--font-text); }
.prose > p:first-of-type::first-letter { font: 700 4.2em/0.85 var(--font-display); float: left; margin: 0.06em 0.1em 0 0; }
```
