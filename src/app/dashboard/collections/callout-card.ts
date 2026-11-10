export type CardFormat = "story" | "square";

/** The words to post with the card. The link is the same one printed on the card. */
export function cardCaption(collectionName: string, link: string): string {
  return `Sending me music for ${collectionName}? Send the track here: ${link}. You'll know when I've listened.`;
}

const BLOCKED: Record<string, string> = {
  closed: "This callout has closed, so there's no card to share.",
  full: "This callout is full, so there's no card to share.",
  paused: "This callout is paused. Open it again to share a card.",
  unavailable: "This callout can't be shared right now.",
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
