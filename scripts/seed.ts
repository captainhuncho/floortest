// FloorTest demo data: a receiver with two callouts, a handful of senders and synthetic WAV loops.
// Usage: npm run seed   (wipes the local ./data folder first; local development only)
// Demo login: demo@floortest.test / floortest-demo
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir, getDb } from "../src/lib/db/client";

if (process.env.DATABASE_URL || process.env.S3_BUCKET || process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: this script is for local development only (DATABASE_URL, S3_BUCKET or NODE_ENV=production is set).");
  process.exit(1);
}

const DATA_DIR = dataDir();
const STORAGE = path.join(DATA_DIR, "storage");
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(STORAGE, { recursive: true });
const putFile = (key: string, data: Uint8Array) => {
  const p = path.join(STORAGE, key);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
};

const DAY = 86_400_000;
const now = Date.now();

function hash(pw: string) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString("hex")}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}

/** A 32-second 4/4 loop: kick, off-beat hat and a bassline, so BPM detection has something real to lock onto. */
function makeLoop(bpm: number, rootHz: number, seed: number) {
  const rate = 22050, secs = 32, n = rate * secs;
  const x = new Float32Array(n);
  const beat = (60 / bpm) * rate;
  let r = seed;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const inBeat = i % beat;
    const t = inBeat / rate;
    const kick = Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 30)) * t) * Math.exp(-t * 9) * 0.9;
    const off = (i + beat / 2) % beat / rate;
    const hat = rand() * Math.exp(-off * 60) * 0.25;
    const bar = Math.floor(i / (beat * 4)) % 4;
    const note = rootHz * [1, 1, 1.189, 0.891][bar];
    const bass = Math.sin(2 * Math.PI * note * (i / rate)) * 0.3 * (1 - Math.exp(-t * 40)) * Math.exp(-t * 2);
    const swell = 0.6 + 0.4 * Math.sin((i / n) * Math.PI);
    x[i] = Math.max(-1, Math.min(1, (kick + hat + bass) * swell));
  }
  return { x, rate };
}

function wav({ x, rate }: { x: Float32Array; rate: number }) {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + x.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.round(x[i] * 32767), 44 + i * 2);
  return buf;
}

function peaks(x: Float32Array, count = 180) {
  const size = Math.floor(x.length / count);
  const out = [];
  for (let p = 0; p < count; p++) {
    let m = 0;
    for (let i = p * size; i < (p + 1) * size; i++) m = Math.max(m, Math.abs(x[i]));
    out.push(m);
  }
  const max = Math.max(...out);
  return out.map((v) => Math.round((v / max) * 100) / 100);
}


async function main() {
  const db = await getDb();
  const id = async (sql: string, ...args: unknown[]) => (await db.get<{ id: number }>(sql + " RETURNING id", ...args))!.id;

  const uid = await id(
    "INSERT INTO users (email, password_hash, name, handle, plan, role_line, tz, created_at) VALUES (?,?,?,?,?,?,?,?)",
    "demo@floortest.test",
    hash("floortest-demo"),
    "Maxwell Adjavon",
    "maxwell",
    "free",
    "DJ / Performer",
    "Africa/Accra",
    now - 40 * DAY,
  );
  const col = (name: string, ago: number) => id("INSERT INTO collections (user_id, name, created_at) VALUES (?,?,?)", uid, name, now - ago * DAY);
  const afterlife = await col("Afterlife callout", 30);
  const villagers = await col("Villagers callout", 3);
  // The current callout closes in two weeks; the old one closed last week.
  await db.run(
    "UPDATE collections SET closes_at = ?, genres = ?, bpm_min = ?, bpm_max = ?, brief_note = ? WHERE id = ?",
    now + 14 * DAY,
    JSON.stringify(["Afro House", "Amapiano", "Deep House", "Tech House", "Melodic Techno"]),
    118,
    130,
    "Percussive, warm and built for late-night rooms",
    villagers,
  );
  await db.run("UPDATE collections SET closes_at = ? WHERE id = ?", now - 7 * DAY, afterlife);
  // Cover photo for the Stage public page.
  const coverKey = `covers/${uid}-demo.jpg`;
  putFile(coverKey, fs.readFileSync(new URL("./assets/demo-cover.jpg", import.meta.url)));
  await db.run("UPDATE users SET cover_key = ?, active_collection_id = ? WHERE id = ?", coverKey, villagers, uid);
  // End-to-end tests only (SEED_SHARING=1, set by playwright.config.ts): sharing switched on and the current callout
  // open to sharing, so collection share links can be tested. The live site's switch is separate and stays off.
  if (process.env.SEED_SHARING === "1") {
    await db.run("INSERT INTO switches (key, on_, updated_at) VALUES ('sharing', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now);
    await db.run("UPDATE collections SET allow_sharing = 1 WHERE id = ?", villagers);
    // Two listeners with confirmed emails (test-only accounts): one the owner adds, one who has to ask.
    for (const [email, name, handle] of [["listener@floortest.test", "Lena Listener", "lena"], ["stranger@floortest.test", "Sam Stranger", "samx"]])
      await db.run(
        "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
        email,
        hash("floortest-demo"),
        name,
        handle,
        "free",
        "Europe/London",
        now,
        now - DAY,
      );
  }

  const senders: Record<string, number> = {};
  const VERIFIED = new Set(["ama@example.com", "a&r@nightshift.example"]);
  const sender = async (name: string, email: string, ago: number) =>
    (senders[email] ??= await id(
      "INSERT INTO senders (user_id, email, name, created_at, verified_at) VALUES (?,?,?,?,?)",
      uid,
      email,
      name,
      now - ago * DAY,
      VERIFIED.has(email) ? now - ago * DAY + 3_600_000 : null,
    ));
  const ev = (sid: number, tid: number | null, type: string, at: number, detail = "") =>
    db.run("INSERT INTO events (user_id, sender_id, track_id, type, detail, created_at) VALUES (?,?,?,?,?,?)", uid, sid, tid, type, detail, at);

  type Seed = { s: [string, string]; title: string; genre: string; artist: string; bpm: number; hz: number; c: number; ago: number; played?: number; dl?: number; keep?: number; pass?: number; rel?: string; msg: string };
  const tracks: Seed[] = [
  { s: ["Ama Mensah", "ama@example.com"], title: "Harmattan", genre: "Afro House", artist: "Ama Mensah", bpm: 122, hz: 55, c: afterlife, ago: 28, played: 27, dl: 27, keep: 1, rel: "unsigned", msg: "Built this around a highlife guitar sample. Extended mix available if it works for you." },
  { s: ["Kojo Tetteh", "kojo@example.com"], title: "Lagoon Drive", genre: "Deep House", artist: "Kojo Tetteh", bpm: 124, hz: 49, c: afterlife, ago: 21, played: 20, pass: 1, msg: "" },
  { s: ["Ama Mensah", "ama@example.com"], title: "Coastline (Dub)", genre: "Afro House", artist: "Ama Mensah", bpm: 120, hz: 58, c: afterlife, ago: 12, played: 11, keep: 1, rel: "unsigned", msg: "Dub version of the one you liked." },
  { s: ["Nightshift Records", "a&r@nightshift.example"], title: "Low Orbit", genre: "Melodic Techno", artist: "Selah", bpm: 126, hz: 46, c: villagers, ago: 2, rel: "signed", msg: "Label promo, out on Nightshift in November. Exclusive to you until the 15th." },
  { s: ["Tobi Adeyemi", "tobi@example.com"], title: "Afro Circuit", genre: "Afro House", artist: "Tobi Adeyemi", bpm: 118, hz: 52, c: villagers, ago: 1, msg: "First time sending, big fan of the Sunday sets." },
  { s: ["Kojo Tetteh", "kojo@example.com"], title: "Night Market", genre: "Tech House", artist: "Kojo Tetteh", bpm: 128, hz: 44, c: villagers, ago: 0.2, msg: "" },
];

  let harmattan = 0;
  for (const [i, t] of tracks.entries()) {
    const sid = await sender(t.s[0], t.s[1], t.ago);
    const audio = makeLoop(t.bpm, t.hz, 1234 + i * 77);
    const key = `audio/${uid}/${crypto.randomUUID()}.wav`;
    const data = wav(audio);
    putFile(key, data);
    const created = now - t.ago * DAY;
    const decidedAt = t.keep || t.pass ? now - (t.played ?? t.ago) * DAY + 120_000 : null;
    const tid = await id(
      `INSERT INTO tracks (user_id, collection_id, sender_id, token, title, artist, message, release_status, genre, file_key, original_name, mime, size, duration, bpm, peaks, played_at, downloaded_at, decision, decided_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      uid, t.c, sid, crypto.randomBytes(12).toString("base64url"), t.title, t.artist, t.msg, t.rel ?? "", t.genre, key, `${t.title}.wav`, "audio/wav",
      data.length, 32, t.bpm, JSON.stringify(peaks(audio.x)), t.played ? now - t.played * DAY : null, t.dl ? now - t.dl * DAY : null,
      t.keep ? "kept" : t.pass ? "passed" : null, decidedAt, created,
    );
    if (t.title === "Harmattan") harmattan = tid;
    await ev(sid, tid, "submitted", created, t.c === afterlife ? "into Afterlife callout" : "into Villagers callout");
    if (t.played) await ev(sid, tid, "played", now - t.played * DAY);
    if (t.dl) await ev(sid, tid, "downloaded", now - t.dl * DAY + 60_000);
    if (t.keep) await ev(sid, tid, "kept", decidedAt!);
    if (t.pass) await ev(sid, tid, "passed", decidedAt!);
  }
  // Account-team tests (SEED_TEAMS=1, test runs only): teams switched on, the demo account has two add-on seats, and
  // the test listener Lena is already on its team as a member (invite emails can't be read in a test run).
  if (process.env.SEED_TEAMS === "1") {
    await db.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now);
    await db.run("UPDATE users SET extra_seats = 2 WHERE id = ?", uid);
    const lena = await db.get<{ id: number }>("SELECT id FROM users WHERE email = 'listener@floortest.test'");
    if (lena) await db.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", uid, lena.id, now);
  }
  // Sharing tests: the Villagers tracks were sent while the callout allowed sharing.
  if (process.env.SEED_SHARING === "1") await db.run("UPDATE tracks SET share_ok = 1, share_terms = ? WHERE collection_id = ?", "e2e", villagers);
  const ama = senders["ama@example.com"];
  await ev(ama, null, "note", now - 26 * DAY, "Consistently strong. Ask about a live set for the Accra date.");
  await db.run("UPDATE tracks SET replied_at = ? WHERE id = ?", now - 27 * DAY + 600_000, harmattan);
  await ev(ama, harmattan, "reply", now - 27 * DAY + 600_000, "This is great. Send the extended mix when you can, I want it for the closing hour.");
  await db.close();
  console.log(`Seeded ${tracks.length} tracks into ${DATA_DIR}\nLogin: demo@floortest.test / floortest-demo  ·  Receiver link: /maxwell`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
