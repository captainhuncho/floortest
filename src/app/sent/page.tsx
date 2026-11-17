import { Logo } from "@/components/Logo";
import { SentForm } from "./SentForm";
import { botCheckKey } from "@/lib/turnstile";

export const metadata = { title: "Your sends — FloorTest" };

export default async function Sent() {
  const botKey = await botCheckKey();
  return (
    // Light or dark with the visitor's device. One ~600px column: the mark at the top centre, then the form (owner, 17 Nov).
    // min-height, not a fixed height, so the page still scrolls when a phone keyboard opens. On phones the bottom
    // padding leaves room for the button, which is pinned there (SentForm).
    <main className="theme-system mx-auto flex min-h-dvh w-full max-w-[600px] flex-col bg-ink pb-[max(2.5rem,env(safe-area-inset-bottom))] pl-[max(0.875rem,env(safe-area-inset-left))] pr-[max(0.875rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))] text-bone max-sm:pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-5 sm:pt-8">
      <Logo className="self-center" />
      <SentForm botCheckKey={botKey} />
    </main>
  );
}
