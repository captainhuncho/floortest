import { Icon } from "@/components/Kit";

/**
 * Nothing in Projects yet (option 63 A): what it's for in one sentence. Since option 66 (20 Nov) the tab's one + Add
 * (Import, Project, Folder) is the way in, so this names it instead of drawing buttons of its own.
 */
export function ProjectsEmpty({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 py-8 text-center">
      <span aria-hidden className="grid size-12 place-items-center rounded-[14px] border border-line bg-well text-mute">
        <Icon name="music" className="size-5" />
      </span>
      <p className="text-[14px] leading-relaxed text-mute">Your own tracks live here: edits, stems, unreleased. They stay until you delete them and never reach the Review Queue.</p>
      {canEdit && <p className="text-[13px] text-mute">Use + Add to import tracks or make a project.</p>}
    </div>
  );
}
