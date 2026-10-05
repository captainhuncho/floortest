"use client";

import { useActionForm } from "@/components/useActionForm";
import { useRouter } from "next/navigation";
import {useRef, useState} from "react";
import { updatePublicPage } from "../actions/settings";

export function PublicPageForm({ roleLine }: { roleLine: string }) {
  const [state, onSubmit, pending] = useActionForm(updatePublicPage, undefined);
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-5">
      <label className="block space-y-1.5">
        <span className="label">Role line</span>
        <input name="role_line" defaultValue={roleLine} maxLength={60} className="input" placeholder="DJ / Performer" />
        <span className="block text-sm text-mute">Shown in link previews when you share your link.</span>
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
        <p className="text-sm text-mute">Portrait works best. JPG, PNG or WebP, up to 8 MB. Shown when your link is shared on socials and in messages.</p>
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
