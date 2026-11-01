"use client";

import { useId, useState } from "react";
import { announceOps, type OpsResult } from "@/lib/ops-result";
import { PROOF_BYTES_MAX, PROOF_FILES_MAX, PROOF_LINKS_MAX, REASON_MAX, REASON_MIN } from "@/lib/verification-proof";

const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const MB = PROOF_BYTES_MAX / 1024 / 1024;

/** Puts one file straight into the private bucket and returns its signed ticket (src/lib/verification-proposals.ts). */
async function upload(file: File): Promise<string> {
  const res = await fetch("/api/admin/verification-proofs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: file.size, name: file.name }),
  });
  const start = (await res.json().catch(() => ({}))) as { ticket?: string; url?: string; headers?: Record<string, string>; error?: string };
  if (!res.ok || !start.ticket || !start.url) throw new Error(start.error || "Couldn't start the upload. Try again.");
  const put = await fetch(start.url, { method: "PUT", headers: start.headers, body: file });
  if (!put.ok) throw new Error(`"${file.name}" didn't upload. Try again.`);
  return start.ticket;
}

/**
 * The reason-and-proof form for staff verification (owner, 1 Nov): "Propose verification…" for proposers and
 * "Verify profile…" for people who may add the mark directly. Files go to the private bucket first; the action gets
 * only their tickets. Every limit here is checked again on the server.
 */
export function ProofForm({
  action,
  submitLabel,
  confirm,
  hint,
}: {
  action: (form: FormData) => Promise<OpsResult>;
  submitLabel: string;
  confirm?: string;
  hint: string;
}) {
  const id = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);

  const pick = (list: FileList | null) => {
    setError(null);
    const chosen = Array.from(list ?? []);
    if (chosen.length > PROOF_FILES_MAX) return setError(`Add at most ${PROOF_FILES_MAX} files`);
    const big = chosen.find((f) => f.size > PROOF_BYTES_MAX);
    if (big) return setError(`"${big.name}" is over ${MB} MB`);
    setFiles(chosen);
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (!files.length && !String(data.get("links") || "").trim()) return setError("Add proof: a screenshot or PDF, or a link to their profile");
    if (confirm && !window.confirm(confirm)) return;
    setError(null);
    data.delete("files");
    try {
      for (const [i, f] of files.entries()) {
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        data.append("ticket", await upload(f));
      }
      setBusy("Sending…");
      const r = await action(data);
      if (!r.ok) return setError(r.error);
      announceOps(r);
      form.reset();
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit} aria-busy={!!busy} className="mt-2 space-y-3 aria-busy:opacity-70">
      <label className="block space-y-1.5" htmlFor={`${id}-reason`}>
        <span className="label">Reason</span>
        <textarea
          id={`${id}-reason`}
          name="reason"
          required
          minLength={REASON_MIN}
          maxLength={REASON_MAX}
          rows={3}
          className="input resize-y text-base sm:text-sm"
          placeholder="How you know it's them, e.g. known label, their Instagram links to this page"
        />
      </label>
      <label className="block space-y-1.5" htmlFor={`${id}-links`}>
        <span className="label">Profile links (one per line, up to {PROOF_LINKS_MAX})</span>
        <textarea id={`${id}-links`} name="links" rows={2} inputMode="url" autoComplete="off" className="input resize-y text-base sm:text-sm" placeholder="https://instagram.com/…" />
      </label>
      <div className="space-y-1.5">
        <label className="label block" htmlFor={`${id}-files`}>
          Screenshots or PDFs (up to {PROOF_FILES_MAX}, {MB} MB each)
        </label>
        <input
          id={`${id}-files`}
          name="files"
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => pick(e.currentTarget.files)}
          className="block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-ink-4 file:px-4 file:text-sm file:font-semibold file:text-bone"
        />
        {files.length > 0 && (
          <ul className="space-y-0.5 text-xs text-mute">
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`} className="truncate">
                {f.name} · {f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-mute">{hint}</p>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <button disabled={!!busy} className="btn-lime btn-sm w-full disabled:opacity-60">
        {busy ?? submitLabel}
      </button>
    </form>
  );
}
