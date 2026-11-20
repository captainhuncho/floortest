"use client";

import { Icon } from "@/components/Kit";
import { CollectionsTabs } from "../collections/CollectionsTabs";
import { GHOST_TALL, LIME } from "../kitButtons";

/**
 * Projects' tools (owner, 19 Nov: option 63 A). Both buttons ask the page's own pieces by event, so there is one New
 * folder sheet (FolderArea) and one file picker (OwnerUpload, which needs the click inside the tap for iOS Safari).
 */
const newFolder = () => window.dispatchEvent(new Event("ft:new-folder"));
const addAudio = () => window.dispatchEvent(new Event("ft:add-audio"));

function NewFolderButton({ className }: { className: string }) {
  return (
    <button type="button" className={className} aria-haspopup="dialog" onClick={newFolder}>
      <Icon name="folder" className="size-4" />
      New folder
    </button>
  );
}

/**
 * Under the Collections heading: the Callouts / Projects filter, the room line ("12 of 500 tracks in Projects") on its
 * own row, then New folder and Upload audio for the owner and A&R / Admins. From md, all three on one row.
 */
export function ProjectsBar({ used, limit, canEdit }: { used: number; limit: number; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
      <div className="md:w-[260px] md:shrink-0">
        <CollectionsTabs on="projects" />
      </div>
      <p className="text-[13px] text-mute tnum md:min-w-0 md:flex-1 md:truncate">
        {used} of {limit} tracks in Projects
      </p>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <NewFolderButton className={GHOST_TALL} />
          <button type="button" className={GHOST_TALL} onClick={addAudio}>
            <Icon name="up" className="size-4" />
            Upload audio
          </button>
        </div>
      )}
    </div>
  );
}

/** Nothing in Projects yet: what it's for in one sentence; the owner and A&R / Admins also get Upload audio (lime) and New folder. */
export function ProjectsEmpty({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 py-8 text-center">
      {canEdit && (
        <span aria-hidden className="grid size-12 place-items-center rounded-[14px] border border-line bg-well text-mute">
          <Icon name="music" className="size-5" />
        </span>
      )}
      <p className="text-[14px] leading-relaxed text-mute">Your own tracks live here: edits, stems, unreleased. They stay until you delete them and never reach the Review Queue.</p>
      {canEdit && (
        <div className="flex w-full flex-col gap-2">
          <button type="button" className={`${LIME} w-full gap-1.5`} onClick={addAudio}>
            <Icon name="up" className="size-4" />
            Upload audio
          </button>
          <NewFolderButton className={`${GHOST_TALL} w-full justify-center`} />
        </div>
      )}
    </div>
  );
}
