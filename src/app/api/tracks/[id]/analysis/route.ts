import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { ownedTrack } from "@/lib/core";
import { q } from "@/lib/db";

export const runtime = "nodejs";

/** Backfills waveform/BPM for tracks whose sender's browser couldn't analyse the audio. Only fills empty fields. */
export async function POST(req: Request, ctx: RouteContext<"/api/tracks/[id]/analysis">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const t = await ownedTrack(user.id, Number((await ctx.params).id));
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { peaks?: unknown; duration?: unknown; bpm?: unknown };
  const peaks =
    Array.isArray(body.peaks) && body.peaks.length <= 400 && body.peaks.every((v) => typeof v === "number" && Number.isFinite(v))
      ? JSON.stringify(body.peaks.map((v: number) => Math.min(1, Math.max(0, v))))
      : null;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && v > lo && v < hi ? v : null);
  await q.run(
    "UPDATE tracks SET peaks = COALESCE(peaks, ?), duration = COALESCE(duration, ?), bpm = COALESCE(bpm, ?) WHERE id = ?",
    peaks,
    num(body.duration, 0, 10800),
    num(body.bpm, 40, 250),
    t.id,
  );
  return NextResponse.json({ ok: true });
}
