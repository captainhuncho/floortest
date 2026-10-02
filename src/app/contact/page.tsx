import { botCheckKey } from "@/lib/turnstile";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { ContactForm } from "./ContactForm";

export const metadata = { title: "Contact us — FloorTest" };

export default async function Contact({ searchParams }: { searchParams: Promise<{ report?: string; appeal?: string; takedown?: string }> }) {
  const user = await currentUser();
  const sp = await searchParams;
  const appeal = !!sp.appeal;
  const takedown = !!sp.takedown;
  const report = ((sp).report || "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30);
  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:py-16">
      <Logo className="mb-12" />
      <h1 className="text-4xl font-bold tracking-tight">Contact us</h1>
      <p className="mb-8 mt-3 text-mute">Questions, problems with a track, or something to report. A person reads every message.</p>
      <ContactForm
        botCheckKey={await botCheckKey()}
        name={user?.name ?? ""}
        email={user?.email ?? ""}
        topic={appeal ? "Suspension appeal" : takedown ? "Copyright claim" : report ? "Impersonation" : undefined}
        message={appeal ? "Account email: \nWhy I think the suspension is a mistake: " : takedown ? "My work (title, artist):\nWhere it is on FloorTest (link, track title):\nI'm the rights holder / acting for: \nI believe in good faith this use isn't authorised, and this notice is accurate. Signed: " : report ? `I think floortest.imullar.com/${report} is pretending to be someone else, because: ` : undefined}
      />
    </main>
  );
}
