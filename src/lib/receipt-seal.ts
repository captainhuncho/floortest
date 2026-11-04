import crypto from "node:crypto";

/**
 * How a receipt token is sealed (AES-256-GCM, key from the app secret under its own label, the track id bound in), kept
 * apart from src/lib/receipt-token.ts so scripts outside the server (the seed) seal test tracks the same way the site
 * does. The app passes APP_SECRET; nothing here reads settings.
 */
const keyFrom = (secret: string) => crypto.createHash("sha256").update(`floortest-receipt:${secret}`).digest();

export function sealWith(token: string, trackId: number, secret: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  c.setAAD(Buffer.from(String(trackId)));
  const body = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function openWith(sealed: string, trackId: number, secret: string): string | null {
  try {
    const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", keyFrom(secret), iv);
    d.setAAD(Buffer.from(String(trackId)));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
