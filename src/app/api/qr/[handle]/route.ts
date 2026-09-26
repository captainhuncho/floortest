import QRCode from "qrcode";
import { userByHandle } from "@/lib/core";
import { APP_URL } from "@/lib/mail";

export const runtime = "nodejs";

/**
 * QR code for a receiver's public link. Dark modules on white with a quiet zone: the
 * combination every phone camera reads reliably, including in a dark club.
 * ?format=svg (default) | png   &download=1 to save as a file.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/qr/[handle]">) {
  const u = await userByHandle((await ctx.params).handle);
  if (!u) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const png = url.searchParams.get("format") === "png";
  const target = `${APP_URL}/${u.handle}`;
  const opts = { errorCorrectionLevel: "M" as const, margin: 4, color: { dark: "#10110f", light: "#ffffff" } };
  const disposition = url.searchParams.get("download") ? `attachment; filename="floortest-${u.handle}-qr.${png ? "png" : "svg"}"` : "inline";

  if (png) {
    const buf = await QRCode.toBuffer(target, { ...opts, type: "png", width: 1200 });
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "image/png", "Content-Disposition": disposition, "Cache-Control": "public, max-age=3600" } });
  }
  const svg = await QRCode.toString(target, { ...opts, type: "svg" });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Content-Disposition": disposition, "Cache-Control": "public, max-age=3600" } });
}
