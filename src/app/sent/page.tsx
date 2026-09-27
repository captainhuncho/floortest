import { Logo } from "@/components/Logo";
import { SentForm } from "./SentForm";

export const metadata = { title: "Your sends — FloorTest" };

export default function Sent() {
  return (
    <main className="mx-auto max-w-md px-4 py-10 sm:py-16">
      <Logo className="mb-12" />
      <h1 className="text-3xl font-bold tracking-tight">Everything you&apos;ve sent</h1>
      <p className="mt-3 text-mute">
        See every track you&apos;ve sent through FloorTest and what happened to it. No account or password: we&apos;ll email you a private link.
      </p>
      <div className="mt-8">
        <SentForm />
      </div>
    </main>
  );
}
