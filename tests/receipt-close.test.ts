import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-receipt-close-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);
const at = (d: number) => T0 + d * DAY;
const base = { created_at: T0, played_out_at: null, stems_requested_at: null, stems_sent: null };

// Receipt links close 90 days after the track's final outcome (owner, 4 Nov, "go 90"; "same clock for all, plus the
// stems hold"). The clock reads only what the receipt shows, so tracks a receiver kept, passed, deleted or never
// opened all look the same. LifeFacts has no decision or deletion field to read.
test("every track runs on the same clock: read-only on day 90, closed on day 180", async () => {
  const { receiptLife, receiptClosesAt } = await import("../src/lib/receipt-life");
  const expected = { 1: "open", 89: "open", 91: "read-only", 179: "read-only", 181: "closed" } as const;
  for (const [day, life] of Object.entries(expected)) assert.equal(receiptLife(base, at(Number(day))), life, `day ${day}`);
  assert.equal(receiptClosesAt(base), at(180));
});

test("played out is final at once, and closes 90 days after", async () => {
  const { receiptLife } = await import("../src/lib/receipt-life");
  const played = { ...base, played_out_at: at(3) };
  assert.equal(receiptLife(played, at(2)), "open");
  assert.equal(receiptLife(played, at(4)), "read-only");
  assert.equal(receiptLife(played, at(92)), "read-only", "day 89 after playing");
  assert.equal(receiptLife(played, at(94)), "closed", "day 91 after playing");
  // Played out after day 90 (a kept track) doesn't move the clock: it was read-only from day 90 already.
  assert.equal(receiptLife({ ...base, played_out_at: at(120) }, at(181)), "closed");
});

test("an open stems request holds the receipt open until a stem arrives", async () => {
  const { receiptLife } = await import("../src/lib/receipt-life");
  const asked = { ...base, stems_requested_at: at(10) };
  assert.equal(receiptLife(asked, at(91)), "open", "asked, none sent: open past day 90");
  assert.equal(receiptLife(asked, at(400)), "open");
  const sent = { ...asked, stems_sent: JSON.stringify(["Drums.wav"]) };
  assert.equal(receiptLife(sent, at(91)), "read-only", "once a stem lands the normal clock applies");
  assert.equal(receiptLife(sent, at(181)), "closed");
  assert.equal(receiptLife({ ...asked, stems_sent: "not json" }, at(91)), "open", "a broken list reads as nothing sent");
});

test("the decision can't change the clock: kept-and-played and passed-and-played are the same on days 89, 91, 179, 181", async () => {
  const { receiptLife } = await import("../src/lib/receipt-life");
  // The same facts reach the clock whatever the receiver decided: decision and removal aren't among them.
  const kept = { ...base, decision: "kept", decided_at: at(1), played_at: at(1) } as typeof base;
  const passed = { ...base, decision: "passed", decided_at: at(1), played_at: at(1), deleted_at: at(31) } as typeof base;
  for (const d of [1, 89, 91, 179, 181]) assert.equal(receiptLife(kept, at(d)), receiptLife(passed, at(d)), `day ${d}`);
  const src = fs.readFileSync(new URL("../src/lib/receipt-life.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src.replace(/\/\*[^]*?\*\/|\/\/.*$/gm, ""), /decision|decided_at|deleted_at/, "the clock never reads them");
  const receipt = fs.readFileSync(new URL("../src/lib/receipt.ts", import.meta.url), "utf8");
  const life = receipt.slice(receipt.indexOf("export async function receiptLifeByToken"));
  assert.doesNotMatch(life, /decision|decided_at|deleted_at/, "nor the lookup");
});

async function track(handle: string, days: number, extra: Partial<Record<"decision" | "decided_at" | "deleted_at" | "played_out_at" | "stems_sent", unknown>> = {}) {
  const { q } = await import("../src/lib/db");
  const R = await import("../src/lib/receipt-token");
  const created = Date.now() - days * DAY;
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES (?, 'h', 'R', ?, 'pro', 'UTC', ?) RETURNING id", `${handle}@x.io`, handle, created))!.id;
  await q.run("INSERT INTO feature_switches (feature, plans, users, updated_at) VALUES ('stems', '[]', ?, ?) ON CONFLICT (feature) DO UPDATE SET users = (feature_switches.users::jsonb || excluded.users::jsonb)::text", JSON.stringify([uid]), created);
  const sid = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", uid, `${handle}-s@x.io`, created))!.id;
  const id = (await q.get<{ id: number }>(
    "INSERT INTO tracks (user_id, sender_id, title, artist, original_name, mime, size, created_at, stems_requested_at) VALUES (?, ?, 'T', 'A', 't.wav', 'audio/wav', 1, ?, ?) RETURNING id",
    uid, sid, created, created,
  ))!.id;
  for (const [k, v] of Object.entries(extra)) await q.run(`UPDATE tracks SET ${k} = ? WHERE id = ?`, v, id);
  const token = R.newReceiptToken();
  await q.tx((db) => R.storeReceiptToken(db, id, token));
  return { id, token, uid };
}

test("the lookup by token: day 89 opens, day 91 is read-only, day 181 is closed, and stems stop once read-only", async () => {
  const { receiptLifeByToken } = await import("../src/lib/receipt");
  const S = await import("../src/lib/stems");
  const d89 = await track("rc89", 89);
  const d91 = await track("rc91", 91, { stems_sent: JSON.stringify(["Keys.wav"]) });
  const d181 = await track("rc181", 181, { decision: "passed", decided_at: Date.now() - 180 * DAY, stems_sent: JSON.stringify(["Keys.wav"]) });
  const held = await track("rchold", 120);
  assert.equal((await receiptLifeByToken(d89.token))?.life, "open");
  assert.equal((await receiptLifeByToken(d91.token))?.life, "read-only");
  assert.equal((await receiptLifeByToken(d181.token))?.life, "closed");
  assert.equal((await receiptLifeByToken(held.token))?.life, "open", "stems asked for, none sent: held open");
  assert.equal(await receiptLifeByToken("no-such-token"), null);
  // Stem upload: allowed on day 89, refused on day 91, by the server whatever the page shows.
  await assert.doesNotReject(S.startStemUpload(d89.token, "bass.wav", 1000, "9.9.9.1"));
  await assert.rejects(S.startStemUpload(d91.token, "bass.wav", 1000, "9.9.9.2"), /doesn't take stems any more/);
  await assert.rejects(S.completeStemUpload(d91.token, "x"), /doesn't take stems any more/);
});

test("from the outcome nothing can be done from the receipt; closed answers as an unknown link; history keeps it", () => {
  const actions = fs.readFileSync(new URL("../src/app/receipt/[token]/actions.ts", import.meta.url), "utf8");
  const body = (n: string) => actions.slice(actions.indexOf(`export async function ${n}(`)).split("\nexport ")[0];
  // Server actions need a request, so these check the code path: each looks at the receipt's life first.
  assert.match(body("stopSharing"), /receiptLifeByToken\(token\)\)\?\.life !== "open"/, "stop sharing only while open");
  assert.match(body("requestReceiptCode"), /life === "closed"\) return \{ sent: maskEmail\(null\) \}/, "closed: the unknown-link answer");
  assert.match(body("verifyReceiptCode"), /life === "closed"\) return/, "closed: the unknown-link answer");
  const page = fs.readFileSync(new URL("../src/app/receipt/[token]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(!status \|\| status\.life === "closed"\) return <ReceiptClosed \/>/);
  assert.match(page, /const stemsOn = open && /);
  assert.match(page, /\{open && proven && sharing/);
  const closed = fs.readFileSync(new URL("../src/app/receipt/[token]/ReceiptClosed.tsx", import.meta.url), "utf8");
  assert.match(closed, /export function ReceiptClosed\(\)/, "the closed page takes nothing about the track");
  // The decision columns are read only inside receiptLifeByToken, never into the receipt row the page gets.
  const receipt = fs.readFileSync(new URL("../src/lib/receipt.ts", import.meta.url), "utf8");
  const cols = receipt.slice(receipt.indexOf("RECEIPT_TRACK_COLUMNS = ["), receipt.indexOf("] as const"));
  assert.doesNotMatch(cols, /decision|decided_at|deleted_at/);
  // The live status answers as for an unknown link once closed.
  const pulse = fs.readFileSync(new URL("../src/lib/pulse.ts", import.meta.url), "utf8");
  assert.match(pulse, /life === "closed"\) return "";/);
  // Sender history (/sent, confirmed email) doesn't look at the receipt's life: closing ends only the bearer link.
  const sent = fs.readFileSync(new URL("../src/lib/sent.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sent, /receipt-life|receiptLife/);
});

test("sender history still lists a track whose receipt has closed", async () => {
  const { q } = await import("../src/lib/db");
  const { sentBy } = await import("../src/lib/sent");
  const { receiptLifeByToken } = await import("../src/lib/receipt");
  const old = await track("rchist", 400, { deleted_at: Date.now() - 300 * DAY, stems_sent: JSON.stringify(["Keys.wav"]) });
  assert.equal((await receiptLifeByToken(old.token))?.life, "closed");
  const t = Date.now();
  const me = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('rchist-s@x.io', 'h', 'S', 'rchists', 'free', 'UTC', ?, ?) RETURNING id", t, t))!;
  const rows = await sentBy({ id: me.id, email: "rchist-s@x.io", email_verified_at: t });
  assert.ok(rows.some((r) => r.id === old.id), "the closed track is still in their history");
});
