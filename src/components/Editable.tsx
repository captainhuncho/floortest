import { SiteEditor } from "./SiteEditor";

/**
 * On-page editing helpers for a public page's Site content (see SiteEditor). `E` prints a field as typeable text when
 * editing, plain text otherwise. `panel(field, hint)` marks an element whose field is edited in a box instead: lists,
 * and wording with fill-ins like {receiver} that the page shows already filled in.
 */
export function editable<T extends Record<string, string>>(c: T, editing: boolean) {
  const E = ({ k }: { k: keyof T & string }) => (editing ? <span data-edit={k}>{c[k]}</span> : <>{c[k]}</>);
  const panel = (k: keyof T & string, hint?: string) => (editing ? { "data-edit-panel": k, ...(hint ? { "data-edit-hint": hint } : {}) } : {});
  return { E, panel };
}

/** Wraps a page in the on-page editor when an ops editor is previewing it; otherwise renders the page as is. */
export function EditablePage({ editing, page, label, values, children }: { editing: boolean; page: string; label: string; values: Record<string, string>; children: React.ReactNode }) {
  return editing ? (
    <SiteEditor page={page} label={label} values={values}>
      {children}
    </SiteEditor>
  ) : (
    <>{children}</>
  );
}
