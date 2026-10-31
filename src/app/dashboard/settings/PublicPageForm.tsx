"use client";

import { useActionForm } from "@/components/useActionForm";
import { useRouter } from "next/navigation";
import {useRef, useState} from "react";
import { MAX_LINKS, PLATFORMS, type ProfileLink } from "@/lib/socials";
import { updatePublicPage } from "../actions/settings";
import { SaveBar } from "./SaveBar";
import { BTN, BTN_GHOST, FIELD, HELP, Notice } from "./ui";
import { Icon } from "@/components/Kit";

const PLACEHOLDER: Record<string, string> = {
  instagram: "@yourname or a link",
  tiktok: "@yourname or a link",
  soundcloud: "@yourname or a link",
  youtube: "@yourname or a link",
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
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className={FIELD}>Role line</span>
        <input name="role_line" defaultValue={roleLine} maxLength={60} className="input" placeholder="DJ / Performer" />
        <span className={HELP}>Shown in link previews when you share your link.</span>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className={`${FIELD} mb-2`}>Your profiles</legend>
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[13px] border border-line bg-well p-2 sm:flex sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
            <select
              name="platform"
              aria-label={`Platform ${i + 1}`}
              value={r.platform}
              onChange={(e) => setRows((all) => all.map((x) => (x.key === r.key ? { ...x, platform: e.target.value } : x)))}
              className="input sm:w-40 sm:shrink-0"
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
              className="input col-span-2 min-w-0 sm:flex-1"
            />
            <button
              type="button"
              aria-label={`Remove ${PLATFORMS.find((p) => p.key === r.platform)?.label ?? "website"} profile`}
              onClick={() => setRows((all) => (all.length > 1 ? all.filter((x) => x.key !== r.key) : [{ ...all[0], url: "" }]))}
              className="row-start-1 col-start-2 grid min-h-11 min-w-11 shrink-0 place-items-center rounded-[12px] border border-line text-mute hover:border-line-2 hover:text-bone sm:order-last"
            >
              <Icon name="x" className="size-4" />
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
            className={`${BTN_GHOST} w-fit gap-1.5`}
          >
            <Icon name="plus" className="size-4" />
            Add a profile
          </button>
        )}
        <p className={HELP}>Up to {MAX_LINKS}.</p>
      </fieldset>
      <SaveBar pending={pending} state={state} />
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
    <div className="flex flex-wrap items-center gap-4 sm:gap-5">
      <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-[18px] border border-line bg-well">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/cover/${handle}?v=${encodeURIComponent(cover)}`} alt="Current profile photo" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 px-2 text-center text-[11.5px] text-mute"><Icon name="user" className="size-6 text-faint" />No photo</span>
        )}
      </div>
      <div className="min-w-0 flex-1 basis-52">
        <p className="text-[12px] text-mute">Square works best. JPG, PNG or WebP, up to 8 MB.</p>
        <input ref={input} type="file"
      aria-label="Choose a profile photo"
      tabIndex={-1} accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={BTN} disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Working…" : cover ? "Replace" : "Upload"}
          </button>
          {cover && (
            <button type="button" className={BTN_GHOST} disabled={busy} onClick={remove}>
              Remove
            </button>
          )}
        </div>
        {error && (
          <Notice tone="error" className="mt-3" next="Try a square JPG, PNG or WebP under 8 MB.">
            {error}
          </Notice>
        )}
      </div>
    </div>
  );
}
