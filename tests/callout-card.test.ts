import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import jsQR from "jsqr";
import sharp from "sharp";
import { testDataDir } from "./test-db";

process.env.DATA_DIR = testDataDir("ft-callout-card-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const fields = {
  name: "Nadia Okoye", handle: "nadia", callout: "Villagers callout", details: "Afro house, Amapiano. 118–124 BPM",
  closes: "Open until 30 Nov", link: "floortest.app/nadia", target: "https://floortest.app/nadia",
};
const callout = { name: "Villagers", bpm_min: 118, bpm_max: 124, brief_wanted: "Warm rollers", brief_note: "private-looking note", closes_at: null, genres: "" };
const receiver = { name: "Nadia", handle: "nadia", tz: "UTC" };
const decode = async (png: Buffer, width: number) => {
  const { data, info } = await sharp(png).resize(width).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data;
};
const photo = () => sharp({ create: { width: 800, height: 600, channels: 3, background: "#884422" } }).jpeg().withExif({ IFD0: { Copyright: "secret-gps" } }).toBuffer();

test("story and square are the right size, and the QR reads as the printed link at phone size", async () => {
  const { renderCard, fitPhoto } = await import("../src/lib/callout-card/render");
  const tilted = await fitPhoto(await photo());
  assert.ok(tilted, "a big enough photo is used");
  for (const [format, height] of [["story", 1920], ["square", 1080]] as const) {
    for (const p of [tilted, null]) {
      const png = await renderCard(format, fields, p);
      const meta = await sharp(png).metadata();
      assert.deepEqual([meta.width, meta.height], [1080, height]);
      assert.equal(meta.exif, undefined, "no photo metadata carries over");
      assert.equal(await decode(png, 1080), fields.target, `${format} at full size`);
      const jpeg = await sharp(png).jpeg({ quality: 70 }).toBuffer();
      assert.equal(await decode(jpeg, 1080), fields.target, `${format} after a JPEG repost`);
    }
  }
});

test("hostile and very long text draws as text and stays on the card", async () => {
  const { renderCard } = await import("../src/lib/callout-card/render");
  const png = await renderCard("story", { ...fields, name: `<b>&'"</span>${"x".repeat(200)}`, callout: "<script>alert(1)</script>".repeat(10), details: "&amp;".repeat(100), link: "floortest.app/" + "a".repeat(30), target: "https://floortest.app/" + "a".repeat(30) }, null);
  assert.equal((await sharp(png).metadata()).height, 1920);
  assert.equal(await decode(png, 1080), "https://floortest.app/" + "a".repeat(30));
});

test("names the fonts can't draw fall back to the handle, never empty boxes", async () => {
  const { cardFields } = await import("../src/lib/callout-card/fields");
  for (const name of ["نادية", "ナディア", "Nadia 🎧"]) assert.equal(cardFields({ ...receiver, name }, callout).name, "nadia", name);
  assert.equal(cardFields(receiver, { ...callout, name: "コール" }).callout, "");
  assert.equal(cardFields({ ...receiver, name: "José" }, callout).name, "José");
});

test("direction and control characters are stripped", async () => {
  const { cleanText } = await import("../src/lib/callout-card/render");
  assert.equal(cleanText("Na‮dia⁦\u0007 Ok​oye"), "Na dia Ok oye");
});

test("the card prints only what the public page shows, and one link", async () => {
  const { cardFields } = await import("../src/lib/callout-card/fields");
  const plain = cardFields(receiver, callout);
  assert.ok(!JSON.stringify(plain).includes("private-looking note"));
  assert.ok(!/Techno|House/i.test(plain.details), "default genres aren't presented as the receiver's");
  assert.equal(plain.details, "118–124 BPM");
  assert.equal(`https://${plain.link}`.replace("https://", ""), plain.target.replace(/^https?:\/\//, ""));
  const own = cardFields(receiver, { ...callout, genres: JSON.stringify(["Afro house", "Amapiano"]) });
  assert.equal(own.details, "Afro house, Amapiano. 118–124 BPM");
});

test("a photo that's too small or not an image is skipped", async () => {
  const { fitPhoto, PHOTO_SLOT } = await import("../src/lib/callout-card/render");
  const small = await sharp({ create: { width: PHOTO_SLOT - 1, height: 900, channels: 3, background: "#000" } }).png().toBuffer();
  assert.equal(await fitPhoto(small), null);
  assert.equal(await fitPhoto(new TextEncoder().encode("not an image")), null);
});

test("one open rule for the public page and the card", async () => {
  const { calloutBlock } = await import("../src/lib/desk");
  const open = { paused_at: null, pause_until: null };
  const live = { closes_at: null, full_at: null };
  assert.equal(calloutBlock(open, live, false), null);
  assert.equal(calloutBlock({ paused_at: 1, pause_until: null }, live, false), "paused");
  assert.equal(calloutBlock(open, { closes_at: 1, full_at: null }, false), "closed");
  assert.equal(calloutBlock(open, { closes_at: null, full_at: 1 }, false), "full");
  assert.equal(calloutBlock(open, live, true), "unavailable");
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/[handle]/page.tsx"), "utf8");
  assert.match(page, /calloutBlock\(receiver, collection, full\)/);
});

test("the route is owner-only, has fixed inputs, and asks for named columns", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/callout-card/[id]/route.ts"), "utf8");
  assert.ok(!/SELECT \*|activeCollection|collectionOf/.test(route));
  assert.match(route, /FROM collections WHERE id = \? AND user_id = \?/);
  assert.match(route, /if \(user\.role !== "owner" \|\| \(await viewingAs\(\)\)\) return notFound\(\)/);
  assert.match(route, /email_verified_at/);
  assert.match(route, /\/\^\\d\{1,15\}\$\//);
  assert.match(route, /\["story", "square"\]/);
  assert.match(route, /allow\("callout-card", String\(user\.id\)/);
  assert.match(route, /private, no-store/);
  assert.match(route, /quarantined\(key\)/);
  assert.ok(!/withMetadata|keepMetadata/.test(fs.readFileSync(path.join(process.cwd(), "src/lib/callout-card/render.ts"), "utf8")));
});

test("Inter is used only by the server renderer and never served", () => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|css)$/.test(e.name) && fs.readFileSync(p, "utf8").includes("Inter-Bold")) hits.push(path.relative(process.cwd(), p));
    }
  };
  walk(path.join(process.cwd(), "src"));
  assert.deepEqual(hits.sort(), ["src/lib/callout-card/render.ts"]);
  assert.equal(fs.existsSync(path.join(process.cwd(), "public/fonts/Inter-Bold.ttf")), false);
  assert.match(fs.readFileSync(path.join(process.cwd(), "src/lib/callout-card/render.ts"), "utf8"), /^import "server-only";/);
});
