# Images and motion: "The Booth at 2am"

Numbered so the owner can say "do 7 and 15".

**What untitled.stream gets right (approach, not look):** a fixed title line and one button while one big object fills the screen; then dark tiles where a cropped app screen explains and the copy is 2–4 words plus one line. Their pictures are objects (the maker's side); ours are people and places where music lands, with the product on a real device.

## 1. Photography direction

1. **Light:** only what's in the room: CDJ screens, mixer VU, a phone, a laptop, one practical lamp. No flash. Shadows go fully black; one light that matters.
2. **Colour:** near-black and warm bone; the only saturated colour is one small lime light (a cue button, an LED, Keep on a phone). Grade out magenta/blue club wash.
3. **Lenses and grain:** 35/50mm primes at f/1.4–2, focus on hands and screens; 85mm across a booth. Real high-ISO grain, no fake film borders, no Dutch tilt.
4. **People:** working DJs, producers, radio hosts and label staff from London and Lagos Afro house, amapiano and house; women and men, varied ages, dark skin exposed properly under screen light. Mid-task (thumb on screen, headphones half on); nobody looks at the lens or smiles at a phone. Written releases; credit by name if they want.
5. **Places:** a booth between sets; a laptop on a flight case backstage; a phone lit in a dark club corner; a bedroom studio (monitors, foam); a radio studio (on-air light off); a label office at night (one lamp, release whiteboard blurred).
6. **Honesty:** no real unreleased titles or inboxes; every screen shows sample data (see 26). Nothing staged as press, a party or endorsement.

## 2. Concepts per public page

**Home hero**
7. *The phone in the booth.* Close-up from over the shoulder of a DJ in a London booth, phone held low beside the CDJ. On screen is the Review Queue in Night theme, with one row playing and the Keep button lit lime. The CDJ cue light sits soft in the background. 4:5 crop, mood: focused at 2am. **[product on device]**
8. *Alternative:* a Lagos producer's hand on a laptop trackpad on a flight case, with the desk on screen. Wide, mostly black, the screen the only light.

**Home: How it works ("Share once. Decide fast.")**
9. Three tiles, each a cropped screen with no frame: (a) your link with a QR code, (b) a track landing in Up next, (c) Keep / Not for me. These are designed from screenshots alone.
10. A photo for the share step: the DJ's own Instagram story showing the QR code, on a phone resting on a mixer. **[product on device]**

**Home: Receipts ("Know what happened next.")**
11. *"Listened" on the producer's phone.* A bedroom studio at night (Lagos ideally, London on the first shoot). The producer sits on the edge of the bed, face lit by the phone. On screen is the receipt: "Sample DJ listened. 10 Oct, 01:12". Framing is medium, with the monitors out of focus. Mood: quiet relief. **[product on device]**

**Home: Privacy ("Music stays between the people you choose.")**
12. A closed laptop on a flight case, with headphones folded on top and one small lime LED. No people and no screen. It says "private" without any words.

**Home: Plans / FAQ**
13. No photo. A single crest mark on Booth Black, so the page can breathe before the prices.

**Pricing**
14. A triptych in matching light: one person with headphones (Free), a DJ with a crate and a laptop (Pro), and three people around one label desk at night (Team, "bring your crew").

**Claim your link (sign-up)**
15. A phone face-up on a booth's edge showing `floortest.app/samplehandle` on the link card with its QR code. Top-down shot, everything else black.

**Coming soon (beta gate)**
16. An empty booth before doors open: the decks covered, one work light on. Wide and still.

**Public send page (`/<handle>`)**
17. No photography. The receiver's own artwork, or the crest, carries the page. Senders need the drop zone, not mood.
18. Designer asset: a subtle waveform hairline under the brief, built from the real brief UI.

**Receipt (`/receipt/<token>`)**
19. No photo inside the receipt; the timeline is the image (loop 35). Marketing reuses 11.

**Trust**
20. No photo (recommended); the plain list is the trust. If one is wanted: a desk lamp over a closed notebook and a padlocked flight case.

**404**
21. A dropped needle or an empty CDJ slot showing "NO DISC", lit by the screen alone. One line of copy: "Nothing on this deck."

## 3. Product-shot staging rules

22. **Night theme only** for marketing.
23. **Show these screens:** the Review Queue row with Keep / Not for me, Up next on the Floor, the link card with its QR code, the receipt headline and timeline, and Prepare for set. Never show ops, settings, billing or the email-code screens.
24. **Crop to a single job:** one row, one card, one headline. Text must read at phone size; never a whole dashboard.
25. **No device frames** for designed tiles: a 16px-radius Booth Card crop on Booth Black. In photos, use real phones only (an iPhone and a mid-range Android: Lagos is largely Android).
26. **Sample data only:** invented artists and handles that can't be mistaken for real ones, e.g. "Sample Artist – Nightbus (demo)" or "@samplehandle". Add a 9px "SAMPLE" mark in Faint on every product image. Use plausible BPMs (118–124 for house, 112–114 for amapiano), no invented stats, and no "verified".
27. **One lime per image,** matching the One Light Rule. If the screenshot and the scene both have lime, darken the scene.
28. Seed a dedicated staging account (a scratch `DATA_DIR`) for every capture, so real users' data never appears in a shot.

## 4. Launch social visuals

29. **Story card: "Send me music."** 9:16, Booth Black, the crest at the top, a big QR code in the middle, `floortest.app/<handle>` in mono and nothing else. The template users post (matches the onboarding QR).
30. **Post: "Listened. 01:12".** 4:5, a crop from photo 11, with only the receipt's timestamp line set in mono over the black.
31. **Post: "The desk at 2am."** 4:5, from photo 7. The caption carries the copy; the image has no text.
32. **Carousel: "Play. Keep. Next."** Three 4:5 slides, each a cropped product row with one word in lime.
33. **Story: "Callout open."** 9:16, a template showing a receiver's brief (BPM · Genres · Wanted · Deadline) with the QR code. Senders reshare it.

## 5. Motion loops (3–6 s, seamless, muted)

34. **M1: A track lands (4 s).** An empty Up next list, then a row fades in from opacity 0 and scale 0.97 (200 ms ease-out). Its lime dot pulses once. How it works.
35. **M2: Receipt ticks to Listened (5 s).** The timeline shows Delivered (quiet), then the Listened row turns from dim to bright and the headline changes to "Sample DJ listened." Receipts section.
36. **M3: Keep (3 s).** On a phone crop, a row is dragged right, the Keep stamp follows the finger, then the row settles into Kept. Transform only.
37. **Reduced motion:** show the final frame as a still (the state change stays visible). Otherwise play only in view, with a pause control; each loop under 400 KB (WebM/MP4 + poster).

## 6. Small-budget plan

38. **One night, one photographer, two DJs**. Shoot 6 frames, in priority order:
    1. Phone in the booth (7)
    2. Laptop on a flight case (8)
    3. Producer receiving "Listened" in a bedroom studio (11; shot at the DJ's flat)
    4. Story on the mixer (10)
    5. Empty booth (16)
    6. A NO DISC 404 detail (21)

    Book the club before doors; load phones with the staging account first; shoot RAW, framed safe for 4:5 and 9:16.
39. **Lagos second shoot** when budget allows: a local photographer with the same brief, for 11 and the Team frame (14).
40. **Designed from screenshots alone, no shoot needed:** 9, 13, 15 (as a mock-up), 17, 18, 19, 29, 32, 33, and all three motion loops (34–36, built in code or After Effects from real UI).
41. **Until the photos exist,** launch on the screenshot tiles (9, 32) and the story card (29).
