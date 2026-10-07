import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Cookie Policy (draft) — FloorTest" };

export default function Cookies() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated={LEGAL.updated}
      sections={[
        [
          "The short version",
          [
            "FloorTest only uses cookies and browser storage that the site needs to work or that remember a choice you made. We don't use advertising, tracking or profiling cookies, and nothing here is shared with advertisers. Because every item below is either strictly necessary or a setting you asked for, we don't ask for consent with a cookie banner.",
          ],
        ],
        [
          "Cookies we set",
          [
            "floortest_session: keeps you signed in. Strictly necessary. Lasts 30 days, or until you sign out.",
            "floortest_2fa: remembers that you've entered your password while you type your two-factor code. Strictly necessary. Lasts 5 minutes.",
            "floortest_view_as: used only by FloorTest support staff to see an account as its owner sees it, when helping with a problem. Never set for users. Ends when support leaves the view.",
            "ft_sender: remembers that this browser confirmed your email with a 6-digit code, so you aren't asked again each time you send music without an account. Strictly necessary. Lasts 30 days.",
            "__Host-ft_ops: keeps FloorTest staff signed in to the separate admin area (ops.floortest.app). Never set for users. Lasts up to 8 hours, and ends after an hour without activity.",
            "ft_flash: carries a one-off confirmation message (like \"Saved\") to the next page. Strictly necessary. Lasts 30 seconds.",
            "ft_theme: remembers whether you chose Night, Day or match your device. A setting you asked for. Lasts 1 year.",
            "ft_submissions_view: remembers whether you prefer the Queue or List layout in your Review Queue. A setting you asked for. Lasts 1 year.",
          ],
        ],
        [
          "Things stored in your browser (not cookies)",
          [
            "When you send a track without an account, the upload page saves your name and email in your browser's local storage so you don't have to retype them next time. It never leaves your device unless you send another track. Clear it any time by clearing site data in your browser.",
            "Your Review Queue export folder name and the admin menu's open or closed state are remembered the same way.",
          ],
        ],
        [
          "Other services",
          [
            "Vercel Web Analytics counts page visits without cookies and without identifying you.",
            "Sentry receives a technical report when a page crashes or runs slowly. It sets no cookies and we don't send your IP address or what you typed.",
            "Cloudflare Turnstile checks that forms are sent by a person, not a bot, on sign-up, the waitlist, contact and anonymous uploads. Cloudflare processes technical signals from your browser for this check only. See Cloudflare's privacy policy for details.",
          ],
        ],
        [
          "Your choices",
          [
            "You can block or delete cookies in your browser settings. If you block the strictly necessary ones, you won't be able to sign in. Deleting the setting cookies just resets your theme and layout.",
            "If we ever add cookies that aren't strictly necessary or a setting you chose, we'll ask first and update this page.",
          ],
        ],
        [
          "Contact",
          [`Questions about this policy: ${LEGAL.email}. See also our Privacy Policy.`],
        ],
      ]}
    />
  );
}
