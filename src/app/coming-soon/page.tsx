import "../(auth)/auth.css";
import "./gate.css";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AuthScene } from "../(auth)/AuthScene";
import { KeyboardWatch } from "../(auth)/KeyboardWatch";
import { GateSheet } from "./GateSheet";
import { APP_URL } from "@/lib/mail";
import { botCheckKey } from "@/lib/turnstile";

const HOST = APP_URL.replace(/^https?:\/\//, "");

export const metadata = { title: "FloorTest · Coming soon", robots: { index: false, follow: false } };

/**
 * What floortest.app shows while the site is password-gated (see src/lib/site-gate.ts). Option 55 (owner, 17 Nov):
 * option 54's photo and glass. Desktop: the photo fills the page and one glass panel at the left holds the gate.
 * Phones: the photo in the top part and one frosted sheet at the bottom. "Log in" goes to /login, which stays open
 * while the site is locked (GATE_OPEN in src/proxy.ts).
 */
export default async function ComingSoon({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next = "/" }, botKey] = await Promise.all([searchParams, botCheckKey()]);
  return (
    <main id="main" className="af-page theme-system cs-page">
      <AuthScene />
      <KeyboardWatch />
      <div className="cs">
        <header className="cs-top">
          <Logo className="af-logo cs-logo" />
          <span className="aw-have">
            <span className="aw-q">Already have an account?</span>
            <Link href="/login" className="aw-login">
              Log in
            </Link>
          </span>
        </header>
        <GateSheet next={next} host={HOST} botCheckKey={botKey} />
      </div>
    </main>
  );
}
