import { LegalPage } from "@/components/LegalPage";
import { RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Privacy Policy (draft) — FloorTest" };

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={LEGAL.updated}
      sections={[
        [
          "Who we are",
          [
            `FloorTest is operated by ${LEGAL.operator}. We're the data controller for the personal data described here. Contact us about anything in this policy, including your rights, at ${LEGAL.email}.`,
          ],
        ],
        [
          "Who this covers",
          [
            "Everyone who uses FloorTest is a user. Users are one of two kinds: receivers, who have an account and a link that collects music (DJs, curators, labels), and senders, who send music to a receiver's link. Senders don't need an account, and account holders can send too.",
            "FloorTest is for people aged 18 and over. We don't knowingly collect data from anyone younger; if we learn we have, we delete it.",
          ],
        ],
        [
          "Receivers (account holders)",
          [
            "We store your name, email, link name, a hashed password, your public-page settings and cover photo, your notification preferences, and a record of what you do with tracks (listens, downloads, decisions, notes and replies).",
            "We use this to provide your account (lawful basis: our contract with you).",
          ],
        ],
        [
          "Senders",
          [
            "When you send a track we store your name, email, the audio file, the details you enter (title, artist, message, release and mix status) and an analysis of the audio (waveform, length, estimated BPM). If you send from your FloorTest account, we link the track to that account.",
            "Your name, email and track are shared with the receiver you sent it to. If their brief said sharing with colleagues was allowed when you sent it, the receiver may also let colleagues with FloorTest accounts hear your track (and download it, if you were told so before sending). Colleagues see the track title and artist, not your email. The receiver decides what to do with your track and is responsible for how they use your contact details.",
            "We use your details to deliver your track and to send you the receipt and updates you're promised (lawful basis: our legitimate interest in running the service you chose to use, and yours in knowing what happened to your music).",
            "If you ask for your sender history, we email a private link that works for 24 hours. It shows your tracks and the signals you were promised (delivered, listened, downloaded, replied, played out), never a receiver's private decisions.",
          ],
        ],
        [
          "Shared tracks (colleagues)",
          [
            "When a receiver shares a track with you, you need a FloorTest account to listen. We record which account played or downloaded it and when, and show this to the receiver who shared it, so they know who heard their shared track (lawful basis: legitimate interest in protecting unreleased music).",
          ],
        ],
        [
          "Preventing abuse",
          [
            "We record IP addresses (and, for some limits, email addresses) when you upload, sign in, sign up, reset a password or use the contact form, so we can limit spam and attacks. We delete these records within 3 days (lawful basis: legitimate interest in keeping the service secure).",
          ],
        ],
        [
          "Account security",
          [
            "We keep a log of sign-ins and account changes so you can review them under Activity. If you turn on sign-in alerts, each alert email includes the time, the type of device and browser, and the network address it came from.",
            "If you turn on two-factor sign-in, we store your authenticator key encrypted, and your recovery codes only as one-way hashes.",
            "If you ask to be verified, we store the public profile links you give us and a short code you place in one bio. FloorTest staff look at those public profiles to check it's you. We don't ask for ID documents.",
          ],
        ],
        [
          "Waitlist, feedback and messages",
          [
            "If you join the waitlist we store your name, email, what you do and any link you give, to decide who to invite and to email you an invite. Feedback sent from the dashboard and messages sent through Contact us are stored so we can reply and follow up.",
          ],
        ],
        [
          "Who at FloorTest can see what",
          [
            "A small number of FloorTest staff can access the service to run it: to answer support requests, look into problems and act on abuse reports. Staff access requires two-factor sign-in, and every staff action (including viewing a receiver's desk to help them) is logged. Staff viewing a desk can't change anything, download files or trigger any signal to senders.",
            "We also log technical errors, which can include the page or request involved, to keep the service working.",
          ],
        ],
        [
          "How long we keep it",
          [
            `Audio a receiver hasn't decided on is deleted ${RETAIN_UNREVIEWED_DAYS} days after delivery. Audio marked “not for me” is deleted ${RETAIN_PASSED_DAYS} days later. Kept audio stays until the receiver deletes it.`,
            "Track history and sender details (for example, that a track was delivered and listened to, and who sent it) stay for as long as the receiver's account exists, so both sides keep an accurate record. They're deleted when the receiver deletes their account, or sooner if a sender asks us.",
            "When something is deleted it's removed from the live service straight away and from our database backups within 30 days.",
          ],
        ],
        [
          "Emails",
          [
            "We email senders about their tracks (delivered, listened, downloaded, replied, played out) and receivers about new tracks, reminders about tracks left unheard for two weeks, and account alerts, according to their settings. We keep a copy of each email for 90 days so receivers can see what was sent on their behalf. We don't send marketing without your agreement.",
          ],
        ],
        [
          "Cookies and local storage",
          [
            "We use a cookie to keep you signed in, a short-lived cookie during the two-factor step of signing in, one to remember your preferred Review Queue layout, and one for your Day or Night appearance. The upload page remembers your name and email in your own browser so you don't retype them. These are all needed for features you ask for, so we don't show a cookie banner. Each one is listed, with how long it lasts, in our Cookie Policy at /cookies. We don't use advertising or tracking cookies. We count page visits with Vercel Web Analytics, which sets no cookies and doesn't identify you. We count which parts of FloorTest each account uses and how often, by day (for example, Queue or List view), to learn what's useful, and delete those counts after about 13 months. We also measure how quickly pages load and respond to taps (the page, the kind of button and the time in milliseconds, with no account, IP address or content), and delete those records after 30 days. When a page crashes or runs slowly, a technical report (what broke or how long each step took, without your IP address or what you typed) goes to Sentry so we can fix it.",
          ],
        ],
        [
          "Who processes data for us",
          [
            "FloorTest runs on providers acting on our instructions: Vercel (hosting, run from London), Supabase (database, London), Cloudflare R2 (audio files and cover photos, private storage) and Resend (email delivery). Files are only ever served through short-lived, signed links. The full list, including Sentry, is on our Sub-processors page at /subprocessors.",
            "Vercel, Cloudflare and Resend are US companies, so some data may be handled in the United States. Data about UK and EU users can also be handled outside those regions. Where it goes to the US we rely on the UK–US data bridge or the standard contractual safeguards those providers offer.",
          ],
        ],
        [
          "Your rights",
          [
            `You can ask us for a copy of your data, to correct it, to delete it, to restrict or object to how we use it, or to receive it in a portable format. Receivers can delete their account and every stored file from Settings at any time. Senders and anyone else can email ${LEGAL.email}. We'll reply within one month.`,
            "If you're unhappy with how we handle your data you can complain to the Data Protection Commission of Ghana (dataprotection.org.gh), or to the data protection authority where you live, such as the Information Commissioner's Office (ico.org.uk) in the UK.",
          ],
        ],
        [
          "Changes",
          ["If we change this policy in a way that matters, we'll tell account holders by email before it takes effect and update the date at the top."],
        ],
      ]}
    />
  );
}
