// Draws the Android app icon (adaptive + legacy) and splash from public/brand/crest.svg: the crest on FloorTest ink.
// Run from the repo root (uses the website's sharp): node mobile/scripts/android-assets.mjs
import sharp from "sharp";
import fs from "node:fs";

const res = "mobile/android/app/src/main/res";
const crest = fs.readFileSync("public/brand/crest.svg");
const ink = { r: 16, g: 17, b: 15, alpha: 1 };
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function onInk(size, crestSize, round = false) {
  const mark = await sharp(crest, { density: 600 }).resize(crestSize, crestSize).png().toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: ink } }).composite([{ input: mark, gravity: "center" }]);
  if (round) {
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
  }
  return img.png().toBuffer();
}

for (const [d, k] of Object.entries(dens)) {
  const dir = `${res}/mipmap-${d}`;
  // Adaptive foreground: 108dp canvas, crest inside the 66dp safe zone (transparent; the background colour is ink).
  const fg = Math.round(108 * k);
  const mark = await sharp(crest, { density: 600 }).resize(Math.round(60 * k), Math.round(60 * k)).png().toBuffer();
  await sharp({ create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, gravity: "center" }]).png().toFile(`${dir}/ic_launcher_foreground.png`);
  const legacy = Math.round(48 * k);
  fs.writeFileSync(`${dir}/ic_launcher.png`, await onInk(legacy, Math.round(34 * k)));
  fs.writeFileSync(`${dir}/ic_launcher_round.png`, await onInk(legacy, Math.round(30 * k), true));
}
fs.writeFileSync(`${res}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#10110F</color>\n</resources>\n`);

// Splash (older Androids and the Capacitor splash): crest centred on ink, every size Capacitor generated.
for (const f of fs.readdirSync(res).filter((x) => x.startsWith("drawable"))) {
  const p = `${res}/${f}/splash.png`;
  if (!fs.existsSync(p)) continue;
  const { width, height } = await sharp(p).metadata();
  const m = Math.round(Math.min(width, height) * 0.22);
  const mark = await sharp(crest, { density: 600 }).resize(m, m).png().toBuffer();
  const out = await sharp({ create: { width, height, channels: 4, background: ink } }).composite([{ input: mark, gravity: "center" }]).png().toBuffer();
  fs.writeFileSync(p, out);
}
console.log("android icons + splash written");
