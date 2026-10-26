"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { analyzeAudio } from "@/lib/analyze";
import { readTags } from "@/lib/tags";

// held: stored and waiting for the next virus-check batch while the scanner sleeps; it's added within about 15 minutes.
type Item = { file: File; title: string; artist: string; status: "ready" | "uploading" | "done" | "error"; progress: number; error?: string; held?: boolean };

/**
 * The owner adds their own files to this collection (promos that came by email, a USB stick…). Same safe path as a
 * send: straight to storage, checked as real audio, then added. Only the owner sees this; everyone else uses the link.
 */
export function OwnerUpload({ collectionId, collectionName }: { collectionId: number; collectionName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const patch = (i: number, p: Partial<Item>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...p } : it)));

  async function pick(files: FileList | null) {
    setError("");
    const chosen = Array.from(files ?? []).filter((f) => /\.(wav|mp3)$/i.test(f.name));
    if (!chosen.length) return setError("Choose WAV or MP3 files.");
    const fresh: Item[] = chosen.map((file) => ({ file, title: file.name.replace(/\.(wav|mp3)$/i, ""), artist: "", status: "ready", progress: 0 }));
    const start = items.length;
    setItems((list) => [...list, ...fresh]);
    fresh.forEach((it, k) => readTags(it.file).then((t) => patch(start + k, { ...(t.title ? { title: t.title } : {}), ...(t.artist ? { artist: t.artist } : {}) })));
  }

  async function upload(i: number, it: Item) {
    const post = (url: string, body: object) =>
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
    patch(i, { status: "uploading", progress: 0, error: undefined });
    const start = await post(`/api/collections/${collectionId}/upload`, { fileName: it.file.name, size: it.file.size, title: it.title, artist: it.artist, rights });
    if (!start.ok) return patch(i, { status: "error", error: start.data.error || "Couldn't start the upload." });
    const target = start.data.target as { url: string; headers: Record<string, string> };
    const status = await new Promise<number>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", target.url);
      for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => e.lengthComputable && patch(i, { progress: (e.loaded / e.total) * 0.95 });
      xhr.onload = () => resolve(xhr.status);
      xhr.onerror = () => resolve(0);
      xhr.send(it.file);
    });
    if (status < 200 || status >= 300) return patch(i, { status: "error", error: "The upload didn't go through. Try again." });
    const analysis = await analyzeAudio(it.file).catch(() => null);
    const done = await post(`/api/collections/${collectionId}/upload/complete`, { uploadId: start.data.uploadId, ...(analysis ?? {}) });
    if (!done.ok) return patch(i, { status: "error", error: done.data.error || "Upload failed." });
    patch(i, { status: "done", progress: 1, held: !!done.data.held });
  }

  async function sendAll() {
    if (!rights) return setError("Confirm you're allowed to keep these files on FloorTest.");
    if (items.some((it) => it.status !== "done" && !it.title.trim())) return setError("Every track needs a title.");
    setError("");
    setBusy(true);
    for (let i = 0; i < items.length; i++) if (items[i].status !== "done") await upload(i, items[i]);
    setBusy(false);
    router.refresh();
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost btn-sm">
        Add tracks
      </button>
    );

  const waiting = items.filter((it) => it.status !== "done").length;
  return (
    <section aria-label="Add your own tracks" className="mt-3 w-full card p-3.5 md:px-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase text-faint">Add your own tracks to {collectionName}</h2>
          <p className="mt-1 text-[12px] text-mute">For files you already have (promos by email, a USB stick). Senders and labels send through your link instead.</p>
        </div>
        <button type="button" onClick={() => (setOpen(false), setItems([]))} disabled={busy} className="tap-text text-[11px] font-bold text-mute hover:text-bone">
          Close
        </button>
      </div>
      <input ref={input} type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" multiple hidden aria-label="Choose WAV or MP3 files to add" onChange={(e) => (pick(e.target.files), (e.target.value = ""))} />
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className="mt-3 btn-ghost btn-sm">
        Choose WAV or MP3 files
      </button>
      {items.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((it, i) => (
            <li key={i} className="rounded-md border border-line p-2.5 text-[12px]">
              <p className="truncate text-faint">{it.file.name}</p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                <input value={it.title} onChange={(e) => patch(i, { title: e.target.value })} disabled={it.status !== "ready" && it.status !== "error"} aria-label={`Title for ${it.file.name}`} placeholder="Title" className="input text-[12px]" />
                <input value={it.artist} onChange={(e) => patch(i, { artist: e.target.value })} disabled={it.status !== "ready" && it.status !== "error"} aria-label={`Artist for ${it.file.name}`} placeholder="Artist" className="input text-[12px]" />
              </div>
              {it.status === "uploading" && (
                // The bar follows the exact fraction (a scaleX, so it stays on the compositor and never restarts its
                // easing between progress events); the number read out is the floored percent.
                <div className="mt-2 h-1 overflow-hidden rounded bg-line" role="progressbar" aria-label={`Uploading ${it.file.name}`} aria-valuenow={Math.floor(it.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full w-full origin-left bg-lime transition-transform duration-200 ease-linear" style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, it.progress))})` }} />
                </div>
              )}
              {it.status === "done" && <p className="mt-1.5 text-lime">{it.held ? "Received. Checking for viruses; it appears here within 15 minutes." : "Added"}</p>}
              {it.error && <p className="mt-1.5 text-danger">{it.error}</p>}
            </li>
          ))}
        </ul>
      )}
      <label className="mt-3 flex items-start gap-2 text-[12px] text-mute">
        <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 size-4 accent-lime" />
        <span>I own these recordings or have the rights holders&apos; permission to keep them on FloorTest.</span>
      </label>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {error}
        </p>
      )}
      {items.length > 0 && (
        <button type="button" onClick={sendAll} disabled={busy || !waiting} className="mt-3 btn-lime btn-sm">
          {busy ? "Adding…" : waiting ? `Add ${waiting} track${waiting === 1 ? "" : "s"}` : "All added"}
        </button>
      )}
    </section>
  );
}
