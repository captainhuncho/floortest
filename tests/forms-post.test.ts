import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Forms always post. A <form> with no action and no method is a GET when its script hasn't run yet (a slow phone, a
 * failed script), and the browser then puts every field, a password or code included, in the address, where logs and
 * history keep it. So every form names an action or a method, and only the read-only search and filter forms listed
 * here may use GET (they carry no password, code or token).
 */
const GET_ALLOWED = new Set([
  "src/app/admin/accounts/crm/CrmUsers.tsx",
  "src/app/admin/accounts/page.tsx",
  "src/app/admin/announcements/page.tsx",
  "src/app/admin/emails/page.tsx",
  "src/app/admin/moderation/page.tsx",
  "src/app/admin/privacy/page.tsx",
  "src/app/admin/verification/page.tsx",
]);

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx|jsx)$/.test(name) ? [path] : [];
  });

/** Each <form ...> opening tag in a file, with its line number. Braces are skipped so `=>` inside a handler isn't the end. */
function formTags(source: string): { tag: string; line: number }[] {
  const found: { tag: string; line: number }[] = [];
  for (const m of source.matchAll(/<form\b/g)) {
    let i = m.index + 5;
    let depth = 0;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    found.push({ tag: source.slice(m.index, i), line: source.slice(0, m.index).split("\n").length });
  }
  return found;
}

test("every form names an action or a method, so a submit before the script runs never puts fields in the address", () => {
  const bad: string[] = [];
  for (const file of files("src")) {
    for (const { tag, line } of formTags(readFileSync(file, "utf8"))) {
      const action = /\baction=/.test(tag);
      const method = tag.match(/\bmethod=["'](\w+)["']/)?.[1]?.toLowerCase();
      if (action || method === "post") continue;
      if (method === "get" && GET_ALLOWED.has(file)) continue;
      bad.push(`${file}:${line} ${method ? `method="${method}" (not on the GET list)` : "no action or method"}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("the check catches a bare form and a GET form, and passes a posting one", () => {
  const tags = formTags(`<form onSubmit={(e) => { e.preventDefault(); }} className="x"><input name="password" /></form>
<form method="get"></form>
<form method="post" onSubmit={go}></form>`);
  assert.equal(tags.length, 3);
  assert.equal(/\bmethod=/.test(tags[0].tag), false);
  assert.match(tags[1].tag, /method="get"/);
  assert.match(tags[2].tag, /method="post"/);
});
