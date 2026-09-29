import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Terms of Use (draft) — FloorTest" };

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Use"
      updated={LEGAL.updated}
      sections={[
        [
          "Who we are",
          [`FloorTest is operated by ${LEGAL.operator} (“we”). Contact: ${LEGAL.email}.`],
        ],
        [
          "The service",
          [
            "FloorTest lets receivers collect unreleased music through a permanent link, and lets senders deliver original audio files to them. It's currently a private beta and may change or be unavailable.",
            "Everyone who uses FloorTest is a user. Users are one of two kinds: receivers, who have an account and a link that collects music (DJs, curators, labels), and senders, who send music to a receiver's link. These terms apply to all users. You must be 18 or over to use FloorTest.",
          ],
        ],
        [
          "If you send music",
          [
            "Only send music you own or are authorised to share. You keep all rights to your music.",
            "By sending a track you give the receiver you chose permission to listen to it, download it, evaluate it, and play it in their DJ sets, live performances and broadcasts.",
            "The receiver may not release, distribute, sell, license or upload your track as a release on any platform without a separate written agreement with you.",
          ],
        ],
        [
          "If you receive music",
          [
            "Use tracks you receive only as described above. Don't release, distribute, sell or publish them without a written agreement with the sender.",
            "You're responsible for how you use contact details senders share with you.",
            "Files aren't scanned for viruses yet. We check each file is real audio, but open downloads at your own risk and keep your security software up to date.",
          ],
        ],
        [
          "Acceptable use",
          [
            "No malware, spam, harassment, impersonation or content that infringes someone else's rights. We may remove content, block senders or suspend accounts that break these rules.",
          ],
        ],
        [
          "Copyright complaints",
          [
            `If you believe music on FloorTest was sent without the rights holder's permission, email ${LEGAL.email} with the track, the receiver's link and why you hold the rights. We'll review it promptly and remove it where appropriate.`,
          ],
        ],
        [
          "Beta invites and bonuses",
          [
            "Sign-up is by invitation during the beta. Personal invites work once, for the email address they were sent to. Don't sell or publish invite codes.",
            "Referral bonuses such as extra song slots are part of the beta and may be changed or withdrawn later.",
          ],
        ],
        [
          "Your account",
          [
            "Keep your password safe and turn on two-factor sign-in if you can. You're responsible for activity on your account.",
            "We may suspend an account that breaks these terms or puts other users at risk; suspension takes your link offline but doesn't delete your data. You can close your account at any time from Settings, which deletes your data as described in the Privacy Policy.",
          ],
        ],
        [
          "Plans and pricing",
          ["Plans limit how many active songs you can hold. Paid billing isn't enabled during the beta. We'll give at least 30 days' notice before charging anything, and you can leave without paying."],
        ],
        [
          "Liability",
          [
            "The beta is provided as is, and we can't promise it will always be available or free of errors. Keep your own copies of anything important.",
            "Nothing in these terms limits liability that can't be limited by law, including for death or personal injury caused by negligence, or for fraud. Otherwise, we aren't liable for indirect or unforeseeable loss, and while the service is free our total liability to you is limited to £100.",
          ],
        ],
        [
          "Changes and law",
          [
            "We'll tell account holders by email before any significant change to these terms takes effect.",
            "These terms are governed by the law of England and Wales. If you're a consumer, you keep any protections of the country you live in, and can bring claims in your local courts.",
          ],
        ],
      ]}
    />
  );
}
