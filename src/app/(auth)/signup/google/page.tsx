import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { switchOn } from "@/lib/switches";
import { env } from "@/lib/env";
import { GOOGLE_SIGNUP_COOKIE, readIdentity } from "@/lib/google-auth";
import { AuthForm } from "../../AuthForm";
import { inviteBySecret, inviteForEmail } from "@/lib/account-members";
import { TEAM_INVITE_COOKIE } from "@/lib/next-path";
import { signupWithGoogle } from "../../actions";
import { ACCOUNT_TYPES } from "@/lib/account-types";

const TYPE_CHOICES = Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }));

export const metadata = { title: "Finish signing up — FloorTest" };

/** After "Continue with Google" found no account: the rest of the sign-up form, with the email fixed to Google's. */
export default async function GoogleSignup() {
  const who = readIdentity((await cookies()).get(GOOGLE_SIGNUP_COOKIE)?.value, env.secret);
  if (!who) redirect("/signup");
  // Joining a team from an invite sent to this Google email: no invite code needed.
  const teamSecret = (await cookies()).get(TEAM_INVITE_COOKIE)?.value ?? "";
  const inv = teamSecret ? await inviteBySecret(teamSecret) : undefined;
  // Google has confirmed the email, so an invite sent to it counts even if they didn't come from the invite link.
  const team = (inv && inv.email === who.email.toLowerCase() ? inv : undefined) ?? (await inviteForEmail(who.email));
  const inviteOnly = !(await switchOn("open_signup")) && !team;
  const host = env.appUrl.replace(/^https?:\/\//, "");
  return (
    <>
      <h1 className="mb-3 text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone">Finish signing up</h1>
      <p className="mb-6 text-sm text-mute">
        No FloorTest account uses this Google email yet. Fill in the rest to claim your link.
        {inviteOnly && (
          <>
            {" "}FloorTest is invite-only during the beta.{" "}
            <Link href="/#waitlist" className="underline underline-offset-4 hover:text-bone">No code? Join the waitlist</Link>
          </>
        )}
      </p>
      {team && (
        <p className="mb-6 rounded-lg border border-lime/40 bg-lime/5 px-4 py-3 text-sm">
          You&apos;re joining <span className="font-medium">{team.account_name}</span> on FloorTest.
        </p>
      )}
      <p className="mb-6 rounded-lg border border-line bg-ink-2 px-4 py-3 text-sm">
        Signing up as <span className="font-medium text-bone">{who.email}</span> <span className="text-mute">(from Google, already confirmed)</span>
      </p>
      <AuthForm
        captureSource
        action={signupWithGoogle}
        hidden={inv && team?.id === inv.id ? { team: teamSecret } : undefined}
        submit="Create my link"
        fields={[
          ...(inviteOnly ? [{ name: "invite", label: "Invite code", placeholder: "From your invite", autoComplete: "off" }] : []),
          { name: "kind", label: "What best describes you?", choices: TYPE_CHOICES },
          { name: "first_name", label: "First name", autoComplete: "given-name", defaultValue: who.first || undefined },
          { name: "last_name", label: "Surname", autoComplete: "family-name", defaultValue: who.last || undefined, hint: "Kept private: for your account, billing and receipts. Never shown on your page." },
          { name: "handle", label: "Username", prefix: `${host}/`, placeholder: "yourname", autoComplete: "username" },
          { name: "name", label: "Professional name (optional)", placeholder: "DJ, artist or label name", autoComplete: "nickname", optional: true, hint: "Shown on your page. Leave empty to show your username." },
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
  );
}
