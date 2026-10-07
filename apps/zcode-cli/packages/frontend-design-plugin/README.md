# frontend-design

A content-only plugin for frontend design in **any visual style**. One skill, `frontend-design`, plus reference documents loaded step by step. No runtime code, MCP server or hook.

See `docs/specs/frontend-design-plugin.md` for the product rules and acceptance scenarios.

## What it does

- Reads the project's existing design conventions first (`DESIGN.md`, tokens, component library) and follows them.
- Otherwise the model **chooses the style freely** (or follows the user's request). The plugin does not recommend or forbid any style.
- After a style is chosen, it provides that style's **execution guide**: core ingredients with concrete values, what makes the style read correctly, the failure modes particular to that style, and how to keep it legible. For a style without a guide, it gives a method to derive one.
- Holds a style-neutral **floor**, written as outcomes: the first view explains itself, text is readable, nothing is broken.
- Verifies by **measurement**: an in-browser audit script reports contrast, tiny text, overflow, short last lines and what is in the first view.

## Layout

```
.zcode-plugin/plugin.json
skills/frontend-design/
  SKILL.md                         flow and the mandatory Design Brief
  references/
    context-and-constraints.md     what the subject requires (style-independent)
    craft-floor.md                 the floor and common execution slips
    hierarchy-layout.md  typography.md  color.md
    components-states.md  motion-responsive.md  stacks.md
    verify-in-browser.md           the audit script and how to run it
    review-checklist.md
    styles/
      README.md                    choosing, mixing, deriving a guide
      <style>.md                   one execution guide per style
```

## Trying it locally

Add a local directory marketplace containing this plugin, install `frontend-design`, then ask for a page, for example "design a landing page for an independent coffee roaster".
