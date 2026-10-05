import { Logo } from "@/components/Logo";
import { senderByVerifyToken } from "@/lib/intake";
import { ConfirmEmail } from "./ConfirmEmail";

export const metadata = { title: "Confirm your email — FloorTest", robots: { index: false } };

/**
 * Confirmation needs a click (a POST), not just opening the link: email security scanners
 * pre-open links, which would otherwise verify addresses nobody actually checked.
 */
export default async function Verify({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await senderByVerifyToken(token);
  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <Logo className="mb-12" />
      {!s ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Link not recognised</h1>
          <p className="mt-3 text-mute">This confirmation link is invalid or was already replaced.</p>
        </>
      ) : s.verified_at ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Email confirmed</h1>
          <p className="mt-3 text-mute">Thanks, {s.name}. Your tracks show as coming from a verified sender. You can close this page.</p>
        </>
      ) : (
        <ConfirmEmail token={token} name={s.name} email={s.email} />
      )}
    </main>
  );
}
