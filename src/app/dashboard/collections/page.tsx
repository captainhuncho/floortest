import { trackUse } from "@/lib/usage";
import { canRunCallouts } from "@/lib/account-members";
import { canCapCallouts } from "@/lib/desk";
import { listDeskFolders } from "@/lib/desk-folders";
import { calloutCovers, collectionArtUrl } from "@/lib/covers";
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
import { FolderList } from "./FolderList";
import { ProjectsTab } from "../projects/ProjectsTab";
import { AddMenu } from "./AddMenu";
import { addItems, tabFrom } from "./add-items";
import { shareCardTarget } from "./callout-card";
import { sharedLinksFor } from "@/lib/share-links";
import { CARD, SectionHead } from "@/components/Kit";
import { CollectionsBar } from "./CollectionsTabs";
import { Notice } from "../settings/ui";

export const metadata = { title: "Collections — FloorTest" };

/**
 * Collections (owner, 17 Nov: option 43, "collection and projects can just be folders"; two tabs since option 66,
 * 20 Nov). Callouts: the callout folders you made first, then every callout with a cover, its name and one line; tracks
 * show only inside it. Projects (?tab=projects, ProjectsTab): your own tracks. Each tab has one + Add. Then collections
 * shared with you.
 */
export default async function Collections({ searchParams }: { searchParams: Promise<{ tab?: string; folder?: string; kind?: string; denied?: string }> }) {
  const user = await requireUser();
  await trackUse(user.id, "collections");
  const params = await searchParams;
  if (tabFrom(params) === "projects") return <ProjectsTab folderParam={params.folder} />;
  const canManage = user.role !== "member";
  // Making and editing callouts: owner, A&R / Admin, or a Member an admin ticked (owner, 16 Nov). The actions check too.
  const callouts = await canRunCallouts(user);
  const [collections, sharing, viaLinks, folders, covers] = await Promise.all([collectionsFor(user.id), switchOn("sharing"), sharedLinksFor(user), listDeskFolders(user, "callout"), calloutCovers(user)]);
  // Inside a folder (?folder=), only its callouts; at the top, the folders and then what is in none.
  const folderId = recordId(params.folder);
  const folder = folderId === null ? null : (folders.find((f) => f.id === folderId) ?? null);
  const inFolder = (c: (typeof collections)[number]) => (c as { desk_folder_id?: number | null }).desk_folder_id ?? null;
  const receiving = collections.find((c) => c.id === user.active_collection_id && !isClosed(c));
  const card = receiving
    ? shareCardTarget({ isOwner: user.role === "owner", viewingAs: !!(await viewingAs()), active: receiving, blocked: !!calloutBlock(user, receiving, (await capacity(user)).full) })
    : undefined;
  const host = APP_URL.replace(/^https?:\/\//, "");
  const calloutFolders = folders.map((f) => ({ id: f.id, name: f.name }));
  // The receiving callout first, then open callouts (newest first), then closed callouts (newest first).
  const entries = [
    ...collections
      .filter((c) => inFolder(c) === (folder?.id ?? null))
      .map((c) => {
        const genres = genresFor(c).custom ? genresFor(c).list : [];
        return {
          key: `c${c.id}`,
          name: c.name,
          rank: c.id === user.active_collection_id ? 0 : isClosed(c) ? 2 : 1,
          at: c.created_at,
          node: (
            <CollectionTile
              c={{ id: c.id, name: c.name, closesAt: c.closes_at, closesLabel: c.closes_at ? fmtDay(c.closes_at) : null, count: c.count, needsReview: c.needs_review, kept: c.kept, briefWanted: c.brief_wanted, bpmMin: c.bpm_min, bpmMax: c.bpm_max, briefNote: c.brief_note, allowSharing: !!c.allow_sharing, sharingAvailable: sharing, genres, brief: briefItems(c, genres, user.tz), maxTracks: c.max_tracks, full: !!c.full_at, art: c.art_key ? collectionArtUrl(c.id, c.art_key) : null, covers: covers.get(c.id) ?? [], canCap: canCapCallouts(user.plan) }}
              receiving={c.id === user.active_collection_id}
              closed={isClosed(c)}
              canManage={canManage}
              canEdit={callouts}
              link={`${APP_URL}/${user.handle}`}
              card={c.id === receiving?.id ? card : undefined}
              folders={calloutFolders}
              folderId={inFolder(c)}
            />
          ),
        };
      }),
  ].sort((a, b) => a.rank - b.rank || b.at - a.at);
  const canAdd = addItems({ tab: "callouts", inFolder: !!folder, canEdit: canManage, canCreate: callouts }).length > 0;
  const items = [
    ...(folder ? [] : folders.map((f) => ({ key: `cf${f.id}`, name: f.name, node: <FolderTile kind="callout" f={f} canEdit={canManage} /> }))),
    ...entries.map(({ key, name, node }) => ({ key, name, node })),
  ];
  return (
    <div className="page-gutter pb-20 pt-4 sm:pt-7 md:pb-7">
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 sm:gap-6">
        {params.denied === "callouts" && (
          <Notice tone="error" next="Ask the owner or an A&R / Admin to tick Runs callouts for you in Settings → Team.">
            Making and editing callouts is for people the owner or an A&amp;R / Admin has let run them.
          </Notice>
        )}
        {/* Right-click on the page: the + Add menu; on a callout or folder: its ··· menu (FolderArea). */}
        <FolderArea canAdd={canAdd}>
          <CollectionsBar on="callouts" add={canAdd ? <AddMenu tab="callouts" folder={folder?.id ?? null} canEdit={canManage} canCreate={callouts} /> : null} />
          {folder && <FolderCrumb kind="callout" name={folder.name} />}
          <FolderList
            items={items}
            label={folder ? folder.name : "Callouts"}
            empty={folder ? (canAdd ? "Nothing in this folder yet. Make a callout with + Add, or move one here from its ··· menu." : "Nothing in this folder yet. Move a callout here from its ··· menu.") : canAdd ? "No callouts yet. Use + Add to make one." : "No callouts yet."}
          />
          <p className="text-[12px] leading-snug text-mute">
            Your link <span className="break-all font-mono text-bone">{host}/{user.handle}</span>{" "}
            {user.active_collection_id ? "sends new tracks to the callout that's receiving." : "sends tracks straight to your Review Queue until you make a callout."}
          </p>
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
