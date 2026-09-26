// FloorTest demo data: a receiver with two callouts, a handful of senders and synthetic WAV loops.
// Usage: npm run seed   (wipes ./data first)
// Demo login: demo@floortest.test / floortest-demo
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const UPLOADS = path.join(DATA_DIR, "uploads");
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(UPLOADS, { recursive: true });
const COVERS = path.join(DATA_DIR, "covers");
fs.mkdirSync(COVERS, { recursive: true });

// Boot the schema the same way the app does.
const schema = fs.readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8").match(/const SCHEMA = `([\s\S]*?)`;/)[1];
const db = new DatabaseSync(path.join(DATA_DIR, "floortest.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
db.exec(schema);

const DAY = 86_400_000;
const now = Date.now();

function hash(pw) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString("hex")}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}

/** A 32-second 4/4 loop: kick, off-beat hat and a bassline, so BPM detection has something real to lock onto. */
function makeLoop(bpm, rootHz, seed) {
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

function wav({ x, rate }) {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + x.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.round(x[i] * 32767), 44 + i * 2);
  return buf;
}

function peaks(x, count = 180) {
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

const user = db
  .prepare("INSERT INTO users (email, password_hash, name, handle, plan, role_line, created_at) VALUES (?,?,?,?,?,?,?)")
  .run("demo@floortest.test", hash("floortest-demo"), "Maxwell Adjavon", "maxwell", "free", "DJ / Performer", now - 40 * DAY);
const uid = Number(user.lastInsertRowid);
const col = (name, ago) => Number(db.prepare("INSERT INTO collections (user_id, name, created_at) VALUES (?,?,?)").run(uid, name, now - ago * DAY).lastInsertRowid);
const afterlife = col("Afterlife callout", 30);
const villagers = col("Villagers callout", 3);
// The current callout closes in two weeks; the old one closed last week.
db.prepare("UPDATE collections SET closes_at = ? WHERE id = ?").run(now + 14 * DAY, villagers);
db.prepare("UPDATE collections SET genres = ?, bpm_min = ?, bpm_max = ?, brief_note = ? WHERE id = ?").run(
  JSON.stringify(["Afro House", "Amapiano", "Deep House", "Tech House", "Melodic Techno"]),
  118,
  130,
  "Percussive, warm and built for late-night rooms",
  villagers,
);
// Cover photo for the Stage public page.
const coverName = `${uid}-demo.jpg`;
fs.copyFileSync(new URL("./assets/demo-cover.jpg", import.meta.url), path.join(COVERS, coverName));
db.prepare("UPDATE users SET cover_file = ? WHERE id = ?").run(coverName, uid);
db.prepare("UPDATE collections SET closes_at = ? WHERE id = ?").run(now - 7 * DAY, afterlife);
db.prepare("UPDATE users SET active_collection_id = ? WHERE id = ?").run(villagers, uid);

const senders = {};
const VERIFIED = new Set(["ama@example.com", "a&r@nightshift.example"]);
function sender(name, email, ago) {
  senders[email] ??= Number(
    db
      .prepare("INSERT INTO senders (user_id, email, name, created_at, verify_token, verified_at) VALUES (?,?,?,?,?,?)")
      .run(uid, email, name, now - ago * DAY, crypto.randomBytes(16).toString("base64url"), VERIFIED.has(email) ? now - ago * DAY + 3_600_000 : null)
      .lastInsertRowid,
  );
  return senders[email];
}
const ev = (sid, tid, type, at, detail = "") =>
  db.prepare("INSERT INTO events (user_id, sender_id, track_id, type, detail, created_at) VALUES (?,?,?,?,?,?)").run(uid, sid, tid, type, detail, at);

const tracks = [
  { s: ["Ama Mensah", "ama@example.com"], title: "Harmattan", genre: "Afro House", artist: "Ama Mensah", bpm: 122, hz: 55, c: afterlife, ago: 28, played: 27, dl: 27, keep: 1, rel: "unsigned", msg: "Built this around a highlife guitar sample. Extended mix available if it works for you." },
  { s: ["Kojo Tetteh", "kojo@example.com"], title: "Lagoon Drive", genre: "Deep House", artist: "Kojo Tetteh", bpm: 124, hz: 49, c: afterlife, ago: 21, played: 20, pass: 1, msg: "" },
  { s: ["Ama Mensah", "ama@example.com"], title: "Coastline (Dub)", genre: "Afro House", artist: "Ama Mensah", bpm: 120, hz: 58, c: afterlife, ago: 12, played: 11, keep: 1, rel: "unsigned", msg: "Dub version of the one you liked." },
  { s: ["Nightshift Records", "a&r@nightshift.example"], title: "Low Orbit", genre: "Melodic Techno", artist: "Selah", bpm: 126, hz: 46, c: villagers, ago: 2, rel: "signed", msg: "Label promo, out on Nightshift in November. Exclusive to you until the 15th." },
  { s: ["Tobi Adeyemi", "tobi@example.com"], title: "Afro Circuit", genre: "Afro House", artist: "Tobi Adeyemi", bpm: 118, hz: 52, c: villagers, ago: 1, msg: "First time sending, big fan of the Sunday sets." },
  { s: ["Kojo Tetteh", "kojo@example.com"], title: "Night Market", genre: "Tech House", artist: "Kojo Tetteh", bpm: 128, hz: 44, c: villagers, ago: 0.2, msg: "" },
];

for (const [i, t] of tracks.entries()) {
  const sid = sender(t.s[0], t.s[1], t.ago);
  const audio = makeLoop(t.bpm, t.hz, 1234 + i * 77);
  const file = `${crypto.randomUUID()}.wav`;
  const data = wav(audio);
  fs.writeFileSync(path.join(UPLOADS, file), data);
  const created = now - t.ago * DAY;
  const tid = Number(
    db
      .prepare(
        `INSERT INTO tracks (user_id, collection_id, sender_id, token, title, artist, message, release_status, genre, file_name, original_name, mime, size, duration, bpm, peaks, played_at, downloaded_at, decision, decided_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(uid, t.c, sid, crypto.randomBytes(12).toString("base64url"), t.title, t.artist, t.msg, t.rel ?? "", t.genre, file, `${t.title}.wav`, "audio/wav", data.length, 32, t.bpm, JSON.stringify(peaks(audio.x)), t.played ? now - t.played * DAY : null, t.dl ? now - t.dl * DAY : null, t.keep ? "kept" : t.pass ? "passed" : null, t.keep || t.pass ? now - (t.played ?? t.ago) * DAY + 120_000 : null, created).lastInsertRowid,
  );
  ev(sid, tid, "submitted", created, t.c === afterlife ? "into Afterlife callout" : "into Villagers callout");
  if (t.played) ev(sid, tid, "played", now - t.played * DAY);
  if (t.dl) ev(sid, tid, "downloaded", now - t.dl * DAY + 60_000);
  if (t.keep) ev(sid, tid, "kept", now - (t.played ?? t.ago) * DAY + 120_000);
  if (t.pass) ev(sid, tid, "passed", now - (t.played ?? t.ago) * DAY + 120_000);
}
ev(senders["ama@example.com"], null, "note", now - 26 * DAY, "Consistently strong. Ask about a live set for the Accra date.");
db.prepare("UPDATE tracks SET replied_at = ? WHERE title = 'Harmattan'").run(now - 27 * DAY + 600_000);
ev(senders["ama@example.com"], 1, "reply", now - 27 * DAY + 600_000, "This is great. Send the extended mix when you can, I want it for the closing hour.");

console.log(`Seeded ${tracks.length} tracks into ${DATA_DIR}\nLogin: demo@floortest.test / floortest-demo  ·  Receiver link: /maxwell`);
