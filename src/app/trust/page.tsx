import { Logo } from "@/components/Logo";
import {
  LISTEN_MIN_SECONDS,
  MAX_UPLOAD_BYTES,
  RATE_PER_EMAIL_PER_DAY,
  RATE_PER_IP_PER_HOUR,
  RETAIN_PASSED_DAYS,
  RETAIN_UNREVIEWED_DAYS,
  SIGNALS,
} from "@/lib/plans";

export const metadata = { title: "Trust & Security — FloorTest" };

/** Generated from the same constants the app enforces, so it can't drift from reality. */
export default function Trust() {
  const sections: [string, string[]][] = [
    [
      "Your files",
      [
        "Only the receiver you sent a track to can play or download it. Files are never listed publicly or shared with anyone else.",
        `Files are checked for valid WAV or MP3 structure before they're accepted, up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Anything else is rejected.`,
        "Every upload is scanned for viruses on our own scanner before it reaches a desk; the file never goes to an outside scanning service. A file that fails the scan is refused, and if the scanner can't check a file, the upload is held or refused, never accepted unscanned.",
      ],
    ],
    [
      "How long we keep them",
      [
        `Tracks a receiver hasn't decided on are deleted ${RETAIN_UNREVIEWED_DAYS} days after delivery.`,
        `Tracks a receiver marks “not for me” are deleted ${RETAIN_PASSED_DAYS} days later.`,
        "Tracks a receiver keeps stay until they delete them.",
      ],
    ],
    [
      "What senders are told",
      [
        `Listened: ${SIGNALS.listened.toLowerCase()} (${LISTEN_MIN_SECONDS} seconds at most).`,
        `Downloaded: ${SIGNALS.downloaded.toLowerCase()}.`,
        `Replied: ${SIGNALS.replied.toLowerCase()}.`,
        "Keep and not-for-me decisions are private to the receiver and never shared.",
      ],
    ],
    [
      "Protecting receivers",
      [
        `Each connection can send ${RATE_PER_IP_PER_HOUR} tracks an hour, and each email address ${RATE_PER_EMAIL_PER_DAY} a day, to any one link.`,
        "Senders confirm their email address. Receivers see whether a sender is verified.",
        "Receivers can block senders and set closing dates on each callout.",
      ],
    ],
    [
      "Accounts",
      [
        "Passwords are stored as salted scrypt hashes. Sessions use HTTP-only cookies.",
        "Senders don't need an account. Their name and email are used only for receipts and updates about their tracks.",
      ],
    ],
  ];
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <Logo className="mb-12" />
      <h1 className="text-4xl font-bold tracking-tight">Trust & Security</h1>
      <p className="mt-3 text-mute">How FloorTest handles the music sent to it today.</p>
      {sections.map(([h, items]) => (
        <section key={h} className="mt-10">
          <h2 className="text-lg font-semibold">{h}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-mute">
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
