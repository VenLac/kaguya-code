# Playful pop

## Essence
Saturated, rounded, characterful: thick outlines, bright color fields, stickers, slight rotation, big friendly shapes, and bouncy motion. It feels fun and approachable. It suits kids, education, games, community and creative consumer products.

## Core ingredients

**Type**
- A chunky rounded or friendly display (Bricolage Grotesque 800, Fredoka, Baloo 2, Lexend) with a plain readable sans for body (Figtree, DM Sans, Nunito). Headings 40–96px at 700–800; body 16–18px; generous line-height 1.5–1.6.

**Color**
- Three or four saturated hues with assigned roles (for example blue `#3A5BFF`, coral `#FF6B4A`, sun yellow `#FFD23F`, mint `#2BD9A5`), a dark navy ink (`#1B1F3B`) instead of black, and white or cream cards on a colored ground.

**Shape and space**
- Large radius (20px to pill), 2–3px outlines in ink, big buttons 52–60px tall, chunky shapes, blobs, stars, squiggles; generous padding; a few elements rotated −3° to 3°.

**Depth**
- Offset color shadows (`0 6px 0 ink-dark`) for a tactile "pressable" feel, or flat shapes with outlines.

**Motion**
- Springs 250–400ms with 8–12% overshoot, wiggle on hover, confetti or character reactions on success. Respect reduced motion.

**Imagery**
- A mascot or illustrated characters, stickers, doodles, hand-drawn underlines; photos with outlines and sticker cutouts.

**Signature components**
- Pill buttons with a pressed state, sticker badges, progress with rewards, speech bubbles, big friendly empty states.

## Execution keys
1. **A palette with roles.** Say what each color means; do not sprinkle.
2. **A recurring character or shape language** (a mascot, a blob family) ties the page together.
3. **Big, tactile controls.** Large targets with visible pressed states.
4. **Delight at the moments that matter** (success, achievement), restrained elsewhere.
5. **Clear structure under the fun.** Layout remains simple and scannable.

## Where it breaks
- **Chaos from too many colors, rotations and effects.** *Fix:* cap the palette; rotate at most two or three elements; one illustrative style.
- **Text on bright backgrounds is hard to read** (white on yellow, coral on blue). *Fix:* ink text on light fields, white text only on dark fields; measure every pairing.
- **Childish when the audience is not.** *Fix:* match illustration sophistication, copy tone and motion to the audience.
- **Too much motion** distracts and fatigues. *Fix:* spring on interaction, not on idle decoration; honor `prefers-reduced-motion`.
- **Small playful type.** *Fix:* keep display faces for headings; body in a plain readable face.

## Keeping it legible
Measure text on colored fields; use ink or white consistently by field luminance; keep body ≥ 16px; large targets and a visible focus ring in a contrasting color.

## Starter tokens
```css
:root {
  --ink: #1b1f3b; --paper: #fff8ec;
  --blue: #3a5bff; --coral: #ff6b4a; --sun: #ffd23f; --mint: #2bd9a5;
  --radius: 22px; --bw: 3px;
  --font-display: "Bricolage Grotesque", "Noto Sans SC", system-ui, sans-serif;
  --font: "Figtree", "Noto Sans SC", system-ui, sans-serif;
  --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
.btn { border: var(--bw) solid var(--ink); border-radius: 999px; box-shadow: 0 5px 0 var(--ink); transition: transform 160ms var(--spring); }
.btn:active { transform: translateY(4px); box-shadow: 0 1px 0 var(--ink); }
```
