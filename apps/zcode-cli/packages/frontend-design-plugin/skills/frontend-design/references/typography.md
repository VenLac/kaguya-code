# Typography

Phase 4. Typography is most of the interface. Decide the family, the scale, the rhythm and the measure to fit your chosen style and density, then express them as tokens.

## 1. Families

- **Rule:** use one family when you can; two at most (display + body) plus a mono if the product shows code, IDs or tabular data.
- **Why:** hierarchy comes from size, weight and spacing, not from adding families.
- **Pairing rule:** pair for contrast, not similarity. Serif display + sans body works; two near-identical sans faces looks like a mistake. A single superfamily with several weights is the safest choice.
- **The typeface is part of the style.** Any family is legitimate when it is chosen for the style and the subject. A system or neutral family is the right choice for some styles; a distinctive display face is the right choice for others. Decide on purpose, and confirm every face you pick has the glyphs you need (CJK in particular).
- **Pick by character** (Google Fonts / Fontsource names):

| Character | Candidates |
| --- | --- |
| Neutral grotesk | Hanken Grotesk, Schibsted Grotesk, Geist, Instrument Sans |
| Humanist sans (friendly, readable) | Figtree, DM Sans, Source Sans 3, Public Sans |
| Distinct display sans | Bricolage Grotesque, Archivo |
| Serif display | Fraunces, Newsreader, Instrument Serif, Playfair Display, Cormorant Garamond, Bodoni Moda |
| Serif text | Source Serif 4, Lora |
| Mono | JetBrains Mono, IBM Plex Mono, Geist Mono |

- **Loading:** `font-display: swap`, preload the one or two files used above the fold, subset where possible, use variable fonts. If the app must work offline (Electron, intranet), bundle font files (for example via Fontsource packages) rather than linking a CDN. Always define a fallback stack close in metrics.

System fallback stacks:

```css
--font-sans: "Your Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
--font-serif: "Your Serif", ui-serif, Georgia, "Songti SC", "Noto Serif SC", serif;
--font-mono: "Your Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

Put the Latin face first and the CJK faces after it so Latin glyphs use the design font and Chinese falls back to the right CJK face.

## 2. Size scale

- **Rule:** a modular scale with a fixed ratio, defined as tokens; no one-off sizes.
- **Base size:** 13–14px dense apps, 15–16px general apps, 17–18px reading and marketing.
- **Ratio from the style:** 1.125–1.2 (restrained, dense), 1.25 (balanced), 1.333–1.5 (expressive, with a large display size).
- **Example, base 16px ratio 1.25:** `12.8 / 16 / 20 / 25 / 31 / 39 / 49 / 61`. Use five or six steps; do not use all of them on one screen.
- **Fluid display type:** `font-size: clamp(2.25rem, 1.2rem + 4vw, 4.5rem)` for headings; body stays fixed.
- **Minimums:** body ≥ 14px for Latin and CJK; secondary text ≥ 12px; never below 11px except uppercase labels with tracking.

## 3. Line height, tracking, measure

| Role | Line height | Letter-spacing |
| --- | --- | --- |
| Body (Latin) | 1.5–1.65 | 0 |
| Body (CJK) | 1.7–1.8 | 0 |
| UI labels, buttons | 1.2–1.4 | 0 to 0.01em |
| Headings | 1.1–1.25 | −0.01em to −0.02em |
| Large display (>48px) | 0.95–1.1 | −0.02em to −0.03em |
| ALL-CAPS labels | 1.2 | +0.06em to +0.12em |

- **Measure:** 45–75 characters per line (about 60–72ch). On mobile 30–40ch is fine. If the container is wider, cap the text block with `max-width: 68ch`, don't stretch lines.
- **Never track out lowercase body text.** Tracking is for caps and small labels.

## 4. Weight and style

- Use two or three weights: regular (400), medium or semibold (500–600), bold (700) for headings. Avoid 300 below 18px.
- Do not rely on italics for CJK (no true italics); use weight, color or quotation marks.
- Bold is a hierarchy tool; if more than ~10% of a paragraph is bold, nothing is emphasized.

## 5. Numerals and data

- `font-variant-numeric: tabular-nums;` for tables, prices, timers, counters, anything that updates.
- Use `lining-nums` for UI and `oldstyle-nums` only in serif editorial body.
- Align decimals, right-align numeric columns, show units in a muted smaller size next to the value, format with the user's locale (`Intl.NumberFormat`).

## 6. Text color and rendering

- Body text is not pure black on pure white: use 87–92% ink on white, or an off-black tinted toward the palette (`#1B1A17`); secondary text 60–70%. All must still meet contrast (see `color.md`).
- `text-wrap: balance` for headings and short blocks; `text-wrap: pretty` for paragraphs.
- Truncate with `text-overflow: ellipsis` or `line-clamp`, and expose the full text via `title` or a tooltip.
- `-webkit-font-smoothing: antialiased` on dark backgrounds.

## 7. Chinese and mixed-script typography

- **Font stacks:** see above; for display weight Chinese use Noto Sans SC / Noto Serif SC at 500–700, avoid 900.
- **Size and spacing:** body 14–16px, line-height 1.7, paragraph spacing 0.8–1em, no letter-spacing on body. CJK glyphs look larger than Latin at the same size, so headings can be 1–2px smaller than the Latin scale suggests.
- **Mixed text:** Latin and digits inside Chinese need a thin space. Prefer CSS where available: `text-autospace: normal;` and `text-spacing-trim: space-first;` (progressive enhancement in modern Chromium); otherwise insert a thin space in the copy.
- **Line breaking:** `line-break: strict; word-break: normal;` for body text. Add `overflow-wrap: anywhere` only to containers that hold long unbroken tokens such as URLs. Never `text-align: justify` for Chinese on narrow columns.
- **Punctuation:** use full-width punctuation in Chinese sentences, half-width inside Latin/numeric fragments. Quotes: “ ” (or 「」 for traditional contexts) consistently.
- **Weight:** CJK bold is heavy; use medium (500) for UI emphasis and reserve 700 for headings.
- **Hierarchy without italics or caps:** use size, weight, color and spacing; there is no uppercase in Chinese.
- **Display faces:** a Latin display face usually has no CJK glyphs; pair it with a Chinese face chosen for the same role rather than letting the browser pick a fallback.

## 8. Quick recipes

| Intent | Recipe |
| --- | --- |
| Dense dashboard | 13–14px base, ratio 1.125–1.2, 500 weight for labels, tabular numerals, mono for IDs |
| Reading page | 18px base, line-height 1.65, 66ch measure, serif or humanist sans |
| Marketing hero | display 56–96px with `clamp`, −0.02em tracking, 1.0–1.1 line-height, body 18–20px muted |
| Form UI | labels 13–14px medium, inputs 15–16px, helper text 12–13px muted |
