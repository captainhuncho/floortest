import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { ContactForm } from "./ContactForm";

export const metadata = { title: "Contact us — FloorTest" };

export default async function Contact({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const user = await currentUser();
  const report = ((await searchParams).report || "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30);
  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:py-16">
      <Logo className="mb-12" />
      <h1 className="text-4xl font-bold tracking-tight">Contact us</h1>
      <p className="mb-8 mt-3 text-mute">Questions, problems with a track, or something to report. A person reads every message.</p>
      <ContactForm
        name={user?.name ?? ""}
        email={user?.email ?? ""}
        topic={report ? "Impersonation" : undefined}
        message={report ? `I think floortest.imullar.com/${report} is pretending to be someone else, because: ` : undefined}
      />
    </main>
  );
}
