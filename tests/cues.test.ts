import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCues } from "../src/lib/cues";

test("cues are cleaned: sorted, deduped, clamped to the track, labels trimmed", () => {
  const raw = JSON.stringify([
    { at: 92.04, label: "  drop  " },
    { at: 15, label: "intro" },
    { at: 92.0, label: "dupe" },
    { at: 999, label: "past the end" },
    { at: -3, label: "negative" },
    { label: "no time" },
  ]);
  assert.deepEqual(parseCues(raw, 300), [
    { at: 15, label: "intro" },
    { at: 92, label: "drop" },
  ]);
});

test("bad stored data gives no cues instead of throwing", () => {
  assert.deepEqual(parseCues("not json"), []);
  assert.deepEqual(parseCues('{"at":1}'), []);
  assert.deepEqual(parseCues(null), []);
});

test("Rekordbox XML carries cues as memory cues and energy in comments", async () => {
  const { rekordboxXml } = await import("../src/lib/rekordbox");
  const base = { id: 7, title: "Drop", artist: "A & B", mime: "audio/wav", size: 10, duration: 200, bpm: 124, created_at: 0, message: "hi" };
  const xml = rekordboxXml("Set", "/Music", [
    { ...base, energy: 4, cues: JSON.stringify([{ at: 64, label: "drop <1>" }]) },
    { ...base, id: 8, energy: null, cues: "[]" },
  ] as never);
  assert.match(xml, /Comments="Energy 4\/5 · FloorTest: hi"/);
  assert.match(xml, /<POSITION_MARK Name="drop &lt;1&gt;" Type="0" Start="64\.000" Num="-1"\/>\n {4}<\/TRACK>/);
  assert.equal((xml.match(/<TRACK TrackID/g) ?? []).length, 2);
  assert.equal((xml.match(/<\/TRACK>/g) ?? []).length, 1); // only the track with cues has a closing tag
});

test("a title with line breaks can't add entries to the M3U playlist", async () => {
  const { m3u } = await import("../src/lib/rekordbox");
  const out = m3u([{ id: 1, artist: "A", title: "Song\nhttp://evil.example/x.mp3\r\n#EXTINF:1,Fake", duration: 60, original_name: "s.wav", token: "t" } as never]);
  assert.equal(out.split("\n").filter(Boolean).length, 3, out);
});
