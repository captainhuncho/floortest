import Link from "next/link";
import "./auth.css";
import { AuthScene } from "./AuthScene";

/**
 * Sign in, sign up, recovery and signed out (owner, 31 Oct, the guided sign-up look): each page draws its own
 * AuthFrame (the column on phones, a card on tablets, the glass frame over the scene on desktop); the layout holds
 * the scene and one quiet row of legal links under it. Light or dark with the visitor's device. The scene's image
 * slot is `--af-photo` in auth.css. The scene is six decorative layers (owner, 17 Nov, option 54): the photo, its
 * tone (night) or vignette (day), the beam, the haze and the two letterbox bars; they move only when the device
 * allows motion.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="af-page theme-system">
      <AuthScene />
      {children}
      <nav aria-label="Legal" className="af-legal">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/cookies">Cookies</Link>
        <a href="#cookie-settings">Cookie settings</a>
      </nav>
    </main>
  );
}
