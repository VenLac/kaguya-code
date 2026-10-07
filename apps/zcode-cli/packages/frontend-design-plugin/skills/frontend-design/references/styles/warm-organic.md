# Warm organic

## Essence
Earthy, tactile and human: natural palettes, soft shapes, gentle serif or rounded type, real photography, and a touch of paper or grain. It feels calm and trustworthy without being corporate. It suits wellness, food, craft, sustainability, education, and community brands.

## Core ingredients

**Type**
- A soft, low-contrast serif for headings (Fraunces with soft optical settings, Lora, Young Serif, DM Serif Display) paired with a friendly humanist sans (Figtree, DM Sans, Nunito). Base 17–18px, line-height 1.65, headings 36–64px. Sentence case, warm tone.

**Color**
- Sand `#F3ECE0`, cream `#FBF6EE`, sage `#8AA38B`, clay `#B8704F`, deep forest text `#23302A`. Low to medium chroma; no pure white or black. One warmer accent (terracotta, ochre) for actions.

**Shape and space**
- Radius 20–36px, organic image crops (arches, circles, soft blobs), generous spacing (sections 96–140px), wide rounded buttons 48–56px.

**Depth**
- Soft, warm-tinted shadows (`0 12px 32px rgb(90 60 40 / 0.12)`), subtle paper grain at 3–5%, overlapping layers like cut paper.

**Motion**
- Slow ease-out 400–600ms, gentle fades and small rises (12–16px), slow parallax of imagery (≤ 12px).

**Imagery**
- Natural light photography with people, hands, materials and food; hand-drawn botanical or line illustrations; textures of paper, linen, clay.

**Signature components**
- Arch-shaped image frames, rounded cards with a handwritten accent, testimonial with a real photo, ingredient or process steps, newsletter signup as a warm card.

## Execution keys
1. **Natural palette, low saturation, warm neutrals.** No cold grays.
2. **Real photography and texture.** The human, material feel comes from images, not from effects.
3. **Soft shapes everywhere, consistently.** Rounded corners and organic crops.
4. **Unhurried rhythm.** Space and slow motion convey calm.
5. **Warm voice in the copy.** The words complete the style.

## Where it breaks
- **Muddy, low-contrast text** (sage on sand, clay on cream). *Fix:* body in deep forest ink; sage and clay for accents and large elements; measure every pairing.
- **Faux textures that look dirty.** *Fix:* grain at ≤ 5%, no heavy paper images behind text.
- **Stock photography with fake smiles.** *Fix:* real or art-directed imagery; if none exists, use illustration or typography.
- **Too soft, with nothing to act on.** *Fix:* a clear primary button in the accent color, solid fill, visible in the first view.
- **Overlong body text in a decorative serif.** *Fix:* long reading in the humanist sans or a text serif; the soft serif for headings.

## Keeping it legible
Deep ink for body; check accent text and button labels; keep body ≥ 16px; measure text over photographs and add a scrim when needed.

## Starter tokens
```css
:root {
  --sand: #f3ece0; --cream: #fbf6ee; --sage: #8aa38b; --clay: #b8704f;
  --ink: #23302a; --muted: #5b6a5f;
  --radius: 28px; --shadow: 0 12px 32px rgb(90 60 40 / 0.12);
  --font-display: "Fraunces", "Noto Serif SC", Georgia, serif;
  --font: "Figtree", "Noto Sans SC", system-ui, sans-serif;
}
.arch { border-radius: 999px 999px 24px 24px; overflow: hidden; }
```
