import { currentSessionHash, requireRole } from "@/lib/auth";
import { q, now } from "@/lib/db";
import { listSessions } from "@/lib/sessions";
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
  // Every device signed in to this account, for the list under Password and devices.
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: user.tz || "UTC" });
  const devices = (await listSessions(user.id, await currentSessionHash())).map((s) => ({
    hash: s.hash,
    device: s.device,
    app: s.kind === "app",
    current: s.current,
    signedIn: when.format(s.createdAt),
    lastUsed: s.lastSeenAt ? when.format(s.lastSeenAt) : null,
  }));
  const pendingEmail = (await q.get<{ e: string | null }>("SELECT pending_email AS e FROM users WHERE id = ? AND pending_email_at > ?", user.id, now() - 48 * 3_600_000))?.e ?? null;
  return (
    <>
      <PageTitle title="Security" sub="How you sign in, and keeping your account yours." />
      <Section id="email-h" title="Email">
        <EmailForm email={user.email} pending={pendingEmail} twoFactor={!!user.totp_enabled_at} />
      </Section>
      <Section id="security-h" title="Password and devices" sub="Changing your password signs out every other device and emails you a notice.">
        <SecurityForm devices={devices} context={[user.name, user.email, user.handle]} twoFactor={!!user.totp_enabled_at} />
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
