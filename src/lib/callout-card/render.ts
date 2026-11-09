import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import sharp, { type OverlayOptions } from "sharp";
import { layoutText, shortenGraphemes, type CjkFont } from "./shape";

export type CardFormat = "story" | "square";
export type CardFields = { name: string; handle: string; callout: string; details: string; closes: string; link: string; target: string; cjk?: CjkFont };

const INK = { r: 16, g: 17, b: 15, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const BONE = "#f1f1eb";
const MUTE = "#a9aaa3";
const LIME = "#d5ff48";
const ART_SIZE = 1024;
/** The mailer's window. A smaller photo is skipped rather than blown up. */
export const PHOTO_SLOT = 438;
const PHOTO_TILT: [[number, number], [number, number]] = [[0.993, -0.148], [0.119, 0.989]];
const PHOTO_AT = { left: 297, top: 21 };
const LOCKUP_CENTRE = { x: 492, y: 612 };
const LOCKUP_TILT = 8.5;
const TEXT_LEFT = 96;
const TEXT_WIDTH = 888;
const MAX_PHOTO_PIXELS = 40_000_000;
const PHOTO_FORMATS: readonly string[] = ["jpeg", "png", "webp"];
const SHARP_SECONDS = 5;
const QR_QUIET_MODULES = 4;
const LINE_HEIGHT = 1.28;

const LAYOUT = {
  story: { width: 1080, height: 1920, art: { x: 57, y: 232, scale: 0.95 }, top: 1085, kicker: 32, name: 104, callout: 40, details: 32, gap: 24, qrScale: 4, detailLines: 2 },
  square: { width: 1080, height: 1080, art: { x: 195, y: 0, scale: 0.68 }, top: 618, kicker: 26, name: 76, callout: 32, details: 26, gap: 6, qrScale: 3, detailLines: 1 },
};

const CARD_DIR = path.join(process.cwd(), "src/lib/callout-card");
const FONTS = {
  serif: { file: path.join(CARD_DIR, "fonts/instrument-serif-italic-latin.ttf") },
  mono: { file: path.join(CARD_DIR, "fonts/jetbrains-mono-400-latin.ttf") },
  monoMedium: { file: path.join(CARD_DIR, "fonts/jetbrains-mono-500-latin.ttf") },
  // Only ever given the fixed word below, never anything a person typed.
  brand: { file: path.join(process.cwd(), "src/app/fonts/Inter-Bold.ttf") },
};
type Font = (typeof FONTS)[keyof typeof FONTS];
type TextOptions = { width?: number; maxLines?: number; cjk?: CjkFont };
type Drawn = { input: Buffer; width: number; height: number };

const JOINING_SCRIPTS = "\\p{Script=Arabic}\\p{Script=Devanagari}\\p{Script=Bengali}\\p{Script=Tamil}";
const JOINS_BEFORE = new RegExp(`[${JOINING_SCRIPTS}]$`, "u");
const JOINS_AFTER = new RegExp(`^[${JOINING_SCRIPTS}]`, "u");
const ZERO_WIDTH_JOINER = /[‌‍]/;
const KEYCAP = /[0-9#*]️?⃣/gu;
const EMOJI = /(?![©®™])\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Variation_Selector}|[\u{e0020}-\u{e007f}]|⃣/gu;

/** Emoji, control and direction-override characters out, so a name can't reorder or hide what's printed. Joiners stay only where a script needs them. */
export const cleanText = (raw: string) =>
  raw
    .normalize("NFC")
    .replace(KEYCAP, "")
    .replace(EMOJI, "")
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, (ch, at: number, all: string) => {
      if (!ZERO_WIDTH_JOINER.test(ch)) return " ";
      return JOINS_BEFORE.test(all.slice(Math.max(0, at - 2), at)) && JOINS_AFTER.test(all.slice(at + 1, at + 3)) ? ch : "";
    })
    .replace(/\s+/g, " ")
    .trim();

/** Words drawn as shapes from the card's own font files: no system fonts, nothing a person typed reaches a markup parser. Null if a character can't be drawn. */
async function drawText(text: string, source: Font, size: number, colour: string, options: TextOptions = {}): Promise<Drawn | null> {
  const layout = await layoutText(text, { house: source.file, size, ...options });
  if (!layout) return null;
  const height = Math.ceil(size * LINE_HEIGHT) * layout.lines;
  const input = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${height}"><g fill="${colour}">${layout.body}</g></svg>`)).png().toBuffer();
  return { input, width: layout.width, height };
}

/** Text we wrote ourselves: the card's fonts always have it. */
async function drawFixed(text: string, source: Font, size: number, colour: string) {
  const drawn = await drawText(text, source, size, colour);
  if (!drawn) throw new Error("card font is missing a fixed character");
  return drawn;
}

/** One line, made smaller if it would run past `maxWidth`. */
async function drawFitted(text: string, font: Font, size: number, colour: string, maxWidth: number, cjk?: CjkFont) {
  const drawn = await drawText(text, font, size, colour, { cjk });
  if (!drawn || drawn.width <= maxWidth) return drawn;
  return drawText(text, font, Math.floor((size * maxWidth) / drawn.width), colour, { cjk });
}

/** The photo tilted into the mailer's window, or null if it can't be used, so the caller can try the next one. */
export async function fitPhoto(bytes: Uint8Array): Promise<Buffer | null> {
  try {
    const meta = await sharp(bytes, { limitInputPixels: MAX_PHOTO_PIXELS }).metadata();
    if (!PHOTO_FORMATS.includes(meta.format ?? "")) return null;
    const shorter = Math.min(meta.autoOrient?.width ?? meta.width ?? 0, meta.autoOrient?.height ?? meta.height ?? 0);
    if (shorter < PHOTO_SLOT) return null;
    const square = await sharp(bytes, { limitInputPixels: MAX_PHOTO_PIXELS }).timeout({ seconds: SHARP_SECONDS }).rotate().resize(PHOTO_SLOT, PHOTO_SLOT, { fit: "cover", position: "centre" }).png().toBuffer();
    return await sharp(square).timeout({ seconds: SHARP_SECONDS }).ensureAlpha().affine(PHOTO_TILT, { background: CLEAR, interpolator: "bicubic" }).png().toBuffer();
  } catch {
    return null;
  }
}

async function drawLockup() {
  const crest = await sharp(path.join(process.cwd(), "public/brand/crest.svg")).resize(112, 112, { fit: "contain", background: CLEAR }).png().toBuffer();
  const word = await drawFixed("FloorTest", FONTS.brand, 48, BONE);
  const beta = await drawFixed("BETA", FONTS.monoMedium, 18, LIME);
  const pad = { x: 12, y: 6 };
  const pillW = beta.width + pad.x * 2;
  const pillH = beta.height + pad.y * 2;
  const pill = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pillW}" height="${pillH}"><rect x="1" y="1" width="${pillW - 2}" height="${pillH - 2}" rx="${(pillH - 2) / 2}" fill="none" stroke="${LIME}" stroke-opacity=".4" stroke-width="2"/></svg>`);
  const gap = 16;
  const width = 112 + gap + word.width + gap + pillW;
  const line = await sharp({ create: { width, height: 112, channels: 4, background: CLEAR } })
    .composite([
      { input: crest, left: 0, top: 0 },
      { input: word.input, left: 112 + gap, top: Math.round((112 - word.height) / 2) },
      { input: pill, left: width - pillW, top: Math.round((112 - pillH) / 2) },
      { input: beta.input, left: width - pillW + pad.x, top: Math.round((112 - beta.height) / 2) },
    ])
    .png()
    .toBuffer();
  return sharp(line).rotate(LOCKUP_TILT, { background: CLEAR }).png().toBuffer({ resolveWithObject: true });
}

async function drawArt(photo: Buffer | null) {
  const [mailer, blank, lockup] = await Promise.all([
    fs.readFile(path.join(CARD_DIR, "art/d-mailer.png")),
    fs.readFile(path.join(CARD_DIR, "art/d-card.png")),
    drawLockup(),
  ]);
  return sharp({ create: { width: ART_SIZE, height: ART_SIZE, channels: 4, background: CLEAR } })
    .composite([
      photo ? { input: photo, ...PHOTO_AT } : { input: blank, left: 0, top: 0 },
      { input: mailer, left: 0, top: 0 },
      { input: lockup.data, left: Math.round(LOCKUP_CENTRE.x - lockup.info.width / 2), top: Math.round(LOCKUP_CENTRE.y - lockup.info.height / 2) },
    ])
    .png()
    .toBuffer();
}

/** Black on white with a full quiet zone, whole pixels per module, the size phones read off another screen. */
async function drawQr(target: string, scale: number) {
  return QRCode.toBuffer(target, { errorCorrectionLevel: "M", margin: QR_QUIET_MODULES, scale, type: "png", color: { dark: "#10110f", light: "#ffffff" } });
}

/** Draws the card. `photo` comes from fitPhoto; null uses the blank card. Nothing is fetched. */
export async function renderCard(format: CardFormat, fields: CardFields, photo: Buffer | null) {
  const l = LAYOUT[format];
  const artSize = Math.round(ART_SIZE * l.art.scale);
  const [art, qr] = await Promise.all([
    drawArt(photo).then((b) => sharp(b).resize(artSize, artSize).png().toBuffer()),
    drawQr(fields.target, l.qrScale),
  ]);
  const qrSize = (await sharp(qr).metadata()).width ?? 0;
  const detailChars = Math.floor(TEXT_WIDTH / (l.details * 0.6)) * l.detailLines;

  const layers: OverlayOptions[] = [{ input: art, left: l.art.x, top: l.art.y }];
  let y = l.top;
  const stack = (drawn: Drawn | null) => {
    if (!drawn) return;
    layers.push({ input: drawn.input, left: TEXT_LEFT, top: y });
    y += drawn.height;
  };
  const { cjk } = fields;
  stack(await drawFixed("Send your track to", FONTS.mono, l.kicker, MUTE));
  stack((await drawFitted(shortenGraphemes(fields.name, 40), FONTS.serif, l.name, BONE, TEXT_WIDTH, cjk)) ?? (await drawFitted(fields.handle, FONTS.serif, l.name, BONE, TEXT_WIDTH)));
  if (fields.callout) stack(await drawFitted(shortenGraphemes(fields.callout, 60), FONTS.monoMedium, l.callout, BONE, TEXT_WIDTH, cjk));
  if (fields.details) stack(await drawText(shortenGraphemes(fields.details, detailChars), FONTS.mono, l.details, MUTE, { width: TEXT_WIDTH, maxLines: l.detailLines, cjk }));

  const qrTop = y + l.gap;
  const footerWidth = TEXT_WIDTH - qrSize - 24;
  const link = await drawFitted(fields.link, FONTS.monoMedium, l.callout, BONE, footerWidth);
  if (!link) throw new Error("the card's link can't be drawn");
  const linkTop = qrTop + qrSize - link.height;
  layers.push({ input: qr, left: TEXT_LEFT + TEXT_WIDTH - qrSize, top: qrTop }, { input: link.input, left: TEXT_LEFT, top: linkTop });
  const closes = fields.closes ? await drawText(fields.closes, FONTS.mono, l.details, MUTE) : null;
  if (closes) {
    layers.push({ input: closes.input, left: TEXT_LEFT, top: linkTop - closes.height });
  }
  // Nothing from the photo's file (location, camera) carries over: sharp drops metadata unless asked to keep it.
  return sharp({ create: { width: l.width, height: l.height, channels: 4, background: INK } }).composite(layers).flatten({ background: INK }).png().toBuffer();
}
