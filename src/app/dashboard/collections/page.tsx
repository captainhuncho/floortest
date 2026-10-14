import { trackUse } from "@/lib/usage";
import { canCapCallouts } from "@/lib/desk";
import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { collectionsFor, isClosed } from "@/lib/desk";
import { fmtDay } from "@/lib/format";
import { genresFor } from "@/lib/plans";
import { briefItems } from "@/lib/brief";
import { APP_URL } from "@/lib/mail";
import { CollectionTile, NewCollection } from "./CollectionForms";
import { sharedLinksFor } from "@/lib/share-links";
import { q } from "@/lib/db";
import { SwitchCollection } from "../floor/SwitchCollection";

export const metadata = { title: "Collections — FloorTest" };

export default async function Collections() {
  const user = await requireUser();
  await trackUse(user.id, "collections");
  const collections = await collectionsFor(user.id);
  const sharing = await switchOn("sharing");
  const viaLinks = await sharedLinksFor(user);
  const reroute = !!(await q.get<{ v: number }>("SELECT reroute_closed AS v FROM users WHERE id = ?", user.id))?.v;
  // Where the link sends tracks, said once at the top: the receiving collection, its state, and what happens when it closes.
  const active = collections.find((c) => c.id === user.active_collection_id);
  const openOthers = collections.filter((c) => c.id !== active?.id && !isClosed(c)).sort((a, b) => b.created_at - a.created_at);
  const canManage = user.role !== "member";
  const host = APP_URL.replace(/^https?:\/\//, "");
  const status = !active
    ? "Not sending tracks anywhere. Nobody can send you music right now."
    : active.full_at
      ? "Full: your link has stopped taking uploads."
      : isClosed(active)
        ? `Closed ${fmtDay(active.closes_at!)}. Nobody can send you music right now.`
        : active.closes_at
          ? `Open · closes ${fmtDay(active.closes_at)}. Then: ${reroute && openOthers[0] ? openOthers[0].name : "the link stops until you choose"}.`
          : "Open, no closing date.";
  const stuck = !active || isClosed(active);
  // Figma "03 Collections": a tile per callout, then a dashed tile to add one.
  return (
    <div className="max-w-5xl px-3 py-4 sm:px-8 sm:py-6">
      <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone">Collections</h1>
      <p className="mt-3.5 text-[11px] leading-[1.5] text-mute sm:text-sm">
        One per callout. Your link <span className="break-all text-lime">{APP_URL.replace(/^https?:\/\//, "")}/{user.handle}</span> sends new tracks to
        whichever collection is marked receiving. Reviewing happens in{" "}
        <Link href="/dashboard/review" className="text-bone underline underline-offset-4">
          the Queue
        </Link>
        .
      </p>
      <section aria-label="Where your link sends tracks" className={`mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border bg-ink-2 px-4 py-3.5 sm:px-5 ${stuck ? "border-danger/50" : "border-line-2"}`}>
        <span className="break-all text-[13px] font-bold text-bone">{host}/{user.handle}</span>
        <span aria-hidden className="text-mute">→</span>
        <span className="rounded-full border border-line-2 bg-ink-4 px-3 py-1 text-[13px] font-bold text-bone">{active?.name ?? "Nowhere"}</span>
        <span className={`min-w-0 flex-1 basis-60 text-[12px] ${stuck ? "text-bone" : "text-mute"}`}>
          {status}{" "}
          {!stuck && active?.closes_at && canManage && (
            <Link href="/dashboard/settings/receiving" className="text-bone underline underline-offset-4">
              Change
            </Link>
          )}
        </span>
        {stuck && canManage && (openOthers[0] ? <SwitchCollection id={openOthers[0].id} name={openOthers[0].name} /> : <NewCollection />)}
      </section>
      <ul className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {collections.map((c) => (
          <li key={c.id} className="contents">
            <CollectionTile
              c={{ id: c.id, name: c.name, closesAt: c.closes_at, closesLabel: c.closes_at ? fmtDay(c.closes_at) : null, count: c.count, needsReview: c.needs_review, kept: c.kept, briefWanted: c.brief_wanted, bpmMin: c.bpm_min, bpmMax: c.bpm_max, briefNote: c.brief_note, allowSharing: !!c.allow_sharing, sharingAvailable: sharing, genres: genresFor(c).custom ? genresFor(c).list : [], brief: briefItems(c, genresFor(c).custom ? genresFor(c).list : [], user.tz), maxTracks: c.max_tracks, full: !!c.full_at, art: c.art_key ? `/api/collection-art/${c.id}?v=${encodeURIComponent(c.art_key)}` : null, canCap: canCapCallouts(user.plan) }}
              receiving={c.id === user.active_collection_id}
              closed={isClosed(c)}
              canManage={user.role !== "member"}
            />
          </li>
        ))}
        <li className="contents">
          <NewCollection tile />
        </li>
      </ul>
      {viaLinks.length > 0 && (
        <section aria-labelledby="links-shared-h" className="mt-8">
          <h2 id="links-shared-h" className="text-[15px] font-bold text-bone">
            Shared with you to listen
          </h2>
          <p className="mt-1 text-[11px] text-mute sm:text-sm">Private collections other people opened to you. Your access is personal: please don&apos;t share the music.</p>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {viaLinks.map((l) => (
              <li key={l.id}>
                <Link href={l.href} className="flex h-full flex-col gap-1 card p-3.5 text-bone hover:border-faint">
                  <span className="truncate text-[14px] font-bold">{l.collection_name}</span>
                  <span className="truncate text-[11px] text-mute">from {l.owner_name}</span>
                  <span className="mt-auto pt-2 text-[11px] font-bold tnum">
                    {l.count} {l.count === 1 ? "track" : "tracks"}{" "}
                    <span className="font-normal text-faint">
                      · {l.permission === "download" ? "Listen + Download" : "Listen"}
                      {l.expires_at ? ` · until ${fmtDay(l.expires_at)}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
