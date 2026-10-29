import Link from "next/link";
import { siteEditor } from "@/lib/site-editor";
import { EditablePage, editable } from "@/components/Editable";
import { switchOn } from "@/lib/switches";
import { siteCopy } from "@/lib/content";
import { botCheckKey } from "@/lib/turnstile";
import { q } from "@/lib/db";
import { env, isPreview } from "@/lib/env";
import { googleConfig } from "@/lib/google-auth";
import { AuthForm } from "../AuthForm";
import { signup } from "../actions";
import { inviteBySecret } from "@/lib/account-members";
import { ACCOUNT_TYPES } from "@/lib/account-types";

const TYPE_CHOICES = Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }));

export const metadata = { title: "Claim your link — FloorTest" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string; invite?: string; handle?: string; team?: string }> }) {
  const sp = await searchParams;
  const ref = (sp.ref || "").toUpperCase().slice(0, 32);
  const inviteCode = (sp.invite || "").toUpperCase().slice(0, 32);
  const personal = inviteCode ? await q.get<{ email: string | null }>("SELECT email FROM invites WHERE code = ? AND revoked_at IS NULL", inviteCode) : undefined;
  const referrer = ref ? await q.get<{ name: string }>("SELECT name FROM users WHERE referral_code = ?", ref) : undefined;
  // Joining a team from an invite email: no invite code needed, and the email is the one invited.
  const team = sp.team ? await inviteBySecret(sp.team) : undefined;
  const inviteOnly = !(await switchOn("open_signup")) && !team;
  const [c, editor] = await Promise.all([siteCopy("auth"), siteEditor()]);
  const { E } = editable(c, !!editor);
  const host = env.appUrl.replace(/^https?:\/\//, "");
  return (
    <EditablePage editing={!!editor} page="auth" label="Sign-up and log-in" values={c}>
    <>
      <h1 className="mb-3 text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone"><E k="signup_title" /></h1>
      <p className="mb-8 text-[13px] text-mute">
        <E k="signup_intro" />
        {inviteOnly && (
          <>
            {" "}<E k="signup_invite_only" />{" "}
            <Link href="/#waitlist" className="underline underline-offset-4 hover:text-bone"><E k="signup_waitlist_link" /></Link>
          </>
        )}
      </p>
      {team && (
        <p className="mb-6 rounded-lg border border-lime/40 bg-lime/5 px-4 py-3 text-sm">
          You&apos;re joining <span className="font-medium">{team.account_name}</span> on FloorTest. Create your own login with{" "}
          <span className="font-medium">{team.email}</span>; you&apos;ll get your own link too.
        </p>
      )}
      {personal?.email && (
        <p className="mb-6 rounded-lg border border-lime/40 bg-lime/5 px-4 py-3 text-sm">
          You&apos;re invited. Sign up with <span className="font-medium">{personal.email}</span> to use it.
        </p>
      )}
      {referrer && !inviteOnly && (
        <p className="mb-6 rounded-lg border border-lime/40 bg-lime/5 px-4 py-3 text-sm">
          Invited by <span className="font-medium">{referrer.name}</span>. You both get 10 more active tracks once your first track arrives.
        </p>
      )}
      {googleConfig() && !isPreview && (
        <>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/auth/google" className="btn-ghost flex w-full items-center justify-center gap-3 py-3 text-sm font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/google.svg" alt="" className="size-[18px]" />
            Sign up with Google
          </a>
          <div className="my-6 flex items-center gap-3 text-xs text-dim">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <AuthForm
        botCheckKey={await botCheckKey()}
        captureSource
        action={signup}
        // No invite code to type: the link's code rides along, and during the beta it must match the email (src/lib/invites.ts).
        hidden={team ? { team: sp.team! } : personal?.email ? { invite: inviteCode } : referrer && !inviteOnly ? { ref } : undefined}
        submit="Create my link"
        fields={[
          { name: "kind", label: "What best describes you?", choices: TYPE_CHOICES },
          { name: "first_name", label: "First name", placeholder: "Maxwell", autoComplete: "given-name" },
          { name: "last_name", label: "Surname", placeholder: "Adjavon", autoComplete: "family-name", hint: "Kept private: for your account, billing and receipts. Never shown on your page." },
          { name: "handle", label: "Username", prefix: `${host}/`, placeholder: "yourname", autoComplete: "off", hint: "Your link. You can add a stage or label name later in Profile.", defaultValue: (sp.handle || "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30) || undefined },
          { name: "email", label: "Email", type: "email", placeholder: "you@example.com", autoComplete: "username email", defaultValue: team?.email ?? personal?.email ?? undefined },
          { name: "password", label: "Password", type: "password", placeholder: "8+ characters", autoComplete: "new-password", minLength: 8, strength: true },
        ]}
        footer={{ text: "Already have an account?", href: "/login", link: "Sign in" }}
        consents={[
          {
            name: "agree",
            required: true,
            label: (
              <>
                I&apos;m 18 or over, and I agree to the{" "}
                <a href="/terms" target="_blank" className="text-bone underline underline-offset-4">Terms of Use</a> and have read the{" "}
                <a href="/privacy" target="_blank" className="text-bone underline underline-offset-4">Privacy Policy</a>.
              </>
            ),
          },
          { name: "updates", label: "The FloorTest newsletter: product news and tips" },
          { name: "offers", label: "Offers and promotions from FloorTest" },
        ]}
      />
    </>
    </EditablePage>
  );
}
