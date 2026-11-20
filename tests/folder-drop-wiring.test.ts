import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Who gets the page-wide drop, and what happens when making the project fails (Safety, 19 Nov, #686).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("only editors get the drop: Projects and a project render the upload, with its drop, behind canEdit", () => {
  const projects = read("src/app/dashboard/projects/ProjectsTab.tsx");
  assert.match(projects, /\{canEdit && <OwnerUpload [^>]*pageDrop="project"/);
  const project = read("src/app/dashboard/projects/[id]/page.tsx");
  const at = project.indexOf('pageDrop="here"');
  assert.ok(at > 0 && project.lastIndexOf("canEdit &&", at) > project.lastIndexOf("action={", at), "the project page's drop sits inside canEdit");
});

test("the drop listener is off unless pageDrop is set, and a dropped folder's project is made only through the admin action", () => {
  const upload = read("src/app/dashboard/collections/OwnerUpload.tsx");
  assert.match(upload, /usePageDrop\(\s*!!pageDrop && !busy,/);
  assert.match(upload, /import \{ createProject \} from "\.\.\/actions\/music"/);
  assert.match(read("src/app/dashboard/actions/music.ts"), /export async function createProject[\s\S]{0,120}requireRole\("admin"\)/);
});

test("when making the project fails, nothing uploads and the reason shows", () => {
  const upload = read("src/app/dashboard/collections/OwnerUpload.tsx");
  const made = upload.indexOf("const made = await createProject(newProject)");
  const loop = upload.indexOf("for (let i = 0; i < items.length; i++)", made);
  const fail = upload.slice(made, loop);
  assert.match(fail, /if \(!made\.ok\) \{\s*setBusy\(false\);\s*return setError\(made\.error\);/);
  assert.match(fail, /\.catch\(\(\) => \(\{ ok: false as const, error: "Couldn't make the project\. Try again\." \}\)\)/);
});
