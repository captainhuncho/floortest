import { loadRows } from "@/app/dashboard/rows";
import { currentSessionHash, currentUser } from "@/lib/auth";
import { offlineToken, OFFLINE_MAX_DAYS } from "@/lib/offline";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * What the phone should keep for offline play: every kept track still in Prepare, each with a one-hour download link
 * tied to this desk, this person and this sign-in (see src/lib/offline.ts).
 * Tracks missing from this list are removed from the phone at the same sync.
 */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (!(await allow("offline_list", String(u.id), 120, 3_600_000))) return Response.json({ error: "Too many syncs. Try again shortly." }, { status: 429 });
  // The links are tied to this sign-in: signing out or ending it on the Security page stops them.
  const session = await currentSessionHash();
  if (!session) return Response.json({ error: "Sign in again." }, { status: 401 });
  const origin = new URL(req.url).origin;
  const rows = await loadRows(u.id, { inSet: true, actor: u.actor_id });
  return Response.json(
    {
      owner: u.id,
      maxDays: OFFLINE_MAX_DAYS,
      tracks: rows.map((r) => ({ id: r.id, title: r.title, artist: r.artist, duration: r.duration, url: `${origin}/api/offline/file/${offlineToken(r.id, u.id, u.actor_id, session)}` })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
