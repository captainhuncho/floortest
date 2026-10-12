# Motion loops (images.md 34–37)

Built from the product's own UI with sample data, in code. No AI video.

| Loop | Length | Where it goes | Files |
|---|---|---|---|
| M1 · A track lands | 4 s | Home, the set log's "Lands in Up next"; social | `m1-track-lands.html`, `.webm`, `-poster.png` |
| M2 · The receipt ticks to Listened | 5 s | Home receipts / two sides of the desk; sender-facing posts | `m2-receipt-listened.html`, `.webm`, `-poster.png` |
| M3 · Keep | 3 s | "Cued up like a deck"; the 10-second Keep clip in the story kit | `m3-keep.html`, `.webm`, `-poster.png` |

- 4:5, 1080 × 1350, muted, each one exact cycle (plus about half a second of the first frame at the start). All under 400 KB.
- Posters are the reduced-motion still: the loop's story frame (the track landed, Listened lit, Kept).
- On the site, use the `.html` versions' CSS (lighter and sharper than video) or the `.webm` with the poster; play only in view, with a pause control.
- One lime per loop: the new-track dot, the Listened dot, the Keep button.
- MP4 (for Instagram and WhatsApp) needs ffmpeg, which isn't installed here: `ffmpeg -i m3-keep.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart m3-keep.mp4`.
- Fonts: JetBrains Mono under the SIL Open Font License (`fonts/JetBrainsMono-OFL.txt`).
- To re-record after an edit: open the `.html` files in a browser to check, then record each cycle with Playwright (`recordVideo`, 540 × 675 at 2×).
