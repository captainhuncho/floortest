# Rollout brief (12 Oct 2026): read this first

**Ask from the owner:** ideas for rolling FloorTest out, and for every public page, *what it should say and communicate* plus *image ideas*. "Let's not over explain, clear communications only and let the images speak." Ideas must be on the owner's desk in the morning.

## Read in the repo (/Users/maxwelladjavon/floortest)
- `PRODUCT.md`: users, purpose, positioning (Honest signals), principles, **Launch Decisions (12 Oct)**: DJ/curators lead, teams are the upgrade; north star = tracks decided within 7 days; senders are a channel, never payers; website-only launch; markets UK, EU, Ghana, Nigeria; prices Free 20 tracks / Pro $6.99 / Team $19.99 (+$4 seats); beta users 6 months free then 50% off a year.
- `DESIGN.md`: "The Booth at 2am": Booth Black #10110f, Bone, one light (Cue Lime #d5ff48), JetBrains Mono everywhere, Instrument Serif italic only as a home-page accent. The crest logo (lime). Dark by default.
- `docs/brand-voice.md`: binding vocabulary and tone (booth-level plain, honest about signals, calm not hype, no exclamation marks, respect both sides of the desk). Words: your link, desk, Keep / Not for me, callout, crate, receipt, Delivered / Listened / Downloaded / Replied / Played out.
- `docs/01-product.md`: every feature (the public send page `floortest.app/<handle>`, receipts, collections/callouts with a brief, Review Queue, Prepare for set + Rekordbox XML, teams with approvals, share links held, apps later).
- Current home/pricing/sign-up/send-page copy: `src/lib/content.ts` (search for `f("`). Home today: eyebrow "The receiving desk for new music", headline "From the studio / to the floor.", How it works "Share once. Decide fast.", Receipts "Know what happened next.", Privacy "Music stays between the people you choose.", Plans "Start free. Grow when your inbox does.", FAQ "Before the first track lands."

## Public pages to cover
Home (`/`), Pricing (`/pricing`), Sign-up / Claim your link (`/signup`), Log in (`/login`), Waitlist (home `#waitlist`, invite-only), Coming soon (`/coming-soon`, the password gate in beta), the **public send page** (`/<handle>`: the receiver's link, what senders see), the **sender's receipt** (`/receipt/<token>`), Sent history (`/sent`), Trust / security (`/trust`), Contact, the 404, legal pages (light touch only). Also the first-run Floor (dashboard home) and the app-store listing (later).


## Ground rules for everyone
- Short. A heading of a few words and at most one line under it. No paragraphs of explanation.
- Images carry the meaning: say what the image *shows* (scene, subject, light, composition, what's on screen), so a photographer or designer could shoot or build it.
- Honest signals: never claim more than the product does (no "verified artist", no invented stats, testimonials, logos or press: none exist yet). Use placeholders like "{first partner quote}" if needed.
- Real scenes: London and Lagos (Afro house, amapiano, house), booths, laptops between gigs, phones in a club, a producer's bedroom studio. Diverse, real people; no stock-photo poses.
- Brand voice rules are binding (no exclamation marks, no hype words, "track" not "song", "Keep / Not for me").
- **Positioning (12 Oct):** FloorTest is where new music gets tested on the floor. Category line "The receiving desk for new music." Headline "From the studio / to the floor." Core content: exclusives and works in progress (released tracks welcome). Payoff signal for senders: **Played out** (the DJ played it in a set).
- Number your ideas so the owner can say "do 3 and 7".
- **No square brackets in our language or branding.** FloorTest never uses bracketed words, not even as decoration. Placeholders are written `{date}`.

## Home page on a phone (panel verdict, 12 Oct)
pin our top (headline + Claim your link) on phones; our object is **a CDJ jog wheel from above at 2am, the crest pressed into its centre cap, one lime cue light**, turning, the phone rising with the Review Queue; one card per moment (lands · heard 30 s · Keep, next · the brief · crate to Rekordbox · receipt ticks · bring your crew · private by default), each a moving crop of real UI with sample data (< 400 KB, still frame for reduced motion); warm sample covers from London and Lagos nights, marked SAMPLE; readouts in JetBrains Mono. What we don't take: a colour per card (one light only), their generic big sans, vague security claims, an app-store-first ask (we launch on the web).

## Home page on desktop (panel verdict, 12 Oct)
our frame ("From the studio / to the floor." small top left; Log in + Claim your link pill top right; footer with Instagram · TikTok · Founding DJs and "Web · iPhone and Android soon", only true platforms); hero = the jog wheel; **two sides of the desk**: a laptop with the receiver's Review Queue and a phone with the sender's send page then its receipt ticking to Listened, filling in side by side, in front of a **blurred lime neon handwritten "send me music"** (booth neon, one light); cards four across on desktop, one per row on phones; the Rekordbox card as a **row of USB sticks engraved with the crest** (the crate going into the booth); scroll motion in plain CSS with stills for reduced motion. Our cookie behaviour stays as is (nothing non-essential).
