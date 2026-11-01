---
name: FloorTest
description: The receiving desk for new music. A dark DJ booth, calm and technical, with one light that matters.
colors:
  booth-black: "#10110f"
  booth-panel: "#171815"
  booth-card: "#1e1f1b"
  booth-raised: "#2a2e24"
  booth-line: "#2c2e29"
  booth-line-strong: "#3a3d37"
  bone: "#f1f1eb"
  mute: "#a3a69b"
  dim: "#92958c"
  faint: "#94978e"
  cue-lime: "#d5ff48"
  cue-lime-hover: "#e2ff7a"
  olive: "#536400"
  danger: "#ff6b5a"
  day-paper: "#fafaf6"
  day-panel: "#f1f3e8"
  day-card: "#ffffff"
  day-raised: "#e6e9da"
  day-line: "#e3e6d8"
  day-ink: "#0d0e0b"
  day-mute: "#4c4f45"
  day-dim: "#66695e"
  day-faint: "#66695e"
  day-lime-text: "#4a6400"
  day-danger: "#c4321f"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.5px"
  stat:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: "1rem"
    letterSpacing: "1px"
  accent-serif:
    fontFamily: "Instrument Serif, serif"
    fontWeight: 400
rounded:
  control: "8px"
  card: "12px"
  panel: "16px"
  sheet: "22px"
  pill: "9999px"
spacing:
  related: "8px"
  group: "12px"
  block-phone: "16px"
  block-desktop: "24px"
  gutter-phone: "16px"
  gutter-desktop: "32px"
components:
  button-primary:
    backgroundColor: "{colors.cue-lime}"
    textColor: "{colors.booth-black}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.cue-lime-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-small:
    padding: "6px 12px"
    height: "36px"
  input:
    backgroundColor: "{colors.booth-card}"
    textColor: "{colors.bone}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  card:
    backgroundColor: "{colors.booth-card}"
    rounded: "{rounded.card}"
    padding: "16px"
  panel:
    backgroundColor: "{colors.booth-card}"
    rounded: "{rounded.panel}"
    padding: "16px"
  dialog:
    backgroundColor: "{colors.booth-panel}"
    textColor: "{colors.bone}"
    rounded: "{rounded.panel}"
    padding: "20px"
  chip:
    backgroundColor: "{colors.booth-card}"
    textColor: "{colors.mute}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  chip-selected:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.booth-black}"
---

# Design System: FloorTest

## Overview

**Creative North Star: "The Booth at 2am"**

FloorTest looks like the inside of a DJ booth late in a set: near-black, warm, quiet, with one light that matters. Everything is ink and bone; a single lime accent marks the thing to do next, the way a cue light does on a deck. Nothing glows for decoration. The interface is a working surface for people deciding quickly, often on a phone between gigs, so it is dense, technical and calm rather than expressive.

Words are set in the device's own sans and figures in a monospaced face, which gives every screen the feel of gear: counts line up, durations and BPM read like readouts. Depth is quiet. Surfaces step up in tone, not in shadow, and only things that float (menus, dialogs, toasts) cast one. Day theme is the same booth with the lights on: warm off-white paper, olive where lime would be unreadable as text, lime fills kept for the main action.

**Key Characteristics:**
- One accent, Cue Lime, reserved for the main action, live states and counts that need attention.
- The system sans for words, JetBrains Mono for readouts (counts, durations, BPM); Instrument Serif italic only as a home-page accent.
- Tonal layering for depth; shadows only on floating things.
- Four corner radii by role, nothing in between.
- Dense, scannable rows; decision-time actions always visible.
- Night is the default; the navigation stays dark in both themes.

## Colors

Booth Black and Bone carry almost everything; Cue Lime is the one light.

### Primary
- **Cue Lime** (`cue-lime`): the main action in an area (one lime button per area), live dots, count badges, focus rings, selection, and the progress of things that matter. In Day theme lime stays as a fill with Booth Black text; as text or lines it becomes `day-lime-text` so it stays readable.

### Neutral
- **Booth Black** (`booth-black`): the page. Day: `day-paper`.
- **Booth Panel** (`booth-panel`): floating surfaces: menus, dialogs, sheets. Day: `day-panel`.
- **Booth Card** (`booth-card`): sections, cards, rows and inputs. Day: `day-card`.
- **Booth Raised** (`booth-raised`): raised and active items (the current nav item, a pressed key). Day: `day-raised`.
- **Booth Line** (`booth-line`) and **Booth Line Strong** (`booth-line-strong`): 1px borders and dividers. Day: `day-line`.
- **Bone** (`bone`): main text, and "ink on this theme": a Bone fill flips dark by day. Day: `day-ink`.
- **Mute** (`mute`): secondary text and section eyebrows. Day: `day-mute`.
- **Faint** (`faint`): meta, help text and labels; `dim` is now an alias of it. Day: `day-faint`. **Field** (`field`, #6b6e64, day #8d9184): text field edges.
- **Olive** (`olive`): Day-theme accents and chart bars.
- **Danger** (`danger`): destructive actions and errors only. Day: `day-danger`.

### Named Rules
**The One Light Rule.** Cue Lime appears where the next action or a live signal is, and nowhere else. If two lime buttons compete in one area, one of them is wrong.

**The Bone Not White Rule.** Never hard-code white in the app. Bone is the theme's ink and flips by day; only things drawn over artwork or a QR code stay white.

**The Token Only Rule.** Every colour comes from a token so both themes work. A hard-coded hex is a Day-theme bug waiting to happen.

## Typography

**Display Font:** the system sans (-apple-system, Segoe UI, Roboto, system-ui), owner 28 Oct
**Body Font:** the system sans
**Readout Font:** JetBrains Mono (variable, self-hosted: the files are in `src/app/fonts/`, loaded with `next/font/local`, nothing fetched from Google), for counts, durations and BPM (`font-mono`)
**Accent Font:** Instrument Serif italic, home page only (the headline's second line and the blurred "send me music" booth neon)

**Character:** Plain words in the device's own face; figures in mono read like gear. Hierarchy comes from size, weight and spacing.

### Hierarchy
- **Display** (700, 32–34px, 1.1, -0.5px): the Floor greeting only.
- **Headline** (700, 28px, 1.1, -0.5px): page titles.
- **Stat** (700, 30px, 1, tabular figures): numbers that are the point of a tile.
- **Body** (400, 13px, 20px): the default on dashboard pages. Dense rows and prose may use 12px and 14px.
- **Label** (700, 11px, 1px tracking, uppercase, Mute): section eyebrows. The same 11px size in Faint carries meta lines.

### Named Rules
**The One Eyebrow Rule.** Section titles use the 11px bold spaced-caps eyebrow in Mute. No other eyebrow style exists.

**The Size Brings Its Leading Rule.** Each type role carries its own line-height; never set a size without it.

## Layout

Phones first, with 16px side gutters, no sideways scroll, and nothing hidden behind the floating tab bar (main content has bottom padding). Desktop has a 248px dark rail and 32px gutters. Spacing runs on a 4px scale: 8px between related lines, 12px between groups, 16px between blocks on phones and 24px on desktop. Rows are equal width on phones; action groups align right on desktop.

Decision-time information stays visible (play, Keep, Not for me, reply, and the signals that change a decision); file and sender admin folds into a single closed Details disclosure, never deeper than one tap. Tabs react on tap and keep their place on screen while content loads, so nothing reflows.

## Elevation & Depth

Flat by default, layered by tone. Surfaces step from Booth Black (page) to Booth Card (sections and rows) to Booth Raised (active), and borders separate what tone does not. Only floating things cast shadows. The navigation rail is the one tactile exception: a dark panel whose keys sit raised with an inset highlight, like hardware.

### Shadow Vocabulary
- **Pop** (`box-shadow: 0 24px 48px -12px rgb(0 0 0 / 0.6), 0 2px 6px rgb(0 0 0 / 0.4)`): menus, dialogs and toasts.
- **Lift** (`box-shadow: 0 2px 6px rgb(0 0 0 / 0.55)`): a raised key or card.
- **Tactile panel** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 2px 4px rgb(0 0 0 / 0.5), 0 14px 30px -6px rgb(0 0 0 / 0.75)`): the navigation rail and floating tab bar only.

### Named Rules
**The Floaters Only Rule.** Page cards have borders, not shadows. If it doesn't float above the page, it doesn't cast a shadow.

**The No Nesting Rule.** A card never holds another card.

## Shapes

Four corner radii, chosen by role: controls 8px (buttons, inputs), cards 12px (rows, readout panels, toasts), panels 16px (sections, dialogs, menus), sheets 22px (phone sheets, the floating nav). Pills are fully round and used for chips, badges and tags. Borders are always 1px Booth Line. Icons are drawn line icons on a 24 grid with a 1.8 stroke.

## Components

### Buttons
Tactile and plain: they say what you get ("Download kept", "Clear kept").
- **Shape:** gently rounded (8px).
- **Primary (Cue Lime):** lime fill, Booth Black text, 10px × 16px; one per area. Hover lightens to `cue-lime-hover`.
- **Ghost:** transparent with a 1px Booth Line border and Bone text; hover darkens the border to Mute and fills Booth Card. The secondary action.
- **Danger:** transparent with a red outline and red text; confirmation dialogs use solid red for the final yes. Destructive actions always confirm.
- **Small:** 12px bold, 6px × 12px, at least 36px tall on desktop and 44px on touch screens.
- **Press:** scale to 0.97 on press, instantly; transitions are 150ms ease-out on colour, background, border and transform only.

### Chips
- **Style:** pills on Booth Card with Mute text; filters and tabs are chips or segmented controls, never buttons.
- **Selected:** a Bone fill with Booth Black text (it flips by day).

### Cards / Containers
- **Corner Style:** cards 12px, sections 16px.
- **Background:** Booth Card.
- **Shadow Strategy:** none (see The Floaters Only Rule).
- **Border:** 1px Booth Line.
- **Internal Padding:** 16px; 12px in dense lists.

### Inputs / Fields
- **Style:** Booth Card fill (pure white by day), 1px Booth Line border, 8px radius, 10px × 12px padding.
- **Focus:** the border turns Cue Lime at 70% with a soft 2px lime ring; every focusable element also gets a 2px Cue Lime outline with a 2px offset.
- **Labels and help:** labels above in 11px caps; help text 11px Faint below; field borders use Field; required fields marked "Req". On touch screens inputs are 16px text so phones don't zoom.

### Navigation
- **Desktop:** a dark tactile rail that stays dark in both themes; items in 12px uppercase with 0.5px tracking, icons at 18px, the current item raised with an inset highlight, lime count badges.
- **Phones:** a floating dark tab bar (22px radius) above the content, current tab raised.

### Dialogs and Sheets
One shell: Booth Panel, 16px radius, Pop shadow, a scrim behind modal ones. Escape closes, focus is trapped and starts on the first control. Phones get a bottom sheet, desktop a centred box.

### Ops kit (admin redesign B, 1 Nov)
The shared controls of the ops area, `src/app/admin/kit/` (look in `kit.css`, rules in `core.ts`, tested by
`tests/ops-kit.test.ts`, `tests/ops-palette.test.ts` and `e2e/ops-kit.spec.ts`). They use the app's tokens, so day and
night follow the theme.
- **Glass only on what floats:** the ⌘K palette, toasts and the bulk bar (blur 22px, saturate 170%, a hairline edge).
  Panels, the rail and dialogs stay solid. Only the newest toast is glass. Reduced transparency makes all of them solid.
- **OpsButton:** presses scale to .97 with no delay; the label gives way to a spinner after 150 ms, then "✓ …" in the
  same space for 1.2 s; a refusal shows under it in danger text with Retry. Its size never changes while it works.
- **Toasts:** bottom centre (above the phone bar), up to three, newest last, Undo 44px with its ⌘Z hint.
- **Confirm:** the Dialog shell with the affected names in a well, a reason field when asked, focus on Cancel.
- **Palette:** 620px wide, 12% from the top, 52px input, 44px rows; the active row is raised with a 2px lime edge.
- **Selection:** violet tint on picked rows, a 3px violet edge on the current one; checkboxes 20px in 44px targets.
  The bulk bar sticks to the bottom of the screen after the table, so it never covers the last row.
- **Motion:** transform and opacity only, about 380 ms on the house curve; reduced motion keeps fades.

### Review Row (signature)
The heart of the desk: play button, title and artist, a waveform, the Listened tag, BPM and length in tabular mono, all in one dense row that scans like a crate. Selecting a row opens the review panel below with Keep / Not for me always in reach.

## Do's and Don'ts

### Do:
- **Do** use Cue Lime for the one main action per area and for live signals only.
- **Do** take every colour from a token so Night and Day both work.
- **Do** use the four radii by role (8 / 12 / 16 / 22px) and pills for chips.
- **Do** keep text at 4.5:1 or better against its actual surface in both themes (WCAG 2.2 AA).
- **Do** keep touch targets at 44px on touch screens.
- **Do** animate only transform and opacity: entering 150–250ms ease-out from opacity 0 and scale 0.97; reduced motion keeps fades and drops movement.

### Don't:
- **Don't** hard-code white or any hex in components.
- **Don't** add shadows to page cards or nest a card inside a card.
- **Don't** introduce a second typeface outside the home-page serif accent.
- **Don't** add a second accent colour or a gradient for decoration.
- **Don't** repeat on the page what it already says (no status chip matching the selected tab, no stat shown twice).
- **Don't** animate keyboard-driven actions (K, X, U, Space) or start anything from scale 0.

## Privacy and consent (owner's rule, every app)

No tracking pixel, analytics, session replay, ad tag, social or video embed, or other third-party script loads until the user clicks **Accept** on the cookie banner.

- Before Accept: zero requests to analytics, ads or pixel hosts, and no non-essential cookies or storage IDs. These scripts are loaded only by the consent code, never hard-coded.
- Reject, or closing the banner, loads nothing. The choice is saved; a "Cookie settings" link in the footer reopens it. Reject is as easy as Accept: same size, same screen.
- Embeds (YouTube, Instagram, maps, booking widgets) show a placeholder that loads on click.
- Fonts are self-hosted (served from our own domain, e.g. `next/font`): no Google Fonts, Adobe Fonts/Typekit or other font or CDN requests before consent. Same for icons, libraries and images from third-party CDNs.
- No user data goes to a third party server-side before consent either.
- Only exception, strictly necessary: a bot check on the forms that need it, and the payment provider on checkout, loaded only on those pages and listed as strictly necessary in the cookie policy.
- Check before shipping: private window, DevTools Network, cleared storage: nothing third-party before Accept, still nothing after Reject.
