# FloorTest virus scanner

ClamAV on our own small server. The app asks it to check each upload (track audio and stems) **before** the track
exists. It reads the file straight from the R2 audio bucket with its **own read-only key** and streams it through ClamAV.
The file never goes to a third-party service and is never written to disk here.

- `POST /scan` with `{ "key": "audio/12/….wav" }` and `Authorization: Bearer <SCAN_SECRET>` →
  `{ "clean": true }` or `{ "clean": false, "signature": "…" }`. Only `audio/`, `stems/`, `track-art/` and `pending/` keys
  are accepted.
- `GET /health` → 200 when ClamAV is up (Fly's health check uses it).
- Signatures: one update at start-up (the first takes a few minutes), then `freshclam` keeps them current.

The app side is `src/lib/scan.ts`. It's **off until `SCAN_URL` is set**. When on, it **fails closed**: if the scanner
can't be reached, the upload is refused with "try again in a few minutes", and ops gets an incident. Nothing unscanned
reaches a desk.

> **Status, 12 Oct:** the protocol code is tested against a fake ClamAV (`tests/scan.test.ts`). The container itself
> hasn't been built or run yet: do steps 2–3 below on a Mac with Docker before deploying.

## Set up

1. **A read-only R2 key for the scanner.** Cloudflare → R2 → Manage API tokens → Create: **Object Read only**, limited
   to `floortest-audio-eu`. Keep the Access Key ID and Secret for step 4; don't paste them into a chat.
2. **Build and test locally** (Docker Desktop running), from this folder:
   ```bash
   docker build -t floortest-scanner .
   ```
   Then run it with the read-only key and a long random secret:
   ```bash
   docker run --rm -p 8080:8080 -e SCAN_SECRET="$(openssl rand -hex 32)" -e S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com -e S3_BUCKET=floortest-audio-eu -e SCAN_ACCESS_KEY_ID=… -e SCAN_SECRET_ACCESS_KEY=… floortest-scanner
   ```
   Wait for `scanner listening on 8080` (a few minutes the first time), then `curl localhost:8080/health` should say `{"clamd":true}`.
3. **Prove it catches something** with the EICAR test file, the industry-standard harmless test string that every
   antivirus reports as infected. Upload it to a test path in the bucket, e.g. `audio/test/eicar.wav`, then call `/scan` with that key: the answer
   must be `{"clean":false,"signature":"Eicar-Test-Signature"}`. Delete the test file afterwards.
4. **Deploy** to Fly.io (London) from this folder: `fly launch --no-deploy --copy-config`, then set the settings as
   secrets (`fly secrets set SCAN_SECRET=… S3_ENDPOINT=… S3_BUCKET=floortest-audio-eu SCAN_ACCESS_KEY_ID=… SCAN_SECRET_ACCESS_KEY=…`)
   and `fly deploy`. 2 GB of memory (ClamAV's signatures need about 1 GB); roughly $10–15 a month.
5. **Turn it on in the app:** in Vercel (Production), set `SCAN_URL=https://floortest-scanner.fly.dev` and
   `SCAN_SECRET` (the same secret as step 4), then redeploy. Send a test track and check it arrives. Then check the scan
   appears in `fly logs` (folder and verdict only, never the file name).

To turn scanning off quickly, remove `SCAN_URL` in Vercel and redeploy.
