import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { test } from "node:test";
import { zipStream } from "../src/lib/zip";

const streamOf = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });

test("zipStream produces an archive that unzip verifies, with UTF-8 names and multi-chunk entries", async () => {
  const big = new Uint8Array(300_000).map((_, i) => (i * 31) % 251);
  const sent: string[] = [];
  const zip = zipStream([
    { name: "Crate/rekordbox.xml", open: async () => streamOf([new TextEncoder().encode("<xml/>")]), onSent: () => void sent.push("xml") },
    { name: "Crate/Kwame – Tro Tro Rush [1].wav", open: async () => streamOf([big.slice(0, 100_000), big.slice(100_000)]), onSent: () => void sent.push("wav") },
  ]);
  const bytes = new Uint8Array(await new Response(zip).arrayBuffer());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-test-"));
  const file = path.join(dir, "t.zip");
  fs.writeFileSync(file, bytes);
  const listing = execFileSync("unzip", ["-t", file]).toString();
  assert.match(listing, /No errors detected/);
  // Read back with Python's zipfile, which honours the UTF-8 name flag (macOS unzip mangles names on extract).
  const py = `import zipfile,sys,hashlib,json
z=zipfile.ZipFile(sys.argv[1])
print(json.dumps({n: hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}))`;
  const members = JSON.parse(execFileSync("python3", ["-c", py, file]).toString()) as Record<string, string>;
  const sha = (b: Uint8Array) => crypto.createHash("sha256").update(b).digest("hex");
  assert.equal(members["Crate/Kwame – Tro Tro Rush [1].wav"], sha(big));
  assert.equal(members["Crate/rekordbox.xml"], sha(new TextEncoder().encode("<xml/>")));
  assert.deepEqual(sent, ["xml", "wav"]);
});
