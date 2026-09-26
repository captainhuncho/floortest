import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { ContactForm } from "./ContactForm";

export const metadata = { title: "Contact us — FloorTest" };

export default async function Contact() {
  const user = await currentUser();
  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:py-16">
      <Logo className="mb-12" />
      <h1 className="text-4xl font-bold tracking-tight">Contact us</h1>
      <p className="mb-8 mt-3 text-mute">Questions, problems with a track, or something to report. A person reads every message.</p>
      <ContactForm name={user?.name ?? ""} email={user?.email ?? ""} />
    </main>
  );
}
