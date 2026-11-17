"use client";

import { useRef, useState } from "react";
import { QUIET } from "./ReceiptParts";

// "checking": the file has landed and is being checked. held: received while the virus scanner sleeps; it's attached
// to the track after the next check, within about 10 minutes (src/lib/held-uploads.ts).
type Item = { name: string; status: "waiting" | "uploading" | "checking" | "done" | "error"; progress: number; error?: string; held?: boolean };

/** The sender's side of a stems request: pick several WAV/MP3 files, each uploaded and checked in turn. */
export function StemUpload({ token, receiver, existing, max }: { token: string; receiver: string; existing: string[]; max: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const done = existing.length + items.filter((i) => i.status === "done").length;

  const patch = (i: number, p: Partial<Item>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...p } : it)));

  async function uploadOne(file: File, i: number) {
    patch(i, { status: "uploading" });
    const post = (url: string, body: object) =>
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({
        ok: r.ok,
        ...((await r.json().catch(() => ({}))) as { error?: string; held?: boolean; uploadId?: string; target?: { url: string; headers: Record<string, string> } }),
      }));
    const start = await post(`/api/stems/${token}`, { fileName: file.name, size: file.size });
    if (!start.ok || !start.uploadId || !start.target) return patch(i, { status: "error", error: start.error || "Couldn't start the upload." });
    const status = await new Promise<number>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", start.target!.url);
      for (const [k, v] of Object.entries(start.target!.headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (ev) => ev.lengthComputable && patch(i, { progress: ev.loaded / ev.total });
      xhr.onload = () => resolve(xhr.status);
      xhr.onerror = () => resolve(0);
      xhr.send(file);
    });
    if (status < 200 || status >= 300) return patch(i, { status: "error", error: "The upload was interrupted. Check your signal and try again." });
    patch(i, { status: "checking" });
    const done = await post(`/api/stems/${token}/complete`, { uploadId: start.uploadId });
    patch(i, done.ok ? { status: "done", progress: 1, held: !!done.held } : { status: "error", error: done.error || "The stem didn't save, so nothing was sent. Try again." });
  }

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, Math.max(0, max - done));
    const offset = items.length;
    setItems((prev) => [...prev, ...list.map((f) => ({ name: f.name, status: "waiting" as const, progress: 0 }))]);
    setBusy(true);
    for (let k = 0; k < list.length; k++) await uploadOne(list[k], offset + k); // one at a time keeps phones responsive
    setBusy(false);
  }

  return (
    <section aria-labelledby="stems-h" className="flex flex-col gap-2.5">
      <p className="text-[13px] leading-5 text-mute">
        <strong id="stems-h" className="block text-[14px] font-semibold text-bone">
          {receiver} asked for stems
        </strong>
        One WAV or MP3 per stem, up to {max}. Only {receiver} can hear or download them.
      </p>
      {existing.length + items.length > 0 && (
        <ul className="flex flex-col text-[13px]">
          {existing.map((n) => (
            <li key={n} className="flex min-h-10 items-center justify-between gap-3 border-t border-line py-1.5">
              <span className="min-w-0 truncate">{n}</span>
              <span className="shrink-0 text-mute">✓ Sent</span>
            </li>
          ))}
          {items.map((it, i) => (
            <li key={i} className="flex min-h-10 items-center justify-between gap-3 border-t border-line py-1.5">
              <span className="min-w-0 truncate">{it.name}</span>
              <span className={`text-right ${it.status === "error" ? "text-danger" : it.status === "done" ? "text-bone" : "text-mute"}`}>
                {it.status === "done" ? (it.held ? "Received, checking for viruses (up to 10 minutes)" : "✓ Sent") : it.status === "error" ? it.error : it.status === "uploading" ? `${Math.round(it.progress * 100)}%` : it.status === "checking" ? "Checking" : "Waiting"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" multiple accept=".wav,.mp3,audio/wav,audio/mpeg" className="sr-only" aria-label="Choose stem files" onChange={(e) => (pick(e.target.files), (e.target.value = ""))} />
      <button
        type="button"
        disabled={busy || done >= max}
        onClick={() => input.current?.click()}
        className={QUIET}
      >
        {busy ? "Uploading…" : done ? "Add more stems" : "Choose stem files"}
      </button>
    </section>
  );
}
