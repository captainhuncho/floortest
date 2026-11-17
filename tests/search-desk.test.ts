import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-search-desk-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("search: forgives typos, ranks the closest first, knows the floor's other spellings, own desk only", async () => {
  const { q } = await import("../src/lib/db");
  const { searchDesk } = await import("../src/lib/search");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?, ?) RETURNING id",
      `${handle}@sd.io`, handle, handle, now, now,
    ))!.id;
  const a = await user("sddesk");
  const b = await user("sdother");
  const sender = async (desk: number, name: string, email: string) =>
    (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, ?, ?) RETURNING id", desk, email, name, now))!.id;
  const kwame = await sender(a, "Kwame Mensah", "kwame@send.io");
  const other = await sender(b, "Kwame Other", "kother@send.io");
  let n = 0;
  const track = async (desk: number, from: number, title: string, artist: string, genre: string | null, at = now) =>
    (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, title, artist, genre, token, file_key, original_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, 'audio/x.wav', 'x.wav', 'audio/wav', 1, ?) RETURNING id",
      desk, from, title, artist, genre, `tok-sd${++n}`, at,
    ))!.id;
  const afro = await track(a, kwame, "Lagos Nights", "Kwame", "Afro House", now - 1000);
  const house = await track(a, kwame, "House", "Ama", "Deep House", now - 2000);
  const dnb = await track(a, kwame, "Rollers", "Esi", "Drum and Bass");
  const ukg = await track(a, kwame, "Two Step", "Kofi", "UK Garage");
  const gone = await track(a, kwame, "Afro Gone", "Kwame", "Afro House");
  await q.run("UPDATE tracks SET deleted_at = ? WHERE id = ?", now, gone);
  const theirs = await track(b, other, "Afro Theirs", "Kwame", "Afro House");

  const desk = { id: a, actor_id: a };
  const ids = async (text: string, kind = "track") => (await searchDesk(desk, text)).filter((h) => h.kind === kind).map((h) => h.id);

  // Typos.
  assert.ok((await ids("afro hosue")).includes(afro), "afro hosue finds Afro House");
  assert.ok((await ids("kwami")).includes(afro), "kwami finds the artist Kwame");
  assert.ok((await ids("kwami", "contact")).includes(kwame), "kwami finds the contact Kwame Mensah");
  // Ranking: an exact title beats a genre match, and the newer of equals comes first.
  const houses = await ids("house");
  assert.equal(houses[0], house, "the track called House comes first");
  assert.ok(houses.indexOf(afro) > 0);
  // The floor's other spellings.
  assert.ok((await ids("dnb")).includes(dnb), "dnb finds Drum and Bass");
  assert.ok((await ids("ukg")).includes(ukg), "ukg finds UK Garage");
  // Plain substring still works, and contacts match email only by substring.
  assert.ok((await ids("lagos")).includes(afro));
  assert.ok((await ids("kwame@send", "contact")).includes(kwame));

  // Own desk only, live tracks only, even with a faked desk id.
  const all = await searchDesk(desk, "afro");
  assert.ok(!all.some((h) => h.id === gone), "deleted: never");
  assert.ok(!all.some((h) => h.id === theirs || (h.kind === "contact" && h.id === other)), "another desk: never");
  const faked = await searchDesk({ id: a, actor_id: b }, "afro");
  assert.ok(!faked.some((h) => h.id === afro || h.id === kwame), "the per-person rules hold even if the desk id is faked");

  // One character: substring only (every hit contains it), never a typo match.
  for (const h of await searchDesk(desk, "q")) assert.ok(`${h.title} ${h.detail}`.toLowerCase().includes("q"), h.title);
  assert.ok((await ids("k")).includes(ukg), "k still finds Kofi by substring");
  // Search runs under the person's database rules (role ft_person), not as the app: the source says so.
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/lib/search.ts", import.meta.url), "utf8");
  assert.match(src, /asPerson\(desk\.actor_id, \(\) =>\s*q\.tx\(/);

  // Input only fills values: wildcards and quotes match as text, and long input is capped, not an error.
  assert.deepEqual(await searchDesk(desk, "%"), []);
  assert.deepEqual(await searchDesk(desk, "_"), []);
  assert.deepEqual(await searchDesk(desk, "' OR 1=1 --"), []);
  assert.deepEqual(await searchDesk(desk, "   "), []);
  assert.ok(Array.isArray(await searchDesk(desk, "x".repeat(5000))));
});

test("spellings: whole words from the fixed list only, at most four", async () => {
  const { spellings } = await import("../src/lib/search");
  assert.deepEqual(spellings("dnb rollers").sort(), ["d&b rollers", "dnb rollers", "drum & bass rollers", "drum and bass rollers"]);
  assert.deepEqual(spellings("ukg"), ["ukg", "uk garage"]);
  assert.deepEqual(spellings("dnbx"), ["dnbx"], "not inside another word");
  assert.deepEqual(spellings("  dnb   "), ["dnb", "drum and bass", "drum & bass", "d&b"]);
  assert.deepEqual(spellings("(.*)"), ["(.*)"], "input is never a pattern");
  assert.deepEqual(spellings("house"), ["house"]);
});
