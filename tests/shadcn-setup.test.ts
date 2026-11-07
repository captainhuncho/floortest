import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("shadcn/ui's colour names point at FloorTest's own tokens, and init's overrides stay out", () => {
  const css = read("src/app/globals.css");
  const block = css.slice(css.indexOf("@theme inline {"), css.indexOf("}", css.indexOf("@theme inline {")));
  const map: Record<string, string> = {
    background: "ink", foreground: "bone", primary: "lime", "primary-foreground": "ink", muted: "well",
    "muted-foreground": "mute", accent: "ink-4", destructive: "danger", border: "line", input: "field", ring: "lime",
  };
  for (const [name, token] of Object.entries(map)) {
    assert.match(block, new RegExp(`--color-${name}: var\\(--color-${token}\\);`), name);
  }
  // FloorTest's card stays its own; mapping it to a shadcn --card would undo Day mode cards.
  assert.doesNotMatch(block, /--color-card:/);
  // Tailwind's rounded-* scale is used ~180 times; shadcn init redefines it, which would restyle every one.
  assert.doesNotMatch(css, /--radius-(sm|md|lg|xl|2xl|3xl|4xl):/);
  assert.doesNotMatch(css, /shadcn\/tailwind\.css|@custom-variant dark|--font-sans: var\(--font-sans\)/);
  assert.match(css, /--font-sans: -apple-system,/, "the system font stack stays");
});

test("no font comes from Google (owner's rule: next/font/local only)", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
    });
  for (const f of walk(join(root, "src"))) assert.doesNotMatch(readFileSync(f, "utf8"), /from ["']next\/font\/google["']|https:\/\/fonts\.(googleapis|gstatic)\.com/, f);
});

test("cn joins classes and a later Tailwind class wins", async () => {
  const { cn } = await import("../src/lib/utils");
  assert.equal(cn("px-2 py-1", false && "hidden", "px-4"), "py-1 px-4");
  assert.equal(cn("text-bone", undefined, ["bg-ink", { "bg-card": true }]), "text-bone bg-card");
  const json = JSON.parse(read("components.json"));
  assert.equal(json.aliases.utils, "@/lib/utils");
  assert.equal(json.tailwind.css, "src/app/globals.css");
});
