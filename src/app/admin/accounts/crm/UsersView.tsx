"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BULK_MAX } from "@/lib/admin-bulk";
import { useKitConfirm } from "../../kit/Confirm";
import type { EditOption } from "../../kit/InlineEdit";
import { useShortcuts } from "../../kit/Keys";
import { Segmented } from "../../kit/Segmented";
import { useSelection } from "../../kit/Selection";
import { useMedia } from "../../moderation/queue/useQueue";
import { Bulk } from "./Bulk";
import type { CrmRow } from "./data";
import { fieldsFor, StatusPill } from "./fields";
import { initials, type Editable, type Layout } from "./model";
import { RecordDrawer } from "./RecordDrawer";

const LAYOUTS = [
  { value: "table", label: "Table" },
  { value: "list", label: "List" },
] as const;

/**
 * The new Users (admin redesign B, step 5; switch `ops_shell`), in the browser: a table or a list (phones: the list),
 * edit in place, row selection with the bulk bar, and the record drawer. Keys: j/k move, x or Space picks, Shift+J/K
 * extends, e edits the current row's tags, Enter opens its record, ? lists them.
 */
export function UsersView({ rows, edit, plans, layout: initialLayout, toolbar }: { rows: CrmRow[]; edit: Editable; plans: EditOption[]; layout: Layout; toolbar: React.ReactNode }) {
  const [layout, setLayout] = useState<Layout>(initialLayout);
  const phone = useMedia("(max-width: 767px)", false);
  const listOn = phone || layout === "list";
  const ids = rows.map((r) => r.id);
  const sel = useSelection(ids, BULK_MAX);
  const [ask, confirmNode] = useKitConfirm();
  const [openId, setOpenId] = useState<number | null>(null);
  const table = useRef<HTMLTableElement>(null);
  const current = sel.current >= 0 ? rows[sel.current] : null;
  const opened = rows.find((r) => r.id === openId) ?? null;

  const router = useRouter();
  const [, startNav] = useTransition();
  const chooseLayout = (l: Layout) => {
    setLayout(l);
    // Kept in the address, so a reload, a shared link and the view tabs keep it; the switch itself is instant.
    const u = new URL(window.location.href);
    if (l === "list") u.searchParams.set("layout", "list");
    else u.searchParams.delete("layout");
    startNav(() => router.replace(`${u.pathname}${u.search}`, { scroll: false }));
  };
  const editRow = (u: CrmRow | null) => {
    if (!u) return;
    // In the table, the row's tags open for editing in place; in the list, its record opens with the same fields.
    const cell = !listOn && edit.tags ? table.current?.querySelector<HTMLButtonElement>(`[data-tags-for="${u.id}"] .kit-edit-cell`) : null;
    if (cell) cell.click();
    else setOpenId(u.id);
  };
  useShortcuts({
    e: { label: "Edit the current row (its tags)", run: () => editRow(current) },
    enter: { label: "Open the current row's record", run: () => current && setOpenId(current.id) },
  });

  const check = (i: number, u: CrmRow) =>
    edit.bulk && (
      <label {...sel.pressProps} className="ou-check">
        <input type="checkbox" {...sel.checkboxProps(i)} aria-label={`Select ${u.name}`} className="kit-check" />
      </label>
    );

  return (
    <div className="ou-view">
      <div className="ou-tools">
        {toolbar}
        <Segmented label="Layout" value={layout} options={LAYOUTS} onChange={chooseLayout} className="ou-layout" />
      </div>
      {!rows.length ? (
        <p className="ou-empty">No accounts match. Try another view or fewer filters.</p>
      ) : (
        <div className="kit-bulkwrap">
          {!listOn && (
            <div className="ou-tablewrap">
              <table ref={table} className="ou-table" aria-label="Accounts">
                <thead>
                  <tr>
                    {edit.bulk && (
                      <th className="ou-c-check">
                        <label className="ou-check">
                          <input
                            type="checkbox"
                            checked={sel.allSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = sel.count > 0 && !sel.allSelected;
                            }}
                            onChange={() => (sel.allSelected ? sel.clear() : sel.selectAll())}
                            aria-label="Select every account on this page"
                            className="kit-check"
                          />
                        </label>
                      </th>
                    )}
                    <th className="ou-c-name">Name</th>
                    <th className="ou-c-type">Type</th>
                    <th className="ou-c-plan">Plan</th>
                    <th className="ou-c-tags">Tags</th>
                    <th className="ou-c-status">Status</th>
                    <th className="ou-c-note">Latest note</th>
                    <th className="ou-c-tracks">Tracks</th>
                    <th className="ou-c-joined">Joined</th>
                    <th className="ou-c-acts">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u, i) => {
                    const f = fieldsFor({ u, edit, plans, ask });
                    return (
                      <tr key={u.id} {...sel.rowProps(i)} className="kit-row">
                        {edit.bulk && <td className="ou-c-check">{check(i, u)}</td>}
                        <td className="ou-c-name">
                          <div className="ou-who">
                            <span aria-hidden className="ou-avatar">
                              {initials(u.name)}
                            </span>
                            <span className="min-w-0">
                              <button type="button" className="ou-name" onClick={() => setOpenId(u.id)}>
                                {u.name}
                              </button>
                              <span className="ou-sub">
                                @{u.handle}
                                {u.email ? ` · ${u.email}` : ""}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="ou-c-type text-mute">{u.kind}</td>
                        <td className="ou-c-plan">{f.plan}</td>
                        <td className="ou-c-tags" data-tags-for={u.id}>
                          {f.tags}
                        </td>
                        <td className="ou-c-status">{f.status}</td>
                        <td className="ou-c-note">{f.note}</td>
                        <td className="ou-c-tracks tnum">{u.live.toLocaleString("en-GB")}</td>
                        <td className="ou-c-joined tnum text-mute">{u.joined}</td>
                        <td className="ou-c-acts">
                          <span className="ou-acts">
                            {edit.tags && (
                              <button type="button" className="ou-btn ou-btn--sm" onClick={() => editRow(u)} aria-label={`Edit ${u.name}`}>
                                Edit
                              </button>
                            )}
                            <button type="button" className="ou-icon-btn" onClick={() => setOpenId(u.id)} aria-label={`Open ${u.name}`}>
                              <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 6l6 6-6 6" />
                              </svg>
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {listOn && (
            <ul className="ou-list" aria-label="Accounts">
              {rows.map((u, i) => {
                const { ref, onFocus } = sel.rowProps(i);
                return (
                  <li key={u.id} className="kit-row ou-lrow" data-selected={sel.isSelected(u.id) || undefined} data-current={i === sel.current || undefined}>
                    {check(i, u)}
                    <button type="button" ref={ref} onFocus={onFocus} tabIndex={i === Math.max(0, sel.current) ? 0 : -1} className="ou-lopen" onClick={() => setOpenId(u.id)}>
                      <span aria-hidden className="ou-avatar">
                        {initials(u.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="ou-lname">{u.name}</span>
                        <span className="ou-sub">
                          @{u.handle} · {u.kind} · <span className="capitalize">{u.plan}</span>
                        </span>
                      </span>
                      <StatusPill status={u.status} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {edit.bulk && <Bulk rows={rows} sel={sel} ask={ask} csv={edit.csv} />}
        </div>
      )}
      <RecordDrawer u={opened} open={!!opened} onClose={() => setOpenId(null)} edit={edit} plans={plans} ask={ask} />
      {confirmNode}
    </div>
  );
}
