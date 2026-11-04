import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Safety's LOW batch (review of main 91a0e5c, 4 Nov): small hardening, each checked here.
const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("a download's file name can't break the Content-Disposition header", async () => {
  const { attachment } = await import("../src/lib/content-disposition");
  const h = attachment(`Mix "final" \\ (v2)*'é.wav`);
  const plain = /filename="([^"]*)"/.exec(h)![1];
  assert.ok(!plain.includes("\\") && !plain.includes('"'), `plain name: ${plain}`);
  const star = /filename\*=UTF-8''(.*)$/.exec(h)![1];
  assert.doesNotMatch(star, /['()*"\\ ]/, "nothing unencoded in filename*");
  assert.equal(decodeURIComponent(star), `Mix "final" \\ (v2)*'é.wav`, "the real name survives");
  for (const f of ["src/app/api/tracks/[id]/download/route.ts", "src/app/api/tracks/[id]/stems/zip/route.ts", "src/app/api/tracks/[id]/stems/[stemId]/route.ts", "src/app/api/c/[token]/tracks/[id]/download/route.ts", "src/app/api/export/route.ts"])
    assert.match(read(f), /attachment\(/, `${f} uses the helper`);
});

test("audio is served as checked (nosniff), files always as the person, and view-as changes nothing", () => {
  for (const f of ["src/app/api/tracks/[id]/audio/route.ts", "src/app/api/v1/tracks/[id]/audio/route.ts"]) assert.match(read(f), /"X-Content-Type-Options": "nosniff"/, f);
  assert.match(read("src/lib/file-access.ts"), /actor_id: number \}/, "who is asking is required");
  assert.match(read("src/lib/file-access.ts"), /await asPerson\(desk\.actor_id, find\)/);
  assert.match(read("src/lib/offline.ts"), /actor_id: g\.actorId/);
  assert.match(read("src/app/api/v1/queue/route.ts"), /asPerson\(u\.actor_id/);
  assert.match(read("src/app/api/v1/tracks/[id]/decision/route.ts"), /asPerson\(u\.actor_id, \(\) => decide\(/);
  for (const f of ["src/app/api/tracks/[id]/listened/route.ts", "src/app/api/tracks/[id]/analysis/route.ts"]) {
    const s = read(f);
    assert.ok(s.indexOf("await viewingAs()") > 0 && s.indexOf("await viewingAs()") < s.indexOf("currentDeskForChange()"), `${f}: view-as refused first`);
  }
});
