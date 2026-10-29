# FloorTest virus scanner

ClamAV on our own small server. The app asks it to check each upload (track audio and stems) **before** the track
exists. It reads the file straight from the R2 audio bucket with its **own read-only key** and streams it through ClamAV.
The file never goes to a third-party service and is never written to disk here.

- `POST /scan` with `{ "key": "audio/12/….wav" }` and `Authorization: Bearer <SCAN_SECRET>` →
  `{ "clean": true }` or `{ "clean": false, "signature": "…" }`. Only `audio/`, `stems/`, `track-art/` and `pending/` keys
  are accepted.
- `GET /health` → 200 when ClamAV is up (the uptime monitor checks it). On Cloudflare it needs the secret too (below).
- Signatures: one update at start-up (the first takes a few minutes), then `freshclam` keeps them current.

The app side is `src/lib/scan.ts`. It's **off until `SCAN_URL` is set**. When on, it **fails closed**: if the scanner
can't be reached, nothing unscanned reaches a desk. The sender's file is **kept**: the app waits up to 150 s for a waking or restarting scanner, and if it
still can't scan, the send form holds the file so Send again only reruns the check (no second 250 MB upload). Ops gets
an incident either way.

**Host: Cloudflare Containers** (owner, 14 Oct). Wherever the scanner runs reads unreleased audio; Cloudflare already
holds it in R2, so this adds no new subprocessor and no lawyer step. `cloudflare/` is a small Worker in front of the same
image: it lets only `GET /status`, `GET /health`, `POST /wake` and `POST /scan` through, and all but `/status` need the
secret (`cloudflare/routes.js`; `/health` too since 28 Oct, when the repository went public: an open `/health` let
anyone keep the container awake and billed). **Sleeps after 10 idle minutes**
(owner, 26 Oct; it cost about $20 a month always on): `/wake` (with the secret) starts it as an upload starts,
`/scan` waits up to 90 s for it to be ready, `/status` says whether it's running without waking it. Cold start measured
26 Oct: 16–18 s locally (amd64 image under emulation on an Apple Silicon Mac) plus 1–3 s for Cloudflare to place it. Fly.io is only a fallback, for if Cloudflare can't keep up
(see the end of this file).

Cost: Workers Paid $5 a month, plus memory and disk billed as provisioned **only while it runs** (1 vCPU, 3 GiB: about
$20 a month always on; $1–3 at beta volume once it sleeps, see docs/costs.md) and CPU only as used.

> **Status, 14 Oct:** built and run locally (Docker, linux/amd64). Signatures are in the image, so it's ready in about
> 12 seconds; it used about 1 GB of memory; the EICAR test string came back `Eicar-Test-Signature`, a clean 5 MB file came
> back clean, and `/scan` without the secret answers 401. `wrangler deploy --dry-run` builds the image and the Worker.
> 14 Oct, deployed: `https://floortest-scanner.maxwelladjavon.workers.dev`, pinned to Western Europe (same region as
> the bucket). First start failed because Cloudflare starts containers with an empty `/run`; `start.sh` now makes
> `/run/clamav` itself, and the image moved to Alpine 3.22 (ClamAV 1.4.3; 1.2.2 was flagged outdated). EICAR on the
> real bucket (`audio/test/eicar.wav`, read with the scanner's own read-only key) came back `Eicar-Test-Signature`;
> test file deleted. Running in London (`lhr15`). **Live on floortest.app from 18:03 UTC:** `SCAN_URL` and `SCAN_SECRET`
> in Vercel **Production only** (preview uses its own bucket, which this key can't read, so preview uploads would be
> refused); a test track was scanned and reached the desk. The first tries answered 401: the secret pasted into Vercel
> wasn't the one in the file. Set it from the file instead of the clipboard (step 6).
> Before that, from 16:14 a deploy had `SCAN_URL` but no `SCAN_SECRET` yet, so uploads were refused (failed closed).

## Set up

1. **A read-only R2 key for the scanner (owner).** Cloudflare → R2 → Manage API tokens → Create: **Object Read only**,
   limited to `floortest-audio-eu`. Keep the Access Key ID and Secret for step 4; don't paste them into a chat.
2. **Workers Paid back on (owner).** Cloudflare → Workers & Pages → Plans. Containers need it.
3. **Build and test locally** (Docker Desktop running), from this folder: `docker build --platform linux/amd64 -t floortest-scanner .`,
   then run it with test values and check `curl localhost:8080/health` says `{"clamd":true}`.
4. **Deploy** from `scanner/cloudflare` (Docker Desktop running): `npm install`, `npx wrangler login` (owner signs in),
   then set the five secrets, each typed at the prompt, never on the command line or in chat:
   ```bash
   npx wrangler secret put SCAN_SECRET
   ```
   and the same for `S3_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`), `S3_BUCKET` (`floortest-audio-eu`),
   `SCAN_ACCESS_KEY_ID` and `SCAN_SECRET_ACCESS_KEY` (step 1). `SCAN_SECRET` is a long random value
   (`openssl rand -hex 32`). Then `npx wrangler deploy`. The first deploy takes a few minutes to place the container;
   `curl -H "Authorization: Bearer $(cat ~/floortest-scan-secret.txt)" https://floortest-scanner.<workers-subdomain>.workers.dev/health`
   should then say `{"clamd":true}` (without the secret it answers 401).
5. **Prove it catches something on the real bucket:** upload the EICAR test string to `audio/test/eicar.wav`, call
   `/scan` with that key and the secret: the answer must be `{"clean":false,"signature":"Eicar-Test-Signature"}`. Delete
   the test file afterwards.
6. **Turn it on in the app (owner):** set both values in Vercel **Production only**, `SCAN_SECRET` **before** `SCAN_URL`
   (a deploy with the address but no secret refuses every upload), the secret straight from the file
   so no clipboard is involved (a paste mismatch shows up in ops as `scanner answered 401`):
   ```bash
   tr -d '\n' < ~/floortest-scan-secret.txt | npx vercel env add SCAN_SECRET production
   ```
   `SCAN_URL` is the workers.dev address. Redeploy production and wait for Ready before testing (sends during the build
   still run on the old deployment). Send a test track; it should reach the desk with no new incident in ops.
7. **Monitoring:** `.github/workflows/uptime.yml` asks `/status` every 30 minutes (doesn't wake it) and `/health` once a
   day (wakes it and checks ClamAV, with the `SCAN_SECRET` repository secret; owner step, from the file so the value is
   never typed or shown: `tr -d '\n' < ~/floortest-scan-secret.txt | gh secret set SCAN_SECRET --repo captainhuncho/floortest`;
   without it that step is skipped with a notice). Don't point another monitor at `/health`: frequent pings keep it
   awake and paid for.

To turn scanning off quickly, remove `SCAN_URL` in Vercel and redeploy.

## Fallback: Fly.io (only if Cloudflare can't keep up)

Not in use. Switch only if the Cloudflare scanner can't hold the platform: "Virus check unavailable" incidents that keep
coming back, `/health` failing, or scans too slow for real upload volume, and a bigger container size hasn't fixed it.

1. **Legal first.** Fly.io would read unreleased audio, so it becomes a new sub-processor: the lawyer adds it to the
   Sub-processors page and Privacy, and users get the notice period, **before** any file goes there.
2. **Deploy** from this folder with `fly.toml` (London, 2 GB): `fly launch --no-deploy --copy-config`, then
   `fly secrets set` with the same five settings as step 4 (typed at the prompt, never in chat), then `fly deploy`.
   About $10–15 a month. Check `https://floortest-scanner.fly.dev/health` says `{"clamd":true}` and repeat the EICAR test.
3. **Switch:** in Vercel (Production) change `SCAN_URL` to the fly.dev address (same `SCAN_SECRET`), redeploy, send a
   test track. Point the uptime monitor at the new `/health`. Keep the Cloudflare Worker until the switch is proven.
