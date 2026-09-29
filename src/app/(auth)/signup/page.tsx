import { q } from "@/lib/db";
import { env } from "@/lib/env";
import { AuthForm } from "../AuthForm";
import { signup } from "../actions";

export const metadata = { title: "Create your receiver — FloorTest" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string; invite?: string }> }) {
  const sp = await searchParams;
  const ref = (sp.ref || "").toUpperCase().slice(0, 32);
  const inviteCode = (sp.invite || "").toUpperCase().slice(0, 32);
  const personal = inviteCode ? await q.get<{ email: string | null }>("SELECT email FROM invites WHERE code = ? AND revoked_at IS NULL", inviteCode) : undefined;
  const referrer = ref ? await q.get<{ name: string }>("SELECT name FROM users WHERE referral_code = ?", ref) : undefined;
  const inviteOnly = env.signupMode === "invite";
  const host = env.appUrl.replace(/^https?:\/\//, "");
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Claim your receiver link</h1>
      <p className="mb-8 text-sm text-mute">
        One permanent link for every callout. Free for 20 active songs.
        {inviteOnly && !referrer && " FloorTest is invite-only during the beta."}
      </p>
      {personal?.email && (
        <p className="mb-6 rounded-lg border border-lime/40 bg-lime/5 px-4 py-3 text-sm">
          You&apos;re invited. Sign up with <span className="font-medium">{personal.email}</span> to use it.
        </p>
      )}
      {referrer && (
        <p className="mb-6 rounded-lg border border-lime/40 bg-lime/5 px-4 py-3 text-sm">
          Invited by <span className="font-medium">{referrer.name}</span>. You both get 10 extra song slots once your first track arrives.
        </p>
      )}
      <AuthForm
        action={signup}
        hidden={referrer ? { ref } : undefined}
        submit="Create receiver"
        fields={[
          ...(inviteOnly && !referrer
            ? [{ name: "invite", label: "Invite code", placeholder: "From your invite", autoComplete: "off", defaultValue: inviteCode || ref || undefined }]
            : []),
          { name: "name", label: "DJ / curator name", placeholder: "Maxwell", autoComplete: "name" },
          { name: "handle", label: "Your link", prefix: `${host}/`, placeholder: "maxwell", autoComplete: "username" },
          { name: "email", label: "Email", type: "email", placeholder: "you@example.com", autoComplete: "email", defaultValue: personal?.email ?? undefined },
          { name: "password", label: "Password", type: "password", placeholder: "8+ characters", autoComplete: "new-password", minLength: 8 },
        ]}
        footer={{ text: "Already receiving?", href: "/login", link: "Log in" }}
      />
      <p className="mt-6 text-xs text-mute">
        By creating an account you confirm you&apos;re 18 or over and agree to the{" "}
        <a href="/terms" className="underline underline-offset-4 hover:text-bone">Terms</a> and{" "}
        <a href="/privacy" className="underline underline-offset-4 hover:text-bone">Privacy Policy</a>.
      </p>
    </>
  );
}
