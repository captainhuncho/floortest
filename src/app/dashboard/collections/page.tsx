import { trackUse } from "@/lib/usage";
import { canCapCallouts } from "@/lib/desk";
import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { collectionsFor, isClosed } from "@/lib/desk";
import { fmtDay, fmtShortDay } from "@/lib/format";
import { genresFor } from "@/lib/plans";
import { briefItems } from "@/lib/brief";
import { APP_URL } from "@/lib/mail";
import { CollectionRow, NewCollection } from "./CollectionForms";
import { sharedLinksFor } from "@/lib/share-links";
import { q } from "@/lib/db";
import { SwitchCollection } from "../floor/SwitchCollection";
import { PageTitle } from "@/components/PageTitle";

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
  // The crate list: the receiving collection first, then open callouts (newest first), then closed ones (newest first).
  const rank = (c: (typeof collections)[number]) => (c.id === user.active_collection_id ? 0 : isClosed(c) ? 2 : 1);
  const ordered = [...collections].sort((a, b) => rank(a) - rank(b) || b.created_at - a.created_at);

  return (
    <div className="page-gutter py-4 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle>Collections</PageTitle>
        <NewCollection />
      </div>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-mute sm:text-sm">
        One per callout. Your link sends new tracks to whichever collection is receiving. Reviewing happens in{" "}
        <Link href="/dashboard/review" className="text-bone underline underline-offset-4">
          the Queue
        </Link>
        .
      </p>

      {/* The link strip: one readout line, link → collection → state. Danger edge only when nobody can send. */}
      <section
        aria-label="Where your link sends tracks"
        className={`mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-3 sm:px-4 ${stuck ? "border-danger/50 bg-ink-2" : "border-line"}`}
      >
        <span className="flex min-w-0 items-center gap-2 text-xs tnum">
          <span className="break-all font-bold text-bone">
            {host}/{user.handle}
          </span>
          <span aria-hidden className="text-faint">
            →
          </span>
          <span className="font-bold text-bone">{active?.name ?? "Nowhere"}</span>
        </span>
        <span className={`min-w-0 flex-1 basis-60 text-xs ${stuck ? "text-bone" : "text-mute"}`}>
          {status}{" "}
          {!stuck && active?.closes_at && canManage && (
            <Link href="/dashboard/settings/receiving" className="tap-text text-bone underline underline-offset-4">
              Change
            </Link>
          )}
        </span>
        {stuck && canManage && (openOthers[0] ? <SwitchCollection id={openOthers[0].id} name={openOthers[0].name} /> : <NewCollection />)}
      </section>

      <ul aria-label="Your collections" className="mt-4 divide-y divide-line border-y border-line">
        {ordered.map((c) => {
          const genres = genresFor(c).custom ? genresFor(c).list : [];
          return (
            <CollectionRow
              key={c.id}
              c={{ id: c.id, name: c.name, closesAt: c.closes_at, closesLabel: c.closes_at ? fmtShortDay(c.closes_at) : null, count: c.count, needsReview: c.needs_review, kept: c.kept, briefWanted: c.brief_wanted, bpmMin: c.bpm_min, bpmMax: c.bpm_max, briefNote: c.brief_note, allowSharing: !!c.allow_sharing, sharingAvailable: sharing, genres, brief: briefItems(c, genres, user.tz), maxTracks: c.max_tracks, full: !!c.full_at, art: c.art_key ? `/api/collection-art/${c.id}?v=${encodeURIComponent(c.art_key)}` : null, canCap: canCapCallouts(user.plan) }}
              receiving={c.id === user.active_collection_id}
              closed={isClosed(c)}
              canManage={canManage}
            />
          );
        })}
      </ul>

      {viaLinks.length > 0 && (
        <section aria-labelledby="links-shared-h" className="mt-10">
          <h2 id="links-shared-h" className="eyebrow">
            Shared with you to listen
          </h2>
          <p className="mt-1.5 text-xs text-mute">Private collections other people opened to you. Your access is personal: please don&apos;t share the music.</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {viaLinks.map((l) => (
              <li key={l.id}>
                <Link href={l.href} className="flex min-h-16 flex-col justify-center gap-1 px-3 py-2.5 transition-colors duration-150 hover:bg-ink-2 sm:min-h-14">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-body font-bold text-bone">{l.collection_name}</span>
                    <span className="shrink-0 truncate text-xs text-mute">from {l.owner_name}</span>
                  </span>
                  <span className="truncate text-xs text-faint tnum">
                    {l.count} {l.count === 1 ? "track" : "tracks"} · {l.permission === "download" ? "Listen + Download" : "Listen"}
                    {l.expires_at ? ` · until ${fmtDay(l.expires_at)}` : ""}
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
