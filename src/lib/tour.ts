import type { AccountType } from "./account-types";

/**
 * What FloorTest is and how to use it, in one place (owner, 6 Nov): the first-visit tour on the Floor and the How
 * FloorTest works page show the same steps. Onboarding's one job is the first track within 48 hours (PRODUCT.md), so
 * the tour ends on sharing the link. Words follow docs/brand-voice.md: "track", Keep / Not for me, no exclamation marks.
 */
export type TourStep = { id: string; title: string; lines: [string, string]; image: string; alt: string };

export const TOUR_STEPS: TourStep[] = [
  {
    id: "link",
    title: "Your link is your inbox",
    lines: [
      "Senders open your link and upload the original file. They don't need an account.",
      "Each sender gets an honest receipt: Delivered, Listened, Downloaded, Played out.",
    ],
    image: "/tour/link.webp",
    alt: "A demo link page: the callout brief and a Choose WAV or MP3 button",
  },
  {
    id: "floor",
    title: "The Floor shows what needs you",
    lines: [
      "New tracks, the next one to hear, and how your week is going.",
      "A track waiting more than 5 days turns amber, so nothing sits forgotten.",
    ],
    image: "/tour/floor.webp",
    alt: "The Floor with tiles for waiting and kept tracks, and the next track to hear",
  },
  {
    id: "queue",
    title: "Keep or Not for me",
    lines: [
      "In the Review Queue, play a track, then press Keep or Not for me (K or X on a keyboard).",
      "Your decisions stay private. Senders see Listened, Downloaded, Played out and any reply you send.",
    ],
    image: "/tour/queue.webp",
    alt: "The Review Queue with a track open and the Keep and Not for me buttons",
  },
  {
    id: "collections",
    title: "Collections for callouts",
    lines: [
      "Optional. A collection adds a brief to your link: genres, BPM and a closing date.",
      "Senders see what you're after, so more of what lands fits.",
    ],
    image: "/tour/collections.webp",
    alt: "Collections, each with its state, closing date and BPM range",
  },
  {
    id: "prepare",
    title: "Take kept tracks to your set",
    lines: [
      "Prepare downloads your kept tracks as one named folder with a playlist, and Rekordbox XML if you want it.",
      "Mark what you played, and the sender's receipt says Played out.",
    ],
    image: "/tour/prepare.webp",
    alt: "Prepare with Download kept and the list of kept tracks",
  },
];

/** The last card: the one thing to do next. */
export const TOUR_FINISH = {
  title: "Share your link",
  line: "Your first track arrives when someone has your link. Put it in your bio, a story or a callout.",
};

/** One line for the account type picked at sign-up (changeable in Settings). */
export const TOUR_TIPS: Record<AccountType, string> = {
  dj: "Keep tracks through the week, then download them as one crate before your set.",
  producer_dj: "Keep what you'd play, and mark what you played so the producer knows it reached a floor.",
  ar: "Run each callout as its own collection with a closing date, so the queue stays one brief at a time.",
  label: "Give each A&R callout its own collection and brief, so demos arrive already sorted.",
  radio: "Keep tracks for the next show, then download them together from Prepare.",
  artist: "Share your link with collaborators, so versions and stems land in one place as original files.",
  curator: "Keep tracks for your next playlist or mix, and mark them played so senders hear back.",
  music_pro: "Keep what you want to pass on, and reply from the Review Queue so senders aren't left waiting.",
};

/** The tip for a desk, or none when the type isn't set. */
export const tourTip = (kind: string | null | undefined) => (kind && Object.hasOwn(TOUR_TIPS, kind) ? TOUR_TIPS[kind as AccountType] : null);

/** For How FloorTest works: habits that make the desk work well, each true of today's product. */
export const TOUR_HABITS: { title: string; line: string; href?: string; link?: string }[] = [
  { title: "Put your link where senders look", line: "Your bio, a story, a callout post. The Floor has a ready caption and a QR code.", href: "/dashboard/floor", link: "Open the Floor" },
  { title: "Decide within a few days", line: "Senders see when you listened. A quick Keep or Not for me keeps the queue short and senders sending." },
  { title: "Use the keyboard on a computer", line: "K keeps, X is Not for me, R opens a reply. Every shortcut is listed in Settings.", href: "/dashboard/settings/account", link: "See shortcuts" },
  { title: "Going away? Pause your link", line: "Senders see you're on a break and when you're back, instead of sending into silence.", href: "/dashboard/account", link: "Open Account" },
  { title: "Protect your desk", line: "Turn on two-factor sign-in, so a stolen password isn't enough.", href: "/dashboard/settings/security", link: "Open Security" },
];
