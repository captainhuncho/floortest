export type CardFormat = "story" | "square";

/** The callout a share sheet can make a card for. */
export type ShareCardTarget = { collectionId: number; collectionName: string };

/**
 * Which callout the link's Share button offers as a card: the receiving callout, while it takes tracks, for the account
 * owner only and never in a staff view. The same rule as the card route, so the button never offers a card it refuses.
 */
export function shareCardTarget(o: { isOwner: boolean; viewingAs: boolean; active: { id: number; name: string } | null | undefined; blocked: boolean }): ShareCardTarget | undefined {
  if (!o.isOwner || o.viewingAs || !o.active || o.blocked) return undefined;
  return { collectionId: o.active.id, collectionName: o.active.name };
}

/** The words to post with the card. The link is the same one printed on the card. */
export function cardCaption(collectionName: string, link: string): string {
  return `Sending me music for ${collectionName}? Send the track here: ${link}. You'll know when I've listened.`;
}

const BLOCKED: Record<string, string> = {
  closed: "This callout has closed, so there's no card to share.",
  full: "This callout is full, so there's no card to share.",
  paused: "This callout is paused. Open it again to share a card.",
  unavailable: "This callout can't be shared right now.",
  "invite-only": "Cards are off while FloorTest is invite-only. Share the link instead.",
};

/** What the sheet says when the card route refuses, and whether trying again could help. */
export function cardProblem(status: number, reason: string | null, retryAfter: string | null): { message: string; canRetry: boolean } {
  if (status === 409) return { message: BLOCKED[reason ?? ""] ?? BLOCKED.unavailable, canRetry: false };
  if (status === 403) return { message: "Verify your email to share a card.", canRetry: false };
  if (status === 429) {
    const seconds = Number(retryAfter);
    const wait = seconds > 0 ? `in ${Math.ceil(seconds / 60)} min` : "soon";
    return { message: `That's a lot of cards. Try again ${wait}.`, canRetry: true };
  }
  return { message: "Couldn't make the card. Try again.", canRetry: true };
}
