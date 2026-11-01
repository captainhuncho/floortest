"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { OpsResult } from "@/lib/ops-result";
import { addTags, DONE_HOLD_MS, sameValue, shownWhileSaving, type EditType } from "./core";

export type EditOption = { value: string; label: string };
export type InlineEditHandle = { edit: () => void };
type Value = string | string[];

/**
 * Edit in place (ops kit, from the prototype kit's inlineEdit). A cell shows its value as a button; a click or Enter
 * opens the editor: text (Enter saves), a select (picking saves) or tags (Enter or a comma adds a chip, × takes one
 * off, Enter on an empty field saves). Esc cancels, and leaving the field saves. The caret starts at the end, never
 * select-all. Tags are cleaned the server's way and never repeat (fix 3). A select keeps its old choice until the save
 * answers, since the save may ask first (fix 4); text and tags show the new value at once and go back if refused, with
 * the reason under the cell. ✓ shows in place; the toast says the result once.
 *
 * `save(next, previous)` is the screen's own call to a server action returning OpsResult (null backs out quietly).
 */
export function InlineEdit({
  type,
  value: given,
  label,
  options = [],
  placeholder = "Add",
  display,
  startEmpty = false,
  maxLength = 200,
  save,
  className = "",
  ref,
}: {
  type: EditType;
  value: Value;
  /** What the field is, for screen readers: "tags for Lena Park". */
  label: string;
  options?: EditOption[];
  /** Shown when there is no value yet, e.g. "Add tag". */
  placeholder?: string;
  /** How the value looks when not editing (pills); plain text when left out. */
  display?: (v: Value) => React.ReactNode;
  /** Opens with an empty field (a note: saving adds a new one rather than changing the last). */
  startEmpty?: boolean;
  maxLength?: number;
  save: (next: Value, previous: Value) => Promise<OpsResult | null>;
  className?: string;
  ref?: React.Ref<InlineEditHandle>;
}) {
  const [value, setValue] = useState<Value>(given);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(false);
  const [draft, setDraft] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const cell = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const keyed = useRef(false);
  // Whether the editor is open right now: a blur after Enter already saved must not save again.
  const open = useRef(false);
  const tickTimer = useRef(0);
  useEffect(() => () => clearTimeout(tickTimer.current), []);

  // The server's value wins once nothing is being saved (a refresh, or an Undo from the toast).
  const givenKey = [given].flat().join("\u0000");
  const [seen, setSeen] = useState(givenKey);
  if (seen !== givenKey && !saving) {
    setSeen(givenKey);
    setValue(given);
  }

  const begin = () => {
    if (editing || saving) return;
    setError(null);
    setDraft(type === "text" && !startEmpty ? String(value) : "");
    setChips(Array.isArray(value) ? [...value] : []);
    open.current = true;
    setEditing(true);
  };
  useImperativeHandle(ref, () => ({ edit: begin }));

  // Focus the field once it is there, with the caret at the end.
  useEffect(() => {
    if (!editing) return;
    const f = field.current;
    f?.focus();
    if (f instanceof HTMLInputElement) f.setSelectionRange(f.value.length, f.value.length);
  }, [editing]);

  const cancel = () => {
    open.current = false;
    setEditing(false);
    requestAnimationFrame(() => cell.current?.focus());
  };

  const commit = async (next: Value, refocus = true) => {
    if (!open.current) return;
    open.current = false;
    const previous = value;
    setEditing(false);
    if (sameValue(next, previous) || (type === "text" && startEmpty && !String(next).trim())) {
      if (refocus) requestAnimationFrame(() => cell.current?.focus());
      return;
    }
    setSaving(true);
    setValue(shownWhileSaving(type, previous, next));
    if (refocus) requestAnimationFrame(() => cell.current?.focus());
    let r: OpsResult | null;
    try {
      r = await save(next, previous);
    } catch {
      r = { ok: false, error: "That didn't go through. Check your connection" };
    }
    setSaving(false);
    if (!r || !r.ok) {
      setValue(previous);
      if (r) setError(`${r.error.replace(/\.$/, "")}. Old value kept.`);
      return;
    }
    setValue(next);
    setTick(true);
    clearTimeout(tickTimer.current);
    tickTimer.current = window.setTimeout(() => setTick(false), DONE_HOLD_MS);
  };

  // Leaving the editor saves it, unless focus only moved inside (a chip's ×).
  const onBlur = (e: React.FocusEvent) => {
    if (!open.current || box.current?.contains(e.relatedTarget as Node | null)) return;
    if (type === "tags") void commit(addTags(chips, draft), false);
    else void commit(type === "select" ? field.current?.value ?? String(value) : draft, false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  const empty = Array.isArray(value) ? !value.length : !String(value).trim();
  const shown = type === "select" ? options.find((o) => o.value === value)?.label ?? String(value) : value;
  const editor =
    type === "select" ? (
      <select
        ref={field}
        defaultValue={String(value)}
        aria-label={label}
        className="kit-edit-field"
        onKeyDown={(e) => {
          // Arrows on a closed select change it on some systems: only a pick, Enter or leaving saves.
          keyed.current = e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End";
          if (e.key === "Enter") {
            e.preventDefault();
            void commit(e.currentTarget.value);
          } else onKeyDown(e);
        }}
        onPointerDown={() => (keyed.current = false)}
        onChange={(e) => {
          if (!keyed.current) void commit(e.currentTarget.value);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ) : type === "tags" ? (
      <span className="kit-chips">
        {chips.map((t) => (
          <span key={t} className="kit-chip">
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              // Keeps focus in the field (Safari doesn't focus a pressed button), so the editor stays open.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                setChips((c) => c.filter((x) => x !== t));
                field.current?.focus();
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={field}
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value.endsWith(",") ? "" : e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
              e.preventDefault();
              setChips((c) => addTags(c, draft));
              setDraft("");
            } else if (e.key === ",") e.preventDefault();
            else if (e.key === "Enter") {
              e.preventDefault();
              void commit(chips);
            } else if (e.key === "Backspace" && !draft && chips.length) setChips((c) => c.slice(0, -1));
            else onKeyDown(e);
          }}
          onBeforeInput={(e) => {
            // A comma typed on a phone keyboard adds the chip too.
            if ((e as unknown as InputEvent).data === "," && draft.trim()) {
              e.preventDefault();
              setChips((c) => addTags(c, draft));
              setDraft("");
            }
          }}
          aria-label={`Add ${label}. Enter adds, Enter on an empty field saves`}
          placeholder={chips.length ? "" : placeholder}
          enterKeyHint="done"
          autoCapitalize="none"
          autoCorrect="off"
          className="kit-edit-field"
        />
      </span>
    ) : (
      <input
        ref={field}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit(draft.trim());
          } else onKeyDown(e);
        }}
        aria-label={label}
        placeholder={placeholder}
        enterKeyHint="done"
        className="kit-edit-field"
      />
    );

  return (
    <span ref={box} className={`kit-edit ${className}`} data-editing={editing || undefined} onBlur={onBlur}>
      {editing ? (
        editor
      ) : (
        <button ref={cell} type="button" onClick={begin} aria-busy={saving || undefined} className="kit-edit-cell" data-saving={saving || undefined}>
          <span className="kit-edit-value">
            {empty ? <span className="kit-edit-empty">{placeholder}</span> : display ? display(shown) : String(shown)}
          </span>
          <span className="sr-only">, edit {label}</span>
          {saving ? <span aria-hidden className="kit-spin kit-edit-spin" /> : tick ? <span aria-hidden className="kit-edit-tick">✓</span> : null}
        </button>
      )}
      {error && !editing && (
        <span role="alert" className="kit-edit-error">
          {error}
        </span>
      )}
    </span>
  );
}
