import "server-only";
import { LEGAL } from "./legal";
import { switchOn } from "./switches";

/**
 * The legal wording for private sharing (collection share links) and team review, from the lawyer brief of 11 Oct
 * 2026 (docs/legal/sharing-brief-2026-10-11.md, section 4). Shown on the Terms, Privacy and Cookie pages only while
 * the "sharing" switch is on, in place of the 1 Oct colleague wording. Paste the lawyer's redlines here and set
 * `updated` to their date before switching sharing on; that date becomes the Terms version new accounts accept.
 */
export const SHARING_LEGAL = {
  updated: "11 October 2026",
  terms: {
    senderSharing:
      "Private sharing. If the receiver's collection allows private sharing when you send, the receiver may let people they choose hear your track through a private FloorTest link. These can be people they add by email address, by company email domain or by FloorTest username, and people who ask and are approved. Each person must confirm their email address and accept FloorTest's rules before listening. The receiver decides whether each person can only listen or can also download the original file, and for how long (up to 90 days, or until the receiver ends it). Private sharing never makes your track public. Nobody given access may release, sell, distribute, upload or publish it without a signed agreement with you. The receiver can end anyone's access at any time, and you can stop private sharing of your track from your receipt. Tracks you sent before private sharing existed are only shared this way if you agree to it for that track.",
    senderTeam:
      "The receiver's team. If the receiver uses FloorTest's team review, people they invite to their team (FloorTest account holders) may listen to tracks sent to that collection, comment on them and help the receiver decide. They can't download them or contact you through FloorTest.",
    receiver:
      "Sharing what you receive. Share received music only through FloorTest's share links or team review, and only with people you know and trust to keep it private, for listening and evaluation. You're responsible for who you add, including everyone at a company domain you add. Don't post a share link publicly. If you think a link has spread, reset or revoke it. Remove access promptly when a sender asks.",
    recipients: [
      "Your access is personal and can be ended at any time. Don't forward the link or your code, and don't record, copy, publish, upload, distribute or sell the music.",
      "If you were allowed to download, use the files only for the purpose they were shared for, and delete them when your access ends or when asked.",
      "The owner of the collection can see when you open it and what you play and download.",
    ],
  },
  privacy: {
    sender:
      "Your name, email and track are shared with the receiver you sent it to. If their collection allowed private sharing when you sent it, the receiver may also let people they name hear your track (and download it, if the receiver allows). Those people see the track title and artist, not your email. If the receiver uses team review, their invited teammates hear it too. The receiver decides what to do with your track and is responsible for how they use your contact details.",
    recipients: [
      "When a FloorTest user shares a collection with you, they give us your email address (or your company's domain, or your FloorTest username). When you open the link, we email you a code to confirm your address.",
      "We record your email address, when you accepted the access notice (and which version), each visit, which tracks you played and downloaded, and, if you ask to join, your name and note. We use this to let only the right people in and to protect unreleased music (lawful basis: legitimate interests, yours, the collection owner's and the artists').",
      "The collection owner sees who opened their collection and what each person played and downloaded. The artists don't see your details.",
      "We delete codes within a day. Your visits and activity are deleted a year after the link ends. A request to join is deleted a year after it's answered; declines and blocks are kept while the collection exists, so the limits keep working.",
    ],
    team: "If you're on someone's team, we keep your votes, comments and shortlist picks and show them to the collection owner and their team.",
  },
  cookies: [
    "ft_lp_<link>: remembers the email address you just confirmed with a code, for one shared collection only. Strictly necessary. Lasts 10 minutes.",
    "ft_ls_<link>: keeps your verified visit to a shared collection. Strictly necessary. Lasts up to 12 hours.",
    "floortest_next: brings you back to a shared page after you log in. Strictly necessary. Lasts 1 hour.",
  ],
};

/** Whether the legal pages show the private-sharing wording (it goes live with the "sharing" switch). */
export const sharingWording = () => switchOn("sharing");

/** The Terms version shown on the legal pages and recorded when someone signs up. */
export async function termsVersion() {
  return (await sharingWording()) ? SHARING_LEGAL.updated : LEGAL.updated;
}
