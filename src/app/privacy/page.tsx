import { LegalPage } from "@/components/LegalPage";
import { RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";

export const metadata = { title: "Privacy Policy (draft) — FloorTest" };

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="27 September 2026"
      sections={[
        [
          "Receivers (account holders)",
          [
            "We store your name, email, link name, a hashed password, your public-page settings and cover photo, your notification preferences, and a record of what you do with tracks (listens, downloads, decisions, notes and replies).",
          ],
        ],
        [
          "Senders",
          [
            "When you send a track we store your name, email, the audio file, the details you enter (title, artist, message, release and demo status) and an analysis of the audio (waveform, length, estimated BPM).",
            "We record your IP address with each upload to enforce rate limits. These records are deleted after 48 hours.",
            "Your name and email are shared with the receiver you sent the track to, and with no one else.",
            "If you ask for your sender history, we email a private link that works for 24 hours. It shows your tracks and the signals you were promised (delivered, listened, downloaded, replied, played out), never a receiver's private decisions.",
          ],
        ],
        [
          "Account security",
          [
            "We keep a log of sign-ins and account changes so you can review them under Activity. If you turn on sign-in alerts (on by default), each alert email includes the time, the type of device and browser, and the network address it came from.",
            "If you turn on two-factor sign-in, we store your authenticator key encrypted, and your recovery codes only as one-way hashes.",
            "If you ask to be verified, we store the public profile links you give us and a short code you place in one bio. FloorTest staff look at those public profiles to check it's you. We don't ask for ID documents.",
          ],
        ],
        [
          "Waitlist, feedback and messages",
          [
            "If you join the waitlist we store your name, email, what you do and any link you give, to decide who to invite and to email you an invite. Feedback sent from the dashboard and messages sent through Contact us are stored so the FloorTest team can reply and follow up.",
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
            `Audio a receiver hasn't decided on is deleted ${RETAIN_UNREVIEWED_DAYS} days after delivery. Audio marked “could be better” is deleted ${RETAIN_PASSED_DAYS} days later. Kept audio stays until the receiver deletes it.`,
            "Track history (for example, that a track was delivered and listened to) stays after the audio is deleted, so both sides keep an accurate record.",
          ],
        ],
        [
          "Emails",
          [
            "We email senders about their tracks (delivered, listened, downloaded, replied, played out) and receivers about new tracks, reminders about tracks left unheard for two weeks, and account alerts, according to their settings. We keep a copy of each email so receivers can see what was sent on their behalf.",
          ],
        ],
        [
          "Cookies and local storage",
          [
            "We use a cookie to keep you signed in, a short-lived cookie during the two-factor step of signing in, and one to remember your preferred Review Queue layout. The upload page remembers your name and email in your own browser so you don't retype them. We don't use advertising or tracking cookies.",
          ],
        ],
        [
          "Where it's stored",
          [
            "FloorTest runs on providers acting on our behalf: Vercel (hosting), Supabase (database, London, UK), Cloudflare R2 (audio files and cover photos, private storage) and Resend (email delivery). Files are only ever served through short-lived, signed links.",
          ],
        ],
        ["Your choices", ["Receivers can delete their account and every stored file from Settings at any time. Senders can ask us to delete their data through the Contact us page."]],
      ]}
    />
  );
}
