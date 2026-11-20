/**
 * The rules behind Collections' two tabs and their + Add menus (owner, 20 Nov: option 66). Plain functions, so the
 * pages and the tests share them.
 */
export type CollectionsTab = "callouts" | "projects";
export type AddKind = "callout" | "project" | "folder" | "import";
export type AddItem = { kind: AddKind; name: string; line: string; icon: "plus" | "folder" | "up" | "music" };

/** The tab a Collections address asks for: Projects only when it says so; anything else, old `?kind=callouts` links included, is Callouts. */
export function tabFrom(params: { tab?: string }): CollectionsTab {
  return params.tab === "projects" ? "projects" : "callouts";
}

/**
 * What each tab's + Add offers. Callouts: Callout, Folder. Projects: Import, Project, Folder. No Record. Inside a folder
 * there's no Folder (no folders in folders); what you make lands in that folder, so a callout there needs both making
 * (canCreate) and filing (canEdit). A ticked Member may make callouts (canCreate) but not projects or folders (canEdit:
 * owner and A&R / Admin).
 */
export function addItems({ tab, inFolder, canEdit, canCreate }: { tab: CollectionsTab; inFolder: boolean; canEdit: boolean; canCreate: boolean }): AddItem[] {
  const folder: AddItem = { kind: "folder", name: "Folder", line: tab === "callouts" ? "Groups callouts" : "Groups projects", icon: "folder" };
  if (tab === "callouts") {
    const callout: AddItem = { kind: "callout", name: "Callout", line: "A playlist people send tracks into", icon: "plus" };
    return [...(canCreate && (canEdit || !inFolder) ? [callout] : []), ...(canEdit && !inFolder ? [folder] : [])];
  }
  if (!canEdit) return [];
  return [
    { kind: "import", name: "Import", line: "Bring in tracks from your files", icon: "up" },
    { kind: "project", name: "Project", line: "A playlist of your own tracks", icon: "music" },
    ...(inFolder ? [] : [folder]),
  ];
}
