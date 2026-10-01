"use client";

import { Turnstile } from "@/components/Turnstile";
import { useActionForm } from "@/components/useActionForm";

import { sendContact } from "./actions";

export function ContactForm({ name, email, topic, message }: { name: string; email: string; topic?: string; message?: string }) {
  const [state, onSubmit, pending] = useActionForm(sendContact, undefined);
  if (state?.ok)
    return (
      <div className="card p-6" role="status">
        <p className="text-lg font-semibold">Thanks, we&apos;ve got it.</p>
        <p className="mt-1 text-mute">We&apos;ll reply to the email you gave.</p>
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
          {["General", "Account or billing", "A track I sent", "Report abuse", "Impersonation", "Suspension appeal", "Privacy request", "Partnerships"].map((t) => (
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
      <Turnstile />
      <button className="btn-lime" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
