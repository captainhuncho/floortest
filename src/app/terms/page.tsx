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
            "FloorTest lets receivers collect unreleased music through a receiving link, and lets senders deliver original audio files to them. It's currently a private beta and may change or be unavailable.",
            "Everyone who uses FloorTest is a user. Users are one of two kinds: receivers, who have an account and a link that collects music (DJs, curators, labels), and senders, who send music to a receiver's link. These terms apply to all users. You must be 18 or over to use FloorTest.",
          ],
        ],
        [
          "If you send music",
          [
            "Only send music you own or are authorised to share. You keep all rights to your music.",
            "By sending a track you give the receiver you chose permission to listen to it, download it and evaluate it. They may also play it in their DJ sets, live performances and broadcasts, but only if you allow that when you send it (the box on the send form). Otherwise it's for evaluation only.",
            "If the receiver's brief says sharing with colleagues is allowed when you send, they may also share your track with colleagues who have FloorTest accounts, through a private link that expires after 7 days. Sharing is only for promotion, and for playing your track in DJ sets if you allowed that. Colleagues can listen; they can also download it only if the receiver was on a paid plan when you sent it, and you're told which before you send. Colleagues are bound by these Terms like any user: they may not pass it on or release it commercially without a signed agreement with you. You can see on your receipt when it's shared.",
            "The receiver may not release, distribute, sell, license or upload your track as a release on any platform without a separate written agreement with you.",
          ],
        ],
        [
          "If you receive music",
          [
            "Use tracks you receive only as described above. Don't release, distribute, sell or publish them without a written agreement with the sender. Share a track with colleagues only through FloorTest's share link, only for tracks sent while your brief allowed sharing, and only for promotion and DJ sets. If you received a track through a colleague's share link, the same rules apply to you.",
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
            "Referral bonuses such as extra track slots are part of the beta and may be changed or withdrawn later.",
            "The Verified mark means we checked that the account controlled the linked profile when it was verified. It isn't an endorsement or a guarantee of identity, and we can remove it at any time.",
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
          [
            "Plans limit how many active tracks you can hold. Paid billing isn't enabled during the beta. We'll give at least 30 days' notice before charging anything, and you can leave without paying.",
            "Free use of Pro or Team during the beta is a temporary trial, not a gift, a purchase or a lifetime plan. It has no cash value, can't be sold, transferred or exchanged, and ends when paid plans start. The same applies to referral bonuses and extra track slots.",
          ],
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
            "These terms are governed by the laws of Ghana. If you're a consumer, you keep any protections the law of the country you live in gives you, and can bring claims in your local courts.",
          ],
        ],
      ]}
    />
  );
}
