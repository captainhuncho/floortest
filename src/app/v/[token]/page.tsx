import { Logo } from "@/components/Logo";
import { verifySender } from "@/lib/core";

export const metadata = { title: "Email confirmed — FloorTest", robots: { index: false } };

export default async function Verify({ params }: { params: Promise<{ token: string }> }) {
  const s = verifySender((await params).token);
  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <Logo className="mb-12" />
      {s ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Email confirmed</h1>
          <p className="mt-3 text-mute">
            Thanks, {s.name}. Your tracks now show as coming from a verified sender. You can close this page.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Link not recognised</h1>
          <p className="mt-3 text-mute">This confirmation link is invalid or was already replaced.</p>
        </>
      )}
    </main>
  );
}
