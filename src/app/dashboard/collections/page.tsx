import { trackUse } from "@/lib/usage";
import { canRunCallouts } from "@/lib/account-members";
import { canCapCallouts } from "@/lib/desk";
import { listDeskFolders } from "@/lib/desk-folders";
import { recordId } from "@/lib/ids";
import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { requireUser, viewingAs } from "@/lib/auth";
import { calloutBlock, capacity, collectionsFor, isClosed } from "@/lib/desk";
import { fmtDay } from "@/lib/format";
import { genresFor } from "@/lib/plans";
import { briefItems } from "@/lib/brief";
import { APP_URL } from "@/lib/mail";
import { CollectionTile } from "./CollectionForms";
import { FolderArea, FolderCrumb, FolderTile } from "./Folders";
import { shareCardTarget } from "./callout-card";
import { sharedLinksFor } from "@/lib/share-links";
import { CARD, PageHead, SectionHead } from "@/components/Kit";
import { Notice } from "../settings/ui";
import { CollectionsTabs } from "./CollectionsTabs";

export const metadata = { title: "Collections — FloorTest" };

/**
 * A card per callout (owner, 30 Oct: the redesign mock): where it stands, its numbers and the next step; a dashed tile to
 * add one (or the beta limit); then collections shared with you. Tracks show only inside a callout (owner, 16 Nov:
 * "have people click into the folder to view the tracks"): each card is the folder, and the whole card opens it.
 */
export default async function Collections({ searchParams }: { searchParams: Promise<{ folder?: string; denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  await trackUse(user.id, "collections");
  const collections = await collectionsFor(user.id);
  const sharing = await switchOn("sharing");
  const viaLinks = await sharedLinksFor(user);
  const canManage = user.role !== "member";
  // New collection and Edit: owner, A&R / Admin, or a Member an admin ticked (owner, 16 Nov).
  const callouts = await canRunCallouts(user);
  const folders = await listDeskFolders(user, "callout");
  // Inside a folder (?folder=), only its callouts; at the top, the folders and then the callouts in none.
  const folderId = recordId((await searchParams).folder);
  const folder = folderId === null ? null : (folders.find((f) => f.id === folderId) ?? null);
  const inFolder = (c: (typeof collections)[number]) => (c as { desk_folder_id?: number | null }).desk_folder_id ?? null;
  // The receiving collection first, then open callouts (newest first), then closed ones (newest first).
  const rank = (c: (typeof collections)[number]) => (c.id === user.active_collection_id ? 0 : isClosed(c) ? 2 : 1);
  const ordered = [...collections].filter((c) => inFolder(c) === (folder?.id ?? null)).sort((a, b) => rank(a) - rank(b) || b.created_at - a.created_at);
  const receiving = collections.find((c) => c.id === user.active_collection_id && !isClosed(c));
  const card = receiving
    ? shareCardTarget({ isOwner: user.role === "owner", viewingAs: !!(await viewingAs()), active: receiving, blocked: !!calloutBlock(user, receiving, (await capacity(user)).full) })
    : undefined;
  const host = APP_URL.replace(/^https?:\/\//, "");
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 sm:gap-5">
        <div className="flex flex-col gap-1.5">
          <PageHead label="One per callout" title="Collections" center />
          <CollectionsTabs on="callouts" />
          {denied === "callouts" && (
            <Notice tone="error" next="Ask the owner or an A&R / Admin to tick Runs callouts for you in Settings → Team.">
              Making and editing callouts is for people the owner or an A&amp;R / Admin has let run them.
            </Notice>
          )}
          <p className="mx-auto w-full max-w-2xl text-center text-[12px] leading-snug text-mute">
            Your link <span className="break-all font-mono text-bone">{host}/{user.handle}</span>{" "}
            {user.active_collection_id ? "sends new tracks to the one that's receiving." : "sends tracks straight to your Review Queue until you make one."}
          </p>
        </div>
        {/* "+ New" and right-click: New callout, New folder (owner, 16 Nov). Folders first, then callouts in none; one column on phones, two from sm, three from xl. */}
        <FolderArea kind="callout" folder={folder?.id ?? null} canEdit={canManage}>
          {folder && <FolderCrumb kind="callout" name={folder.name} />}
          <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={folder ? folder.name : "Callouts"}>
            {!folder &&
              folders.map((f) => (
                <li key={`f${f.id}`} className="contents">
                  <FolderTile kind="callout" f={f} canEdit={canManage} />
                </li>
              ))}
            {ordered.map((c) => {
              const genres = genresFor(c).custom ? genresFor(c).list : [];
              return (
                <li key={c.id} className="contents">
                  <CollectionTile
                    c={{ id: c.id, name: c.name, closesAt: c.closes_at, closesLabel: c.closes_at ? fmtDay(c.closes_at) : null, count: c.count, needsReview: c.needs_review, kept: c.kept, briefWanted: c.brief_wanted, bpmMin: c.bpm_min, bpmMax: c.bpm_max, briefNote: c.brief_note, allowSharing: !!c.allow_sharing, sharingAvailable: sharing, genres, brief: briefItems(c, genres, user.tz), maxTracks: c.max_tracks, full: !!c.full_at, art: c.art_key ? `/api/collection-art/${c.id}?v=${encodeURIComponent(c.art_key)}` : null, canCap: canCapCallouts(user.plan) }}
                    receiving={c.id === user.active_collection_id}
                    closed={isClosed(c)}
                    canManage={canManage}
                    canEdit={callouts}
                    link={`${APP_URL}/${user.handle}`}
                    card={c.id === receiving?.id ? card : undefined}
                    folders={folders.map((f) => ({ id: f.id, name: f.name }))}
                    folderId={inFolder(c)}
                  />
                </li>
              );
            })}
          </ul>
          {folder && ordered.length === 0 && <p className="text-[12px] text-mute">Nothing in this folder yet. Move a callout here from its ··· menu.</p>}
        </FolderArea>
        {viaLinks.length > 0 && (
          <section aria-labelledby="links-shared-h" className="flex flex-col gap-3">
            <div>
              <SectionHead id="links-shared-h" icon="head" title="Shared with you to listen" />
              <p className="mt-1.5 text-[12px] text-mute">Private collections other people opened to you. Your access is personal: please don&apos;t share the music.</p>
            </div>
            <ul className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {viaLinks.map((l) => (
                <li key={l.id}>
                  <Link href={l.href} className={`flex h-full min-h-11 flex-col gap-1 ${CARD} p-3 text-bone transition-colors hover:border-line-2`}>
                    <span className="truncate text-[13px] font-semibold">{l.collection_name}</span>
                    <span className="truncate text-[11.5px] text-mute">from {l.owner_name}</span>
                    <span className="mt-auto pt-2 text-[11.5px] font-semibold tnum">
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
    </div>
  );
}
