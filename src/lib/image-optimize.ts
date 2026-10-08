import "server-only";
import sharp from "sharp";

/**
 * Every uploaded image is re-encoded before it's stored: turned upright (phone EXIF), shrunk to fit `maxSide`
 * (never enlarged), saved as WebP, and stripped of metadata (including any GPS location). An 8 MB phone photo
 * typically becomes 100–300 KB, so public pages load fast.
 */
export async function optimizeImage(input: Uint8Array, maxSide: number) {
  const bytes = await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
  return new Uint8Array(bytes);
}
