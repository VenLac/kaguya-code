# Dark technical

## Essence
The look of a terminal and a well-made developer tool: near-black surfaces, monospace for code and data, one vivid accent, thin low-contrast borders, and the product itself (code, logs, UI) as the main visual. It suits developer tools, infrastructure, security, AI and API products.

## Core ingredients

**Type**
- A neutral sans for UI and prose (Geist, Hanken Grotesk, IBM Plex Sans) and a mono for code, labels, and data (JetBrains Mono, Geist Mono, IBM Plex Mono). Headings tight (letter-spacing −0.02em), body 15–16px, code 13–14px with line-height 1.6. Weight 500–600 for headings.

**Color**
- Background `#0B0D10` or similar, **never pure black**; surfaces step lighter by about 3–5% L each (`#12151A`, `#181C22`). Text `#E7E9EC`, muted `#8B93A0`. **One** vivid accent (lime `#B6F04A`, cyan `#3DD6F5`, electric blue `#2D7BFF`, amber `#FFB020`) used for primary action, focus, and one highlight. Semantic colors only for status.

**Shape and space**
- Radius 6–10px, 1px borders `rgb(255 255 255 / 0.08)`, 8px base, content width 1100–1200px. Subtle dot grid or line grid at 3–5% opacity as a background.

**Depth**
- Elevation through lighter surfaces and borders, not shadows. A faint top-edge highlight (`inset 0 1px 0 rgb(255 255 255 / 0.06)`) on raised panels. One soft radial glow behind the hero visual at most.

**Motion**
- 150–250ms; typing or streaming effects in code blocks; a single gradient or glow sweep on the hero. No bouncing.

**Imagery**
- A real code block, terminal session, log stream, or product screenshot is the hero visual. Diagrams drawn in the same line weight and palette.

**Signature components**
- Code blocks with a filename tab and copy button, terminal windows, command/keyboard hints in small pills, status dots, install command with copy, pricing as a table.

## Execution keys
1. **The product is the visual.** Show a real code sample or terminal output that a developer would recognize as plausible.
2. **One accent, used sparingly.** If it is on everything, it signals nothing.
3. **Borders and surface steps do the structure.** Keep borders low-contrast but present.
4. **Mono is a tool, not a costume.** Use it for code, IDs, labels and numbers; set long prose in the sans.
5. **Copy is exact.** Real commands, real flags, real numbers.

## Where it breaks
- **Gray-on-black body text too dim.** *Fix:* body text ≥ 7:1 on its surface, muted text ≥ 4.5:1; measure it.
- **Glow overload and neon everywhere.** *Fix:* one glow, one accent.
- **All-mono pages are tiring to read.** *Fix:* mono for code and labels; sans for paragraphs.
- **Tiny uppercase labels (10–11px) carrying real information.** *Fix:* 12px minimum for essential labels; 14px for anything a visitor needs.
- **Code blocks overflow on mobile.** *Fix:* `overflow-x: auto` on the block, not the page; check at 390px.
- **Pure `#000` backgrounds with `#fff` text** are harsh. *Fix:* off-black and off-white.

## Keeping it legible
Measure muted text and borders. Make sure the accent text (links) meets 4.5:1 against the surface it sits on; for primary buttons use a dark label on the vivid accent and measure it.

## Starter tokens
```css
:root {
  color-scheme: dark;
  --bg: #0b0d10; --s1: #12151a; --s2: #181c22;
  --ink: #e7e9ec; --muted: #8b93a0;
  --border: rgb(255 255 255 / 0.08);
  --accent: #b6f04a; --accent-ink: #10150a;
  --radius: 8px;
  --font: "Geist", "Noto Sans SC", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
}
```
