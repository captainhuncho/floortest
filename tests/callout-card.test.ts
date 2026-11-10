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

const NOTO = (name: string) => path.join(process.cwd(), "src/lib/callout-card/fonts", name);
const SERIF = NOTO("instrument-serif-italic-latin.ttf");
const shaped = async (text: string, cjk?: "jp" | "kr" | "sc" | "tc") => {
  const { layoutText } = await import("../src/lib/callout-card/shape");
  return layoutText(text, { house: SERIF, size: 100, cjk });
};
const inFont = (l: { glyphs: { file: string }[] }, file: string) => l.glyphs.some((g) => path.basename(g.file) === file);

test("every Latin-range character draws a real glyph, in the card's fonts or Noto", async () => {
  const { layoutText } = await import("../src/lib/callout-card/shape");
  const house = ["instrument-serif-italic-latin.ttf", "jetbrains-mono-400-latin.ttf", "jetbrains-mono-500-latin.ttf"].map(NOTO);
  for (const file of house) {
    for (let cp = 0x21; cp <= 0x24f; cp++) {
      if (/[\p{C}\p{Z}\p{M}]/u.test(String.fromCodePoint(cp))) continue;
      const l = await layoutText(String.fromCodePoint(cp), { house: file, size: 40 });
      assert.ok(l, `U+${cp.toString(16)} in ${path.basename(file)}`);
      assert.ok(l.glyphs.every((g) => g.id !== 0), `U+${cp.toString(16)} is not a box`);
    }
  }
  const half = await shaped("Kid ½");
  assert.ok(half && inFont(half, "NotoSans-Regular.ttf"), "a character the serif lacks moves to Noto");
});

test("each script is really shaped by its own font", async () => {
  const arabic = (await shaped("نادية"))!;
  assert.ok(inFont(arabic, "NotoSansArabic-Regular.ttf"));
  const { layoutText } = await import("../src/lib/callout-card/shape");
  const isolated = await Promise.all([..."نادية"].map((c) => layoutText(c, { house: SERIF, size: 100 })));
  assert.notDeepEqual(arabic.glyphs.map((g) => g.id).reverse(), isolated.map((l) => l!.glyphs[0].id), "letters join rather than standing alone");
  const hindi = (await shaped("कि"))!;
  assert.ok(inFont(hindi, "NotoSansDevanagari-Regular.ttf"));
  const parts = [(await shaped("क"))!.glyphs[0].id, (await shaped("ि"))!.glyphs.at(-1)!.id];
  assert.equal(hindi.glyphs[1].id, parts[0], "the vowel sign is reordered before the consonant");
  for (const [text, file] of [["สวัสดี", "NotoSansThai-Regular.ttf"], ["שלום", "NotoSansHebrew-Regular.ttf"], ["বাংলা", "NotoSansBengali-Regular.ttf"], ["தமிழ்", "NotoSansTamil-Regular.ttf"], ["Łukasz", "NotoSans-Regular.ttf"], ["Надя", "NotoSans-Regular.ttf"]] as const) {
    const l = await shaped(text);
    assert.ok(l && inFont(l, file) && l.glyphs.every((g) => g.id !== 0), text);
  }
  for (const [text, cjk, file] of [["ナディア", "jp", "NotoSansJP-Regular.otf"], ["나디아", "kr", "NotoSansKR-Regular.otf"], ["娜迪亚", "sc", "NotoSansSC-Regular.otf"], ["娜迪亞", "tc", "NotoSansTC-Regular.otf"]] as const) {
    const l = await shaped(text, cjk);
    assert.ok(l && inFont(l, file), text);
  }
});

test("Vietnamese draws without boxes in whichever font has it", async () => {
  const l = await shaped("Nguyễn Thị Ánh");
  assert.ok(l && l.glyphs.every((g) => g.id !== 0));
});

test("Hebrew reads right to left in glyph order", async () => {
  const l = (await shaped("של"))!;
  const lamed = (await shaped("ל"))!.glyphs[0].id;
  assert.equal(l.glyphs[0].id, lamed, "the last letter is drawn first, at the left");
});

test("right-to-left text mixed with Latin or number shapes it can't place falls back", async () => {
  for (const text of ["דני (DJ)", "Hello (مرحبا) World", "مرحبا (Hello) بكم", "שלום [world] עולם", "مرحبا 12:30 بكم", "128-140 موسيقى", "Hello مرحبا.", "أفرو 118–124 BPM", "ب2"]) assert.equal(await shaped(text), null, text);
});

test("digits and symbols whose place in right-to-left text isn't certain fall back", async () => {
  for (const text of ["مرحبا १ २ عالم", "مرحبا ๑ عالم", "مرحبا ১ عالم", "مرحبا ½¼ عالم", "אבג \u0482\u214f", "אבג \ua789", "אבג \ua78a", "אבג \ua92e", "אבג \uab5b", "אבג \u10fb"]) assert.equal(await shaped(text), null, text);
  for (const text of ["مرحبا ٢٠٢٦ عالم", "مرحبا ۲۰۲۶ عالم", "שלום 2026 עולם"]) assert.ok(await shaped(text), text);
});

test("one wide unbreakable character can't run off the card", async () => {
  const { renderCard } = await import("../src/lib/callout-card/render");
  const wide = `${"छ्".repeat(59)}छ`;
  for (const format of ["story", "square"] as const) {
    const withWide = await renderCard(format, { ...fields, details: wide }, null);
    const without = await renderCard(format, { ...fields, details: "" }, null);
    assert.deepEqual(await sharp(withWide).raw().toBuffer(), await sharp(without).raw().toBuffer(), "the field is left out");
  }
});

test("a name of invisible filler characters uses the handle", async () => {
  const { cardFields } = await import("../src/lib/callout-card/fields");
  for (const name of ["\u3164\u3164", "\u2800"]) assert.equal(cardFields({ ...receiver, name }, callout).name, "nadia");
});

test("no glyph ink is cut off at the edges of its box", async () => {
  const { drawText } = await import("../src/lib/callout-card/render");
  const { layoutText } = await import("../src/lib/callout-card/shape");
  const margin = 200;
  for (const text of ["Jacob", "Jeff", "Joy", "Ödön", "Ångström", "ẤẤẤẤẤ", "a\u0301\u0301\u0301\u0301", "عبدالله القحطاني", "اردو زبان", "ক্ষ্ম্র", "ख्रि कि"]) {
    const drawn = (await drawText(text, { file: SERIF }, 104, "#fff"))!;
    assert.ok(drawn, text);
    const layout = (await layoutText(text, { house: SERIF, size: 104 }))!;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width + margin * 2}" height="${layout.height + margin * 2}"><g fill="#fff" transform="translate(${margin} ${margin})">${layout.body}</g></svg>`;
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const image = await sharp(drawn.input).metadata();
    const box = { left: margin - drawn.padLeft, top: margin - drawn.padTop, right: margin - drawn.padLeft + image.width!, bottom: margin - drawn.padTop + image.height! };
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] === 0) continue;
      assert.ok(x >= box.left && x < box.right && y >= box.top && y < box.bottom, `${text}: ink at ${x},${y} outside ${JSON.stringify(box)}`);
    }
  }
});

test("Arabic decimal and thousands separators fall back", async () => {
  assert.equal(await shaped("مرحبا ٫٬ مرحبا"), null);
  assert.equal(await shaped("مرحبا ١٬٠٠٠"), null);
});

test("a name of only a grapheme joiner or object placeholder uses the handle", async () => {
  const { cardFields } = await import("../src/lib/callout-card/fields");
  for (const name of ["\u034f", "\u034f\u034f", "\ufffc"]) assert.equal(cardFields({ ...receiver, name }, callout).name, "nadia");
});

test("pure right-to-left text, brackets, a period and whole-word numbers keep their order and spaces", async () => {
  const closingShape = (await shaped("ب)"))!.glyphs[0].id;
  assert.equal((await shaped("مرحبا (بكم)"))!.glyphs[0].id, closingShape, "the bracket at the end is on the left and mirrored");
  const period = (await shaped("مرحبا."))!;
  assert.equal(period.glyphs[0].id, (await shaped("ب."))!.glyphs[0].id, "the period ends the sentence on the left");
  const middle = (await shaped("مرحبا 128 بكم"))!;
  const digits = (await shaped("128"))!;
  assert.equal(middle.glyphs.length, (await shaped("مرحبا"))!.glyphs.length + (await shaped("بكم"))!.glyphs.length + digits.glyphs.length + 2, "both spaces stay");
  assert.equal(new Set(middle.glyphs.map((g) => g.file)).size <= 2, true);
});

test("a field that can't be drawn keeps its BPM", async () => {
  const { renderCard } = await import("../src/lib/callout-card/render");
  const mixed = await renderCard("story", { ...fields, details: "أفرو 118–124 BPM", bpm: "118–124 BPM" }, null);
  const plain = await renderCard("story", { ...fields, details: "118–124 BPM", bpm: "118–124 BPM" }, null);
  assert.deepEqual(await sharp(mixed).raw().toBuffer(), await sharp(plain).raw().toBuffer());
});

test("shared punctuation and marks in a non-Latin line draw from a font that has them", async () => {
  for (const text of ["ミュージック", "東京ミュージック", "ジャズ・バー", "「ナディア」、東京。", "ナ〜！？"]) {
    const l = await shaped(text, "jp");
    assert.ok(l, text);
    assert.ok(l.glyphs.every((g) => g.id !== 0) && !inFont(l, "NotoSans-Regular.ttf"), text);
  }
  const samples = [["نادية", "،؛؟"], ["שלום", "׃"], ["नादिया", "।॥"], ["বাংলা", "।"], ["தமிழ்", ""], ["สวัสดี", "฿"], ["ナディア", "、。・ー"], ["나디아", "、。"], ["娜迪亚", "，。"]] as const;
  const ascii = Array.from({ length: 0x5e }, (_, i) => String.fromCharCode(0x21 + i)).filter((c) => !/[\p{L}\p{N}]/u.test(c));
  for (const [word, own] of samples) for (const ch of [...own, ...ascii, "–", "—", "…", "’"]) {
    const l = await shaped(`${word}${ch}`, /[가-힣]/.test(word) ? "kr" : /[ぁ-ヿ]/.test(word) ? "jp" : undefined);
    assert.ok(l && l.glyphs.every((g) => g.id !== 0), `${word} + U+${ch.codePointAt(0)!.toString(16)}`);
  }
  for (let cp = 0x3000; cp <= 0x30ff; cp++) {
    const ch = String.fromCodePoint(cp);
    if (!/[\p{Script=Common}]/u.test(ch) || /[\p{Z}\p{C}]/u.test(ch)) continue;
    assert.ok(await shaped(`ナ${ch}`, "jp"), `U+${cp.toString(16)}`);
  }
});

test("numbers read in the right order inside right-to-left text", async () => {
  for (const year of ["٢٠٢٦", "۲۰۲۶", "2026"]) {
    for (const lead of year === "2026" ? ["نادية", "שלום"] : ["نادية"]) {
      const ids = (await shaped(`${lead} ${year}`))!.glyphs.slice(0, 4).map((g) => g.id);
      assert.equal(ids[0], ids[2], `${year} after ${lead} reads 2,0,2`);
      assert.notEqual(ids[0], ids[1], `${year} after ${lead}`);
      assert.notEqual(ids[0], ids[3], `${year} after ${lead} ends in 6, not 2`);
    }
    const alone = (await shaped(year))!.glyphs.map((g) => g.id);
    assert.equal(alone[0], alone[2], `${year} alone`);
    assert.notEqual(alone[3], alone[0], `${year} alone ends in 6`);
  }
});

test("joiners can't hide stacked marks", async () => {
  assert.equal(await shaped(`ب${"\u06d6\u06d7\u06d8\u06d9\u200d".repeat(20)}ب`), null);
  assert.equal(await shaped(`ب${"\u06d6\u200c".repeat(6)}`), null);
  assert.ok(await shaped("می\u200cخواهم"), "a real Persian joiner still draws");
});

test("a photo in any format but JPEG, PNG or WebP is skipped", async () => {
  const { fitPhoto } = await import("../src/lib/callout-card/render");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900"/></svg>');
  assert.equal(await fitPhoto(svg), null);
  const base = sharp({ create: { width: 900, height: 900, channels: 3, background: "#884422" } });
  assert.equal(await fitPhoto(await base.clone().tiff().toBuffer()), null);
  assert.equal(await fitPhoto(await base.clone().gif().toBuffer()), null);
  for (const encoded of [base.clone().jpeg(), base.clone().png(), base.clone().webp()]) assert.ok(await fitPhoto(await encoded.toBuffer()));
});

test("too many fonts, missing glyphs, stacked marks and huge strings can't be drawn", async () => {
  assert.equal(await shaped("Abc نادية שלום"), null, "three font files");
  assert.equal(await shaped("ᚠᚢᚦ"), null, "a script with no font");
  assert.equal(await shaped(`a${"́".repeat(5)}`), null, "stacked marks");
  assert.ok(await shaped(`a${"́".repeat(2)}`));
  assert.equal(await shaped("สวัสดี".repeat(200)), null, "over the glyph cap");
});

test("fields keep every language, drop emoji, and only an empty name uses the handle", async () => {
  const { cardFields } = await import("../src/lib/callout-card/fields");
  for (const name of ["نادية", "ナディア", "Łukasz", "José"]) assert.equal(cardFields({ ...receiver, name }, callout).name, name);
  assert.equal(cardFields({ ...receiver, name: "Nadia 🎧" }, callout).name, "Nadia");
  for (const name of ["🎧", "👩‍🎤", "1️⃣", "🇬🇧", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "❤️"]) assert.equal(cardFields({ ...receiver, name }, callout).name, "nadia", name);
  assert.equal(cardFields({ ...receiver, name: "ナディア" }, callout).cjk, "jp");
  assert.equal(cardFields({ ...receiver, name: "娜迪", tz: "Asia/Taipei" }, callout).cjk, "tc");
  assert.equal(cardFields({ ...receiver, name: "娜迪" }, callout).cjk, "sc");
});

test("a name that can't be drawn prints the handle, an RTL name leaves link and QR alone", async () => {
  const { renderCard } = await import("../src/lib/callout-card/render");
  const handleOnly = await renderCard("story", { ...fields, name: fields.handle }, null);
  const undrawable = await renderCard("story", { ...fields, name: "ᚠᚢᚦ" }, null);
  assert.deepEqual(await sharp(undrawable).raw().toBuffer(), await sharp(handleOnly).raw().toBuffer());
  const footer = (png: Buffer) => sharp(png).extract({ left: 0, top: 1500, width: 1080, height: 420 }).raw().toBuffer();
  const rtl = await renderCard("story", { ...fields, name: "نادية", callout: fields.callout }, null);
  assert.equal(await decode(rtl, 1080), fields.target);
  const ltr = await renderCard("story", { ...fields, name: "Nadia" }, null);
  assert.deepEqual(await footer(rtl), await footer(ltr), "printed link and QR don't move");
});

test("every language fits the card in both formats and the QR still reads", async () => {
  const { renderCard } = await import("../src/lib/callout-card/render");
  const samples = ["نادية أوكوي", "नादिया ओकोये", "สวัสดีครับ", "שלום עולם", "ナディア・オコイエ", "나디아 오코예", "娜迪亚奥科耶", "Łukasz Nguyễn Надя"];
  for (const format of ["story", "square"] as const) {
    for (const text of samples) {
      const png = await renderCard(format, { ...fields, name: text.repeat(4), callout: text.repeat(6), details: text.repeat(12), cjk: /[ぁ-ヿ]/.test(text) ? "jp" : /[가-힣]/.test(text) ? "kr" : "sc" }, null);
      assert.equal(await decode(png, 1080), fields.target, `${format} ${text}`);
    }
  }
});

test("200 renders don't grow memory", async () => {
  const { renderCard } = await import("../src/lib/callout-card/render");
  const card = { ...fields, name: "ナディア", callout: "نادية", details: "สวัสดี", cjk: "jp" as const };
  await renderCard("square", card, null);
  const before = process.memoryUsage();
  for (let i = 0; i < 200; i++) await renderCard("square", card, null);
  global.gc?.();
  const after = process.memoryUsage();
  assert.ok(after.arrayBuffers - before.arrayBuffers < 16 * 1024 * 1024, `grew ${(after.arrayBuffers - before.arrayBuffers) / 1e6} MB`);
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
  assert.match(route, /if \(await viewingAs\(\)\) return notFound\(\)/);
  assert.match(route, /if \(user\.role !== "owner"\) return notFound\(\)/);
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
