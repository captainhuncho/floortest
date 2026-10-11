import "server-only";
import { readLinks, type ProfileLink } from "@/lib/socials";
import { folderLimit, trackArtEnabled } from "@/lib/plan-store";
import type { User } from "@/lib/db";
import { briefItems } from "@/lib/brief";
import { activeCollection, capacity, isClosed, isPaused, userByHandle } from "@/lib/desk";
import { genresFor } from "@/lib/plans";
import { teamSize } from "@/lib/team";

export type ReceiverLookup =
  | { found: false; reason: string }
  | { found: true; handle: string; name: string; roleLine: string; verified: boolean; accepting: boolean; reason: string | null; genres: string[]; note: string;
      collection: string | null; brief: { k: string; v: string }[]; folderBytes: number; trackArt: boolean; photo: string | null; links: ProfileLink[] };

/** Who is floortest.../<handle>, as seen by the signed-in user `u`? The Send page (as you type) and the app use this. */
export async function receiverLookup(u: Pick<User, "handle">, raw: string): Promise<ReceiverLookup> {
  const handle = String(raw || "").trim().toLowerCase().replace(/^.*\//, "").replace(/[^a-z0-9-_]/g, "").slice(0, 30);
  if (!handle) return { found: false, reason: "" };
  if (handle === u.handle) return { found: false, reason: "That's your own link." };
  const r = await userByHandle(handle);
  if (!r) return { found: false, reason: "No one has that link." };
  const c = await activeCollection(r);
  const reason = isPaused(r) ? `${r.name} has paused submissions.` : !c ? `${r.name} isn't taking music right now.` : isClosed(c) ? (c?.full_at ? `${c.name} is full.` : `${c.name} has closed.`) : (await capacity(r)).full ? `${r.name}'s desk is full right now.` : null;
  // The same brief the receiver's own link shows, so sending from the desk feels like being on their page.
  const g = genresFor(c);
  const team = await teamSize(r.id);
  const brief = [
    ...(c ? briefItems(c, g.custom ? g.list : [], r.tz).map((b) => ({ k: b.label, v: b.text })) : []),
    ...(team > 0 ? [{ k: "Team", v: `Heard by ${r.name}'s team` }] : []),
  ];
  return {
    found: true, handle: r.handle, name: r.name, roleLine: r.role_line, verified: r.identity_status === "verified",
    accepting: !reason, reason, genres: g.list, note: isPaused(r) ? r.pause_message : "", collection: c?.name ?? null, brief,
    folderBytes: await folderLimit(r.plan),
    trackArt: await trackArtEnabled(r.plan),
    photo: r.cover_key ? `/api/cover/${r.handle}?v=${encodeURIComponent(r.cover_key)}` : null,
    links: readLinks(r.links),
  };
}
