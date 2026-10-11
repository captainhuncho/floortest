import { currentSessionHash, requireRole } from "@/lib/auth";
import { q } from "@/lib/db";
import { EmailForm } from "../EmailForm";
import { SecurityForm } from "../SecurityForm";
import { TwoFactor } from "../TwoFactor";
import { GoogleSignIn } from "../GoogleSignIn";
import { isPreview } from "@/lib/env";
import { googleConfig } from "@/lib/google-auth";
import { PageTitle, Section } from "../Section";

export const metadata = { title: "Security — FloorTest" };

export default async function Security({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const user = await requireRole("owner");
  const sp = await searchParams;
  const otherSessions = await q.count(
    "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ? AND token_hash <> ?",
    user.id,
    Date.now(),
    (await currentSessionHash()) ?? "",
  );
  const pendingEmail = (await q.get<{ e: string | null }>("SELECT pending_email AS e FROM users WHERE id = ? AND pending_email_at > ?", user.id, Date.now() - 48 * 3_600_000))?.e ?? null;
  return (
    <>
      <PageTitle title="Security" sub="How you sign in, and keeping your account yours." />
      <Section id="email-h" title="Email">
        <EmailForm email={user.email} pending={pendingEmail} twoFactor={!!user.totp_enabled_at} />
      </Section>
      <Section id="security-h" title="Password and devices" sub="Changing your password signs out every other device and emails you a notice.">
        <SecurityForm otherSessions={otherSessions} context={[user.name, user.email, user.handle]} twoFactor={!!user.totp_enabled_at} />
      </Section>
      <Section id="twofactor-h" title="Two-step sign-in">
        <TwoFactor enabled={!!user.totp_enabled_at} alerts={!!user.signin_alerts} />
      </Section>
      {googleConfig() && !isPreview && (
        <Section id="google-h" title="Google sign-in">
          <GoogleSignIn
            connectedAt={user.google_linked_at ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: user.tz || "UTC" }).format(Number(user.google_linked_at)) : null}
            note={sp.google}
          />
        </Section>
      )}
    </>
  );
}
