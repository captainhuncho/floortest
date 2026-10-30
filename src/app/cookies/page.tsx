import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";
import { SHARING_LEGAL, sharingWording } from "@/lib/legal-sharing";

export const metadata = { title: "Cookie Policy — FloorTest" };

export default async function Cookies() {
  const sharing = await sharingWording();
  return (
    <LegalPage
      title="Cookie Policy"
      updated={sharing ? SHARING_LEGAL.updated : LEGAL.updated}
      sections={[
        [
          "The short version",
          [
            "FloorTest uses cookies and browser storage that the site needs to work or that remember a choice you made. We don't use advertising, tracking or profiling cookies, and nothing here is shared with advertisers. Page-visit counts and crash reports from your browser run only if you choose Accept on our cookie banner; you can change that any time from Cookie settings at the bottom of every page.",
          ],
        ],
        [
          "Cookies we set",
          [
            "__Host-floortest_session: keeps you signed in. Strictly necessary. Lasts 30 days, ends sooner if it isn't used for 14 days, and ends when you sign out.",
            "floortest_2fa: remembers that you've entered your password while you type your two-factor code. Strictly necessary. Lasts 5 minutes.",
            "floortest_passkey: holds the one-time check while you sign in with a passkey. Strictly necessary. Lasts 5 minutes.",
            "floortest_code_email: remembers which address we just emailed a sign-in code to, while you type the code. Strictly necessary. Lasts 10 minutes.",
            "ft_google, ft_google_signup, ft_google_link: carry you safely through signing in, signing up or connecting with Google. Strictly necessary. Last 10 minutes (30 minutes while you finish signing up).",
            "floortest_next: brings you back to the page you were on after you sign in. Strictly necessary. Lasts 1 hour.",
            "ft_team_invite: holds a team invitation while you sign in or sign up to accept it. Strictly necessary. Lasts 1 hour.",
            "ft_desk: remembers which desk you're working on, if you're on a team. Strictly necessary. Lasts 1 year.",
            "ft_sender: remembers that this browser confirmed your email with a 6-digit code, so you aren't asked again each time you send music without an account. Strictly necessary. Lasts 30 days.",
            "ft_gate: lets you through while the site is open by invitation only. Strictly necessary. Lasts 30 days.",
            "ft_consent: remembers whether you chose Accept or Reject on the cookie banner. Strictly necessary. Lasts 1 year.",
            "ft_theme: remembers whether you chose Night, Day or match your device. A setting you asked for. Lasts 1 year.",
            "ft_submissions_view: remembers whether you prefer the Queue or List layout in your Review Queue. A setting you asked for. Lasts 1 year.",
            "__Host-ft_ops, ft_flash, floortest_view_as, ft_preview: used only by FloorTest staff in their admin area. Never set for users.",
            ...(sharing ? SHARING_LEGAL.cookies : []),
          ],
        ],
        [
          "Things stored in your browser (not cookies)",
          [
            "When you send a track without an account, the upload page saves your name and email in your browser's local storage so you don't have to retype them next time. It never leaves your device unless you send another track. Clear it any time by clearing site data in your browser.",
            "Small display choices are remembered the same way, only in your browser: your Review Queue export folder name, whether keyboard shortcuts and the details panel are on, and the last page you used in the app. An upload form you haven't sent yet is kept until you close the tab.",
          ],
        ],
        [
          "Other services",
          [
            "Vercel Web Analytics counts page visits without cookies and without identifying you. It runs only if you choose Accept.",
            "Sentry receives a technical report when a page crashes or runs slowly. Reports from your browser are sent only if you choose Accept. Sentry sets no cookies and we don't send your IP address or what you typed.",
            "Cloudflare Turnstile checks that forms are sent by a person, not a bot, on sign-up, the waitlist, contact and anonymous uploads. Cloudflare processes technical signals from your browser for this check only. See Cloudflare's privacy policy for details.",
          ],
        ],
        [
          "Your choices",
          [
            "You can block or delete cookies in your browser settings. If you block the strictly necessary ones, you won't be able to sign in. Deleting the setting cookies just resets your theme and layout.",
            "Reject, or closing the banner, keeps analytics and browser crash reports off. You can change your choice from Cookie settings at the bottom of every page; it applies from the next page you open.",
            "If we add anything else that isn't strictly necessary or a setting you chose, we'll ask first and update this page.",
          ],
        ],
        [
          "Contact",
          [`Questions about this policy: ${LEGAL.privacy}. See also our Privacy Policy.`],
        ],
      ]}
    />
  );
}
