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

Charts: white bars at night, olive (#5f8000) by day. Round play buttons use the `play-dot` class: white at night, lime by day. Never hard-code white in the app: `bone` is the "ink on this theme" colour and flips by day (a `bg-bone` fill turns dark with light text); only things drawn over artwork or the QR code stay white. Theme: Night / Day / System, chosen in Account; the desktop sidebar and the floating phone tab bar stay dark (`keep-night`).

## Type
- One font: **JetBrains Mono** (variable), everywhere. Instrument Serif italic only as a home-page accent.
- Scale on dashboard pages: eyebrow labels 11px bold uppercase, letter-spacing 1px, `mute`; body 13px; meta 12px `faint`; page titles 28–34px bold, tight tracking; stat numbers 30px bold, tabular.

## Design system (tokens in `src/app/globals.css`, utilities next to them)

| Layer | Rule |
|---|---|
| Type | Four roles on dashboard pages, each a token with its own leading: `text-meta` 11px (labels, meta), `text-body` 13px, `text-title` 28px bold tight (page titles; 32–34px only on the Floor greeting), `text-stat` 30px bold tabular. Tailwind `text-xs` (12px) and `text-sm` (14px) stay for dense rows and prose. Section titles use `eyebrow` (11px bold spaced caps, `mute`); secondary lines use `meta`. No other eyebrow styles. |
| Spacing | Tailwind's 4px scale. Inside a block: 8px between related lines, 12px between groups. Between blocks: 16px on phones, 24px on desktop. Page gutters 16px / 32px. |
| Radii | Four by role: `rounded-control` 8px (buttons, inputs), `rounded-card` 12px (rows, stat tiles, toasts), `rounded-panel` 16px (page sections, dialogs, menus), `rounded-sheet` 22px (phone sheets, the floating nav). Pills are `rounded-full`. Nothing else. |
| Surfaces | Page `ink`; sections and cards `ink-3` (`card`, `panel`); floating things (menus, dialogs, sheets) `ink-2` (`dialog-box`); raised/active `ink-4`. One border, `line`, 1px. No nested cards: a card never holds another card. |
| Shadows | Only floating things cast them: `shadow-pop` (menus, dialogs, toasts), `shadow-lift` (a raised key). Page cards have borders, not shadows. |
| Icons | Drawn, stroke 1.8, 24-grid (`NavIcon`, `FigmaIcon`). Sizes 16px in text and rows, 18px in navigation, 20px in the player. Icon-only controls carry `aria-label` and `title`. |
| Controls | Touch target 44px on touch screens (`btn-sm`, `.input`, `.tap`); 36px regular on desktop. Round play buttons use `play-dot`. |
| Buttons | Below. |
| Form controls | `.input` for every input, select and textarea: 8px radius, `ink-3` surface, lime focus ring. Labels above, 11px caps; help text 11px `dim` below. Required marks with `Req`. |
| Cards | `card` (12px) for rows and tiles, `panel` (16px) for sections. 16px padding; 12px in dense lists. |
| Navigation | Desktop: the dark `tactile-panel` rail (`keep-night`). Phones: the floating dark tab bar. Current item raised, lime count badges. |
| Dialogs and sheets | One shell: `dialog-box` on the box, `scrim` behind a modal one. Native `<dialog>` where possible. Escape closes, focus is trapped, the first control is focused. Phones get a bottom sheet, desktop a centred box. |
| Feedback | Four kinds: status (banner at the top of the page), completion (toast, bottom centre, with Undo where it applies), warning (lime-tinted banner), error (danger-tinted box next to the control). Loading: skeletons in the page's own shapes. Empty: one sentence saying what will appear here and the one action that makes it happen. |
| Motion | Transform and opacity only. Entering: `--ease-out`, 150–250ms, from opacity 0 and scale 0.97, never from scale 0. Moving on screen: `--ease-in-out`. Sheets: `--ease-drawer`. Press: scale 0.97 on `:active`, instantly. Keyboard-driven actions (K, X, U, Space) never animate. Reduced motion keeps fades and drops movement. Hover styles only on hover-capable pointers (Tailwind's default). |

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
