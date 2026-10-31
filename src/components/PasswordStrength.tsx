"use client";

import { passwordStrength } from "@/lib/password-strength";

const TONES = ["bg-danger", "bg-danger", "bg-mute", "bg-lime", "bg-lime"];
/** Sign-up keeps lime for its one main button (owner, 31 Oct): good scores fill in bone instead. */
const QUIET_TONES = ["bg-danger", "bg-danger", "bg-mute", "bg-bone/80", "bg-bone/80"];

/** Live strength meter under a new-password field. The server runs the same check. */
export function PasswordStrength({ value, context = [], quiet = false }: { value: string; context?: string[]; quiet?: boolean }) {
  if (!value) return null;
  const s = passwordStrength(value, context);
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < Math.max(1, s.score) ? (quiet ? QUIET_TONES : TONES)[s.score] : "bg-line"}`} />
        ))}
      </div>
      <p className="text-[12px] text-mute">
        <span className={s.ok ? "text-bone" : "text-danger"}>{s.label}</span>
        {s.tip && <> · {s.tip}</>}
      </p>
    </div>
  );
}
