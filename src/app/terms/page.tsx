import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Terms of Use (draft) — FloorTest" };

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Use"
      updated="27 September 2026"
      sections={[
        ["The service", ["FloorTest lets receivers (DJs, curators and labels) collect unreleased music through a permanent link, and lets senders deliver original audio files to them. It's currently a private beta and may change or be unavailable."]],
        [
          "If you send music",
          [
            "Only upload music you own or are authorised to share. You keep all rights to your music.",
            "You give the receiver you chose permission to listen to, download and evaluate the track, including playing it for consideration in their sets, unless you agree otherwise with them.",
          ],
        ],
        [
          "If you receive music",
          [
            "Use tracks you receive only to evaluate and, where the sender agrees, play them. Don't redistribute, sell or publish them.",
            "You're responsible for how you use contact details senders share with you.",
          ],
        ],
        [
          "Acceptable use",
          [
            "No malware, spam, harassment or content that infringes someone else's rights. We may remove content, block senders or suspend accounts that break these rules.",
          ],
        ],
        [
          "Beta invites",
          ["Sign-up is by invitation during the beta. Personal invites work once, for the email address they were sent to. Don't sell or publish invite codes."],
        ],
        [
          "Your account",
          [
            "Keep your password safe and turn on two-factor sign-in if you can. You're responsible for activity on your account. We may suspend an account that breaks these terms or puts other users at risk; suspension takes your link offline but doesn't delete your data.",
          ],
        ],
        [
          "Plans",
          ["Plans limit how many active songs you can hold. Paid billing isn't enabled during the beta. We'll give notice before charging anything."],
        ],
        ["Liability", ["The beta is provided as is. Keep your own copies of anything important."]],
      ]}
    />
  );
}
