import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { scanStream } from "./clamd.mjs";

/**
 * FloorTest's virus scanner. One job: POST /scan { key } (Bearer SCAN_SECRET) reads that file from the audio bucket with
 * this service's own read-only key, streams it through clamd, and answers { clean } or { clean: false, signature }.
 * Files never go to a third party and are never written to disk here. GET /health (Bearer SCAN_SECRET too) answers when
 * clamd is up: open, anyone could keep a running scanner busy or awake with it.
 *
 * Env: SCAN_SECRET, S3_ENDPOINT, S3_BUCKET, SCAN_ACCESS_KEY_ID, SCAN_SECRET_ACCESS_KEY (read-only on S3_BUCKET), PORT.
 */
const { SCAN_SECRET = "", S3_ENDPOINT, S3_BUCKET, SCAN_ACCESS_KEY_ID, SCAN_SECRET_ACCESS_KEY, PORT = "8080", CLAMD_HOST = "127.0.0.1", CLAMD_PORT = "3310" } = process.env;
if (SCAN_SECRET.length < 32 || !S3_ENDPOINT || !S3_BUCKET || !SCAN_ACCESS_KEY_ID || !SCAN_SECRET_ACCESS_KEY) {
  console.error("Missing settings: SCAN_SECRET (32+ characters), S3_ENDPOINT, S3_BUCKET, SCAN_ACCESS_KEY_ID, SCAN_SECRET_ACCESS_KEY");
  process.exit(1);
}
const s3 = new S3Client({
  region: "auto",
  endpoint: S3_ENDPOINT,
  credentials: { accessKeyId: SCAN_ACCESS_KEY_ID, secretAccessKey: SCAN_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const clamd = { host: CLAMD_HOST, port: Number(CLAMD_PORT) };

const authorised = (h = "") => {
  const a = Buffer.from(h);
  const b = Buffer.from(`Bearer ${SCAN_SECRET}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
// Only the folders the app stores uploads in (audio, stems, artwork), no "..", no leading slash: the read-only key can
// reach nothing else through this service.
const validKey = (k) => typeof k === "string" && k.length < 300 && /^(audio|stems|track-art)\/[A-Za-z0-9/_.-]+$/.test(k) && !k.includes("..");

const ping = () =>
  new Promise((resolve) => {
    const s = net.connect(clamd, () => s.end("zPING\0"));
    let out = "";
    s.on("data", (d) => (out += d));
    s.on("end", () => resolve(out.replace(/\0/g, "").trim() === "PONG"));
    s.on("error", () => resolve(false));
    s.setTimeout(3000, () => (s.destroy(), resolve(false)));
  });

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    try {
      const health = req.method === "GET" && req.url === "/health";
      if (!health && (req.method !== "POST" || req.url !== "/scan")) return send(res, 404, { error: "Not found" });
      if (!authorised(req.headers.authorization)) return send(res, 401, { error: "Unauthorized" });
      if (health) {
        const up = await ping();
        return send(res, up ? 200 : 503, { clamd: up });
      }
      let raw = "";
      for await (const c of req) {
        raw += c;
        if (raw.length > 2000) return send(res, 413, { error: "Too large" });
      }
      const { key } = JSON.parse(raw || "{}");
      if (!validKey(key)) return send(res, 400, { error: "Bad key" });
      const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      const result = await scanStream(obj.Body, clamd);
      // Logged without the key's file name beyond its folder: enough to trace, nothing about the music.
      console.log(JSON.stringify({ at: new Date().toISOString(), folder: key.split("/").slice(0, 2).join("/"), clean: result.clean, signature: result.signature }));
      return send(res, 200, result);
    } catch (e) {
      console.error(JSON.stringify({ at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) }));
      // The error's type only (e.g. AccessDenied, NoSuchKey, ECONNREFUSED): enough to fix a setting, nothing secret.
      const reason = (e && (e.Code || e.name || e.code)) || "Error";
      return send(res, 502, { error: "Scan failed", reason: String(reason).slice(0, 60) });
    }
  })
  .listen(Number(PORT), () => console.log(`scanner listening on ${PORT}`));
