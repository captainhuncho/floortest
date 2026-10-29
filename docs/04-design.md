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
| `mute` / `faint` | #a3a69b / #94978e | #4c4f45 / #66695e | secondary / meta and labels (≥ 4.5:1 on every surface, raised included); `dim` is an alias of `faint` (batch 3), don't use it in new code |
| `field` | #6b6e64 | #8d9184 | text field edges (≥ 3:1, WCAG 1.4.11) |
| `lime` | #d5ff48 | #4a6400 (as text/lines) | accent; lime fills stay #d5ff48 with dark text |
| `danger` | #ff6b5a | #c4321f | destructive, errors |

Charts: white bars at night, olive (#5f8000) by day. Round play buttons use the `play-dot` class: white at night, ink by day (never lime: lime is for Keep and the one main action). Waveform bars: unplayed use `wave` (mute at 70% by night, #b9bdaa by day, so played and unplayed differ ≥ 3:1), played use lime. **One light (13 Oct audit):** lime marks only Keep, the one main action per area, live dots, count badges and focus; selection, play buttons, chips, tags, tab underlines and labels are bone, mute or line. In List rows Keep is neutral until a track is kept. Never hard-code white in the app: `bone` is the "ink on this theme" colour and flips by day (a `bg-bone` fill turns dark with light text); only things drawn over artwork or the QR code stay white. Theme: Night / Day / System, chosen in Account; the desktop sidebar and the floating phone tab bar stay dark (`keep-night`). The public send page always follows the device (`theme-system` on its `<main>`, owner 29 Oct); its live dots use `bg-(--color-lime)` so they turn olive by day instead of the fixed bright lime that `.bg-lime` keeps for buttons.

## One system (batch 3, 14 Oct)
- **Page frame:** every dashboard page sits in one left-aligned frame (`PageFrame`, max 1088px of content); pages carry their own `page-gutter` (16px / 32px); reading pages keep text to 704px (`page-narrow`). The Queue is full bleed for its docked review column; the Floor is full bleed too, so its one column centres in the space beside the sidebar at every width.
- **Titles:** `PageTitle` / `page-title` (28px bold) on every dashboard page; `page-title-display` (32px) only for the Floor greeting.
- **Selection:** `Segmented` (bone fill, ink text) for one-of-a-few choices; `Tabs` (bone text + 2px bone underline, one sideways-scrolling row on phones) for views. No lime for selection.
- **Track rows:** `TrackRow` everywhere a track is listed: title first (13px bold bone) over artist · genre (12px faint), right-aligned tabular columns, waveform only ≥ 1024px, neutral text tags (`TrackTag`), a bone dot for waiting, a bone bar for selected; actions drop to their own line on narrow rows.
- **Readouts, not tiles:** numbers sit in readout lines or one readout panel with cells split by 1px `line` rules (the Floor, collection pages, Contacts); `text-stat` for the Floor's numbers. No stat tiles, no tile grids.
- **Logs:** Activity is a set log (TIME · WHAT · WHO, tabular, 1px rules, day eyebrows).

## Type
- Words in the **system sans** (San Francisco, Segoe UI, Roboto: nothing to download; owner, 28 Oct). **JetBrains Mono** (variable, self-hosted) only where a screen asks for `font-mono`: readouts, durations, counts, code and keys. Instrument Serif italic only as a home-page accent.
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
| Controls | Touch target 44px on touch screens, icon buttons included (`size-11`, `btn-sm`, `.input`, `.tap`; text-only actions such as Delete or Hide this use `.tap-text`); 36px regular on desktop. Round play buttons use `play-dot`. |
| Buttons | Below. |
| Form controls | `.input` for every input, select and textarea: 8px radius, `ink-3` surface, `field` border, lime focus ring. Labels above in the eyebrow style (`label` = `eyebrow`); help text 11px `faint` below. App sizes are set in the utilities themselves; public pages (home, send page, receipt, sign-in) keep their larger sizes through the `site` scope on `<body>` (`--site-*`), cleared by `.theme-root` / `.app-ui`. Required marks with `Req`. |
| Cards | `card` (12px) for rows and tiles, `panel` (16px) for sections. 16px padding; 12px in dense lists. |
| Navigation | Desktop: the dark `tactile-panel` rail (`keep-night`), item text #94978e. Phones: the floating dark tab bar, labels sized to fit at 320px. Same names on both: Floor · Queue · Collections · Prepare. Current item raised, lime count badges. On the Review Queue the tab bar and mini player stay put: the open track is a card in the page with its own Not for me · Keep · Reply (rule 15 Queue, 28 Oct). `html` has scroll padding (phones 76px top, safe area + 150px bottom; desktop 88px bottom) so the fixed bars never hide the focused control. |
| Dialogs and sheets | One shell: `dialog-box` on the box, `scrim` behind a modal one. Native `<dialog>` where possible. Escape closes, focus is trapped, the first control is focused. Phones get a bottom sheet, desktop a centred box. |
| Feedback | Four kinds: status (banner at the top of the page), completion (toast, bottom centre, with Undo where it applies), warning (lime-tinted banner), error (danger-tinted box next to the control). Loading: skeletons in the page's own shapes. Empty: one sentence saying what will appear here and the one action that makes it happen. |
| Motion | Transform and opacity only. Entering: `--ease-out`, 150–250ms, from opacity 0 and scale 0.97, never from scale 0. Moving on screen: `--ease-in-out`. Sheets: `--ease-drawer`. Press: scale 0.97 on `:active`, instantly. Keyboard-driven actions (K, X, U, Space) never animate. Reduced motion keeps fades and drops movement. Hover styles only on hover-capable pointers (Tailwind's default). **Batch 4 (14 Oct):** native `<dialog>`s and their backdrop fade and scale from 0.97 (200ms in, 150ms out); sheet scrims fade; ⌘K search is `data-instant` (no motion, it's opened from the keyboard); skeletons fade in only after 150ms, so fast pages show none; play buttons show a turning ring while audio buffers (`BufferRing`, after 150ms; still at 50% with reduced motion); the Queue badge rolls when its count changes while open; a receipt dot rings once when its step arrives during the visit; the send tick draws itself after the bar holds full for 200ms; progress bars use `scaleX` on the exact fraction, 200ms linear; home loops come to rest (WCAG 2.2.2); the base `button` transition lives in `@layer base` so utilities can override it. |

## Buttons (one system)
- Corners `rounded-lg` everywhere. Two sizes: regular (`btn`) and small (`btn-sm`, 12px bold; still a 44px target on touch).
- **Lime** (`btn-lime`) = the main action, one per area. **Outline** (`btn-ghost`) = secondary. **Red outline** (`btn-danger`) = destructive; confirmation dialogs use solid red for the final yes.
- Labels say what you get: "Download collection", "Download kept", "Files only", "Start a new batch", "Edit collection", "Open collection".
- Filters and tabs are chips/segmented controls, not buttons.

## Layout
- Cards: `rounded-2xl` (sections) / `rounded-xl` (stats), border `line`, background `ink-3`, 16px padding.
- Phones first: 16px side gutter, no sideways scroll, nothing hidden behind the tab bar (main has bottom padding). Equal-width rows on phones, right-aligned groups on desktop.
- Decision-time actions stay visible (play, Keep, Not for me, Reply, and the signals that change a decision: sets permission, release status, AI use, possible duplicate, deletion within 7 days, the sender's message). File and sender admin may fold into one closed **Details** disclosure (native `<details>`, remembered per device), never deeper than one tap. Destructive actions always confirm.
- Tabs and filters react on tap: the chosen tab lights up at once and the content fades while the new view loads (Queue `StatusTabs`, one row on phones from 375px (they wrap at 320px), the chosen tab underlined in bone, not lime, every tab preloaded in full once on screen, because each live request goes edge-near-the-user → London and back, ~0.5 s from West Africa); switching keeps the tabs at the same place on screen (the page compensates for the panel above changing height) and wide screens keep the review column even when a tab is empty, so nothing reflows.
- Don't repeat what the page already says: no status chip that matches the selected tab, no stat shown twice.
- Accessibility: WCAG 2.2 AA, visible focus, Escape closes dialogs, no pinch-zoom lock.

## Brand assets
`public/brand/crest.svg` (lime, product), `public/brand/crest-ops.svg` (silver, ops only), `src/app/icon.svg` (lime tab icon), `src/app/admin/icon.svg` + `src/app/ops-login/icon.svg` (silver tab icon on ops). Use the SVGs, never redraw. Every crest is a link home (ops: `/admin`) and can't be dragged, long-pressed or saved: a global rule on `img[src^="/brand/"]` turns off touch callout, selection, drag and pointer events, so a tap or click falls through to the link, and each one carries `draggable={false}` for Firefox. The jog-wheel and USB crests on the home stage are decoration, not links, but protected the same way. The deck-and-phone graphic (jog wheel with the Review Queue on a phone beside it) is one reusable component, `DeckPhone` in `src/components/DeckPhone.tsx` (owner, 29 Oct): the home deck section uses it, any page can, and its stills are `public/brand/deck-phone.png` (1024×1056, the whole graphic) and `public/brand/deck-phone-queue.png` (406×712, the phone alone), both 2x, exported with reduced motion so they show the resting frame. The phone shows the Queue as it is since 28 Oct (the card, ‹ ›, "Swipe for the next track"); it replaced the `m3-keep` recording, which still showed swipe-right-to-keep. Shown through `<Logo>` (`ops` for silver) on every product page, error screens and the home preview; ops pages show the silver crest only. The public send page and the sender's receipt lead with the receiver's name and cover; they end with a quiet sign-off, `<Logo small />` (16px crest, grey name, links home). Emails are plain text (no logo). App icons, splash, offline screen and the Android player artwork are drawn from the same crest.
