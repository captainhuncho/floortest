import { LegalPage } from "@/components/LegalPage";
import { RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";

export const metadata = { title: "Privacy Policy (draft) — FloorTest" };

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="26 September 2026"
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
            "We email senders about their tracks (delivered, listened, downloaded, replied) and receivers about new tracks and alerts, according to their notification settings. We keep a copy of each email so receivers can see what was sent on their behalf.",
            "Email delivery uses a third-party provider (Resend).",
          ],
        ],
        [
          "Cookies and local storage",
          [
            "We use one cookie to keep you signed in and one to remember your preferred Submissions layout. The upload page remembers your name and email in your own browser so you don't retype them. We don't use advertising or tracking cookies.",
          ],
        ],
        [
          "Where it's stored",
          [
            "Account data and track history are kept in a hosted Postgres database, and audio files and cover photos in private cloud storage. Both are run by infrastructure providers acting on our behalf. Files are only ever served through short-lived, signed links.",
          ],
        ],
        ["Your choices", ["Receivers can delete their account and every stored file from Settings at any time. Senders can ask us to delete their data through the Contact us page."]],
      ]}
    />
  );
}
