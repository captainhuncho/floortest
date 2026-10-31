"use client";

import { Turnstile } from "@/components/Turnstile";
import { useActionForm } from "@/components/useActionForm";

import { sendContact } from "./actions";

export function ContactForm({ name, email, topic, message, botCheckKey }: { name: string; email: string; topic?: string; message?: string; botCheckKey: string | null }) {
  const [state, onSubmit, pending] = useActionForm(sendContact, undefined);
  if (state?.ok)
    return (
      <div className="flex items-start gap-3" role="status">
        <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-lime" />
        <div>
          <p className="text-[15px] font-semibold text-bone">Thanks, we&apos;ve got it.</p>
          <p className="mt-0.5 text-[13px] text-mute">We&apos;ll reply to the email you gave.</p>
        </div>
      </div>
    );
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="label">Name</span>
          <input name="name" defaultValue={name} required className="input" autoComplete="name" />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Email</span>
          <input name="email" type="email" defaultValue={email} required className="input" autoComplete="email" />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="label">Topic</span>
        <select name="topic" className="input" defaultValue={topic}>
          {["General", "Account or billing", "A track I sent", "Report abuse", "Impersonation", "Copyright claim", "Suspension appeal", "Privacy request", "Partnerships"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="label">Message</span>
        <textarea name="message" required maxLength={5000} className="input min-h-36 resize-y" defaultValue={message} />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Turnstile action="contact" siteKey={botCheckKey} />
      <button className="btn-lime min-h-11 w-full rounded-[13px] sm:w-auto" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
