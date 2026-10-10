# 04 · Design brief

How every screen should look so FloorTest stays on brand. Words and tone live in `docs/brand-voice.md`. Change a token, component or rule → update this file in the same commit.

## Feel
A dark DJ booth: calm, technical, confident. Night is the default; Day is warm off-white with olive and lime accents. One accent colour (lime) does the work; everything else is ink and bone.

## Colours (tokens in `src/app/globals.css`)

| Token | Night | Day | Use |
|---|---|---|---|
| `ink` | #10110f | #fafaf6 | page |
| `ink-2` / `ink-3` / `ink-4` | #171815 / #1e1f1b / #2a2e24 | #f1f3e8 / #ffffff / #e6e9da | panels / cards / raised |
| `line` / `line-2` | #2c2e29 / #3a3d37 | #e3e6d8 / #cfd3c0 | borders |
| `bone` | #f1f1eb | #0d0e0b | main text |
| `mute` / `dim` / `faint` | #a3a69b / #85887f / #8a8d84 | #4c4f45 / #5f6257 / #6e7166 | secondary / meta / labels (all ≥ 4.5:1) |
| `lime` | #d5ff48 | #4a6400 (as text/lines) | accent; lime fills stay #d5ff48 with dark text |
| `danger` | #ff6b5a | #c4321f | destructive, errors |

Charts: white bars at night, olive (#5f8000) by day. Round play buttons use the `play-dot` class: white at night, lime by day. Never hard-code white in the app: `bone` is the "ink on this theme" colour and flips by day (a `bg-bone` fill turns dark with light text); only things drawn over artwork or the QR code stay white. Theme: Night / Day / System, chosen in Account; the floating phone tab bar stays dark.

## Type
- One font: **JetBrains Mono** (variable), everywhere. Instrument Serif italic only as a home-page accent.
- Scale on dashboard pages: eyebrow labels 11px bold uppercase, letter-spacing 1px, `mute`; body 13px; meta 12px `faint`; page titles 28–34px bold, tight tracking; stat numbers 30px bold, tabular.

## Buttons (one system)
- Corners `rounded-lg` everywhere. Two sizes: regular (`btn`) and small (`btn-sm`, 12px bold; still a 44px target on touch).
- **Lime** (`btn-lime`) = the main action, one per area. **Outline** (`btn-ghost`) = secondary. **Red outline** (`btn-danger`) = destructive; confirmation dialogs use solid red for the final yes.
- Labels say what you get: "Download collection", "Download kept", "Files only", "Clear kept", "Edit collection", "Open collection".
- Filters and tabs are chips/segmented controls, not buttons.

## Layout
- Cards: `rounded-2xl` (sections) / `rounded-xl` (stats), border `line`, background `ink-3`, 16px padding.
- Phones first: 16px side gutter, no sideways scroll, nothing hidden behind the tab bar (main has bottom padding). Equal-width rows on phones, right-aligned groups on desktop.
- Every option a person might need stays visible (no hiding common actions in menus); destructive actions always confirm.
- Accessibility: WCAG 2.2 AA, visible focus, Escape closes dialogs, no pinch-zoom lock.

## Brand assets
`public/brand/crest.svg` (lime, product), `public/brand/crest-ops.svg` (silver, ops only), `src/app/icon.svg`. Use the SVGs, never redraw.
