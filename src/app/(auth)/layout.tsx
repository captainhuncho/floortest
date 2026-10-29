import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * Sign in, sign up, recovery and signed out: one calm column at every width. The form is the page; nothing sits
 * beside it. The crest at the top says where you are, the legal links at the bottom stay out of the way.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-4 pb-8 pt-8 sm:pt-14">
      <Logo href="/" className="mb-10 self-start" />
      <div className="flex-1">{children}</div>
      <nav aria-label="Legal" className="mt-12 flex gap-6 text-[12px] text-dim">
        <Link href="/terms" className="tap inline-flex items-center hover:text-bone">Terms</Link>
        <Link href="/privacy" className="tap inline-flex items-center hover:text-bone">Privacy</Link>
        <Link href="/cookies" className="tap inline-flex items-center hover:text-bone">Cookies</Link>
        <a href="#cookie-settings" className="tap inline-flex items-center hover:text-bone">Cookie settings</a>
      </nav>
    </main>
  );
}
