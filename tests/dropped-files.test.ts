import { test } from "node:test";
import assert from "node:assert/strict";
import { readDrop, readEntries, skippedNote, type DropEntry } from "../src/lib/dropped-files";

// Fake entries shaped like the browser's FileSystemEntry; a folder reads back in batches of two, like readEntries.
const file = (name: string): DropEntry => ({ name, isFile: true, isDirectory: false, file: (ok) => ok(new File(["x"], name)) });
const dir = (name: string, kids: DropEntry[]): DropEntry => ({
  name,
  isFile: false,
  isDirectory: true,
  createReader: () => {
    let at = 0;
    return { readEntries: (ok) => ok(kids.slice(at, (at += 2))) };
  },
});
const names = (fs: File[]) => fs.map((f) => f.name);

test("a dropped folder gives its WAV and MP3 files in track order, nested folders included, and its name", async () => {
  const d = await readEntries([dir("Summer EP", [file("10 Outro.wav"), file("2 Intro.mp3"), file(".DS_Store"), dir("Bonus", [file("1 Dub.wav")]), file("cover.jpg")])]);
  assert.deepEqual(names(d.audio), ["2 Intro.mp3", "10 Outro.wav", "1 Dub.wav"]);
  assert.equal(d.folder, "Summer EP");
  assert.deepEqual(d.skipped, ["cover.jpg"]);
  assert.equal(d.dawProject, false);
});

test("music-software projects are skipped and named: bundles whole, project files and the sample folders beside them", async () => {
  const d = await readEntries([
    dir("Album", [
      dir("Song.logicx", [file("take.wav")]),
      dir("Track 1 Project", [file("Track 1.als"), dir("Samples", [file("kick.wav")]), dir("Ableton Project Info", []), file("Track 1 master.wav")]),
    ]),
  ]);
  assert.deepEqual(names(d.audio), ["Track 1 master.wav"]);
  assert.deepEqual(d.skipped, ["Song.logicx", "Track 1.als"]);
  assert.equal(d.dawProject, true);
  assert.match(skippedNote(d), /^Skipped 2 items that aren't WAV or MP3: Song\.logicx, Track 1\.als\. Music-software projects can't be played here/);
});

test("loose files or several folders have no folder name; a lone project bundle isn't a folder name", async () => {
  assert.equal((await readEntries([file("a.wav"), dir("B", [file("b.wav")])])).folder, null);
  assert.equal((await readEntries([dir("A", []), dir("B", [])])).folder, null);
  assert.equal((await readEntries([dir("Song.logicx", [])])).folder, null);
});

test("without the entry API the plain files are filtered the same way", async () => {
  const d = await readDrop([new File(["x"], "a.WAV"), new File(["x"], "notes.pdf")]);
  assert.deepEqual(names(d.audio), ["a.WAV"]);
  assert.deepEqual(d.skipped, ["notes.pdf"]);
  assert.equal(skippedNote({ skipped: [], dawProject: false }), "");
  assert.equal(skippedNote({ skipped: ["a", "b", "c", "d", "e"], dawProject: false }), "Skipped 5 items that aren't WAV or MP3: a, b, c and 2 more.");
});

test("a huge drop takes the first 200 tracks and says how many were left out", async () => {
  const d = await readEntries([dir("Sample pack", Array.from({ length: 205 }, (_, i) => file(`${i + 1} hit.wav`)))]);
  assert.equal(d.audio.length, 200);
  assert.equal(d.over, 5);
  assert.equal(skippedNote(d), "Took the first 200 tracks; 5 more left out, so drop those next.");
  const loose = await readDrop(Array.from({ length: 201 }, (_, i) => new File(["x"], `${i}.mp3`)));
  assert.equal(loose.audio.length, 200);
  assert.equal(loose.over, 1);
});
