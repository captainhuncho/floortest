import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AuthSection } from "./AuthSection";

const STEPS = [
  ["Receive", "Private tracks, in one place."],
  ["Review", "Listen. Decide what stays."],
  ["Collect", "Keep your selections organised."],
  ["Prepare", "Take your music into the next set."],
];

/** Sign in, sign up and signed out. Desktop: the workspace story on the left, the form on the right. Phones: the form alone. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-between border-r border-line bg-ink-2 px-16 pb-9 pt-10 lg:flex">
        <div className="border-b border-line-2 pb-6">
          <Logo />
        </div>
        <div className="flex flex-col gap-8">
          <p className="text-xs font-medium uppercase leading-4 tracking-[0.5px] text-mute">Private music workspace</p>
          <ol className="border-b border-line">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="flex items-start gap-6 border-t border-line py-6">
                <span className="w-6 shrink-0 pt-[9px] text-[10px] font-medium leading-[14px] tracking-[0.8px] text-dim">0{i + 1}</span>
                <span className="flex flex-col gap-2">
                  <span className="text-[28px] font-semibold leading-[34px] tracking-[-0.5px] text-bone">{title}</span>
                  <span className="text-sm text-mute">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-[10px] font-medium uppercase leading-[14px] tracking-[0.8px] text-dim">© {new Date().getFullYear()} FloorTest</p>
      </aside>
      <main className="flex min-h-dvh flex-col px-4 py-12 lg:px-16 lg:pb-9 lg:pt-10">
        <div className="hidden h-[57px] justify-end pt-[9px] lg:flex">
          <AuthSection />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm lg:max-w-[400px]">
            <Logo className="mb-10 lg:hidden" />
            {children}
          </div>
        </div>
        <nav aria-label="Legal" className="mt-10 flex justify-center gap-6 text-sm text-dim lg:mt-0 lg:justify-end">
          <Link href="/terms" className="hover:text-bone">Terms</Link>
          <Link href="/privacy" className="hover:text-bone">Privacy</Link>
          <Link href="/cookies" className="hover:text-bone">Cookies</Link>
        </nav>
      </main>
    </div>
  );
}
