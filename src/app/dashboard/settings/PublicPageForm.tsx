"use client";

import { useActionForm } from "@/components/useActionForm";
import { useRouter } from "next/navigation";
import {useRef, useState} from "react";
import { MAX_LINKS, PLATFORMS, type ProfileLink } from "@/lib/socials";
import { updatePublicPage } from "../actions/settings";

const PLACEHOLDER: Record<string, string> = {
  instagram: "yourname or instagram.com/yourname",
  tiktok: "yourname or tiktok.com/@yourname",
  soundcloud: "yourname or soundcloud.com/yourname",
  youtube: "yourname or youtube.com/@yourname",
  spotify: "open.spotify.com/artist/…",
  applemusic: "music.apple.com/…/artist/…",
  beatport: "beatport.com/artist/…",
  bandcamp: "yourname.bandcamp.com",
  website: "yoursite.com",
};

export function PublicPageForm({ roleLine, links }: { roleLine: string; links: ProfileLink[] }) {
  const [state, onSubmit, pending] = useActionForm(updatePublicPage, undefined);
  // One row per profile; a key per row so removing one keeps the others' typing intact.
  const [rows, setRows] = useState(() =>
    (links.length ? links : [{ platform: "instagram", url: "" }]).map((l, i) => ({ key: i, platform: l.platform as string, url: l.url })),
  );
  const nextKey = useRef(rows.length);
  const used = new Set(rows.map((r) => r.platform));
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <label className="block space-y-1.5">
        <span className="label">Role line</span>
        <input name="role_line" defaultValue={roleLine} maxLength={60} className="input" placeholder="DJ / Performer" />
        <span className="block text-sm text-mute">Shown in link previews when you share your link.</span>
      </label>
      <fieldset className="space-y-2">
        <legend className="label mb-1.5">Your profiles</legend>
        {rows.map((r, i) => (
          <div key={r.key} className="flex gap-2">
            <select
              name="platform"
              aria-label={`Platform ${i + 1}`}
              value={r.platform}
              onChange={(e) => setRows((all) => all.map((x) => (x.key === r.key ? { ...x, platform: e.target.value } : x)))}
              className="input w-36 shrink-0 sm:w-40"
            >
              {PLATFORMS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
              <option value="website">Website</option>
            </select>
            <input
              name="url"
              aria-label={`Link ${i + 1}`}
              value={r.url}
              onChange={(e) => setRows((all) => all.map((x) => (x.key === r.key ? { ...x, url: e.target.value } : x)))}
              placeholder={PLACEHOLDER[r.platform]}
              maxLength={300}
              className="input min-w-0 flex-1"
            />
            <button
              type="button"
              aria-label={`Remove profile ${i + 1}`}
              onClick={() => setRows((all) => (all.length > 1 ? all.filter((x) => x.key !== r.key) : [{ ...all[0], url: "" }]))}
              className="btn-ghost btn-sm shrink-0 px-3"
            >
              ×
            </button>
          </div>
        ))}
        {rows.length < MAX_LINKS && (
          <button
            type="button"
            onClick={() => {
              const platform = [...PLATFORMS.map((p) => p.key as string), "website"].find((k) => !used.has(k)) ?? "website";
              setRows((all) => [...all, { key: nextKey.current++, platform, url: "" }]);
            }}
            className="text-sm text-lime underline underline-offset-4"
          >
            + Add a profile
          </button>
        )}
        <p className="text-sm text-mute">Up to {MAX_LINKS}. They show as icons under your name so senders know it&apos;s really you.</p>
      </fieldset>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
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
    <div className="flex items-center gap-4">
      <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-ink">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/cover/${handle}?v=${encodeURIComponent(cover)}`} alt="Current profile photo" className="h-full w-full object-cover" />
        ) : (
          <span className="px-2 text-center text-xs text-mute">No photo</span>
        )}
      </div>
      <div>
        <p className="text-sm text-mute">Square works best. JPG, PNG or WebP, up to 8 MB.</p>
        <input ref={input} type="file"
      aria-label="Choose a profile photo"
      tabIndex={-1} accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn-lime btn-sm min-h-11" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Working…" : cover ? "Replace" : "Upload"}
          </button>
          {cover && (
            <button type="button" className="btn btn-sm min-h-11 text-mute hover:text-bone" disabled={busy} onClick={remove}>
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
