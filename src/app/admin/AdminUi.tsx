"use client";

import { useRef, useState, useTransition } from "react";
import { Toaster } from "./kit/Toaster";

/**
 * The admin messages: a flash from an action not converted yet (then cleared so a reload doesn't repeat it), or a
 * result an OpsForm or OpsButton announced. The ops kit's toast stack (src/app/admin/kit/Toaster.tsx) does the work.
 */
export function Toast({ flash }: { flash: { id: number; text: string; tone: "ok" | "error" } | null }) {
  return <Toaster flash={flash} />;
}

/** A confirm pop-up in FloorTest's style, instead of the browser's grey box. */
export function ConfirmButton({
  action,
  message,
  className,
  children,
  confirmLabel = "Confirm",
  danger = false,
}: {
  action: () => Promise<void>;
  message: string;
  className?: string;
  children: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const destructive = danger || /delete|remove|erase|suspend|can't be undone/i.test(message);
  return (
    <>
      <button type="button" className={className} disabled={pending} onClick={() => ref.current?.showModal()}>
        {pending ? "Working…" : children}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-ink-2 p-0 text-bone backdrop:bg-black/70"
      >
        <div className="space-y-5 p-5">
          <p className="text-[13px] leading-[1.6]">{message}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => ref.current?.close()}>
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              className={destructive ? "btn-sm rounded-md bg-danger px-4 font-bold text-ink" : "btn-lime btn-sm"}
              onClick={() => {
                ref.current?.close();
                start(() => action());
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Site content image: uploads straight away, then keeps the stored key in a hidden field for the form to save. */
export function ImageField({ name, label, hint, initial }: { name: string; label: string; hint?: string; initial: string }) {
  const [key, setKey] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = key ? `/api/site-image/${key.replace(/^site\//, "")}` : "";
  async function upload(file: File) {
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/admin/site-image", { method: "POST", body }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok && data?.key) setKey(data.key);
    else setError(data?.error ?? "Upload failed. Try again.");
  }
  return (
    <div className="space-y-1.5">
      <span className="label">{label}</span>
      <input type="hidden" name={name} value={key} />
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-48 rounded-md border border-line" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-ghost btn-sm cursor-pointer">
          {busy ? "Uploading…" : key ? "Replace image" : "Upload image"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {key && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setKey("")}>
            Remove
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-dim">{hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/**
 * A submit button for a form that carries fields (a note, a reason), asking first. ConfirmButton can't read form
 * fields, so this one lets the form submit normally once confirmed.
 */
export function ConfirmSubmit({
  formAction,
  message,
  className,
  children,
}: {
  formAction?: (form: FormData) => Promise<void>;
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      formAction={formAction}
      className={className}
      onClick={(e) => {
        const form = e.currentTarget.form;
        // Let the browser show "please fill in" first; only ask once the form is valid.
        if (form && !form.checkValidity()) return;
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
