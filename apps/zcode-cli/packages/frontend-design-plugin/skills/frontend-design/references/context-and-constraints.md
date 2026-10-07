# Context and constraints

Step 1. The subject and its situation give you **what the interface must do**. They do not choose the style; any style can meet these requirements, and each meets them in its own way.

Use this to write the "Subject & need" line of the Brief, and to check at the end that the requirements are met.

## Questions to answer first

1. **Who** uses it, and how often? (first-time visitor, daily power user, once-a-year filer, a stressed person on a phone)
2. **What** must they be able to do, in the first minute? Name the one primary task.
3. **Where**: desktop at a desk, phone on the move, a shared screen, a long reading session?
4. **What is at stake?** (a casual click, money, health, legal consent, a deadline)
5. **What must feel true?** (trustworthy, fast, exciting, calm, premium) — this is input for choosing the style, not a style.

## Functional requirements by kind of product

These hold in **every** style.

| Kind | Must be true | Verify |
| --- | --- | --- |
| Marketing / landing | A visitor learns what it is, who it is for, and what to do next without scrolling; proof (real product, numbers, names) appears before the ask is repeated | First view contains headline, one-line value, primary action, and some evidence of the product |
| Brand / portfolio / editorial | The work or the story is the hero; navigation never competes with it | Content is reachable in one step from the first view |
| Content / docs / blog | Reading is comfortable for long sessions; headings let a reader scan; code, tables and images are handled | Measure 45–75 characters; headings form a clear outline; code blocks scroll rather than overflow |
| SaaS application | Predictable structure; the same action looks the same everywhere; state of the system is always visible | Same component for the same job; loading/empty/error states exist |
| Data dashboard / admin | Scanning and comparison are fast; the number that matters is the loudest thing; filters stay reachable | Numbers are aligned (tabular figures); units and time frames are visible; row actions are reachable by keyboard |
| Developer tool | Keyboard first; code and identifiers are legible; dense but not cramped; dark and light both work | Focus is always visible; monospace used for code and IDs; shortcuts are discoverable |
| Mobile web app | One-handed use; thumb reach for frequent actions; tolerant of slow networks | Targets ≥ 44px; primary action in the lower half; skeletons not spinners for lists |
| E-commerce | The product, price and the purchase action are unmistakable; trust signals sit near the decision | Price and primary action visible without scrolling on a product view; errors at checkout are specific |
| Finance / health / legal / government | Clarity over cleverness; errors and consent text are plain and prominent; accessibility strictly met | Contrast and size verified by measurement; destructive and irreversible actions are explicit |
| Kids / education / games | Large targets, immediate feedback, simple language; encouragement without clutter | Targets ≥ 48px; every action produces visible feedback |
| Internal tool / CRUD | Fast to build, fast to use; consistency beats originality | Reuses the existing components; keyboard-complete forms |
| Settings / forms / onboarding | The user always knows where they are, what is required, and how to finish | Labels visible; errors next to fields; one primary action per step |
| Chat / AI assistant | The conversation is the hero; roles are clear; streaming and failure are designed | Message roles distinguishable without color alone; error and retry states exist |

## Density and tone are parameters, not styles

Subjects imply a range of **density** (how much information per screen) and **tone** (how serious or playful). Pick both deliberately; the style you choose will express them in its own way.

| | Sparse | Compact |
| --- | --- | --- |
| Body size | 17–18px | 13–14px |
| Spacing base | 8px, sections 96–160px | 4px, sections 16–32px |
| Control height | 44–48px | 28–32px |
| Table row | 56px | 32–36px |

A style has a natural density (Swiss and luxury are usually sparse, data-dense is compact) but any style can move within a range. The constraint is that density must match the task: people compare things in a dashboard; they read one idea at a time on a landing page.

## Constraints to carry through

- **Language and script.** If the interface is Chinese or mixed-script, apply the CJK rules in `typography.md` in whatever style you choose; confirm the display font has CJK glyphs or pair a CJK face for the same role.
- **Platform.** Desktop, mobile web, Electron, embedded webview: check input method, window sizes and offline needs (bundle fonts rather than linking a CDN for offline apps).
- **Theme.** If the product has light and dark, design both; they are two palettes.
- **Accessibility.** Keyboard, focus, contrast and motion-sensitivity apply to all styles.
- **Brand.** If a brand exists (colors, logo, voice), it is an input to the style, not a conflict with it.
