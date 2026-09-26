"use client";

import { useActionForm } from "@/components/useActionForm";
import { useRouter } from "next/navigation";
import {useRef, useState} from "react";
import { updatePublicPage } from "../actions";

const STYLES = [
  { id: "classic", name: "Classic", blurb: "Minimal and fast. The file comes first." },
  { id: "stage", name: "Stage", blurb: "Photo-led, with your callout brief and a review step." },
] as const;

export function PublicPageForm({ handle, style, roleLine }: { handle: string; style: string; roleLine: string }) {
  const [state, onSubmit, pending] = useActionForm(updatePublicPage, undefined);
  const [picked, setPicked] = useState(style);
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-5">
      <fieldset>
        <legend className="label mb-2">Style</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {STYLES.map((s) => (
            <label
              key={s.id}
              className={`card cursor-pointer p-4 transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime ${
                picked === s.id ? "border-lime/60" : "hover:border-mute"
              }`}
            >
              <input type="radio" name="page_style" value={s.id} checked={picked === s.id} onChange={() => setPicked(s.id)} className="sr-only" />
              <span className="flex items-center justify-between">
                <span className="font-medium">{s.name}</span>
                {picked === s.id && <span className="chip border-lime/60 text-lime">Selected</span>}
              </span>
              <span className="mt-1 block text-sm text-mute">{s.blurb}</span>
              <a href={`/${handle}?style=${s.id}`} target="_blank" className="mt-3 inline-block text-sm underline underline-offset-4" onClick={(e) => e.stopPropagation()}>
                Preview ↗
              </a>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1.5">
        <span className="label">Role line</span>
        <input name="role_line" defaultValue={roleLine} maxLength={60} className="input" placeholder="DJ / Performer" />
        <span className="block text-sm text-mute">Shown under your name on the Stage page.</span>
      </label>
      {state?.ok && <p className="text-sm text-lime">Saved.</p>}
      <button className="btn-lime btn-sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function CoverUpload({ handle, cover }: { handle: string; cover: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/cover", { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(body.error || "Upload failed.");
    else router.refresh();
  }

  async function remove() {
    setBusy(true);
    await fetch("/api/cover", { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-4">
      <div className="grid h-28 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-ink">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/cover/${handle}?v=${encodeURIComponent(cover)}`} alt="Current cover photo" className="h-full w-full object-cover" />
        ) : (
          <span className="px-2 text-center text-xs text-mute">No photo</span>
        )}
      </div>
      <div>
        <p className="font-medium">Cover photo</p>
        <p className="text-sm text-mute">Portrait works best. JPG, PNG or WebP, up to 8 MB. Shown publicly on the Stage page.</p>
        <input ref={input} type="file"
      aria-label="Choose a cover photo"
      tabIndex={-1} accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Working…" : cover ? "Replace" : "Upload"}
          </button>
          {cover && (
            <button type="button" className="btn btn-sm text-mute hover:text-bone" disabled={busy} onClick={remove}>
              Remove
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
