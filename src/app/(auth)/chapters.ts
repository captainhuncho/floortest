/**
 * The welcome story (owner, 17 Nov, option 54): what FloorTest does, one chapter at a time, before anyone is asked to
 * sign up. Shown at /signup (step 1) and, as a quiet caption, beside the desktop log-in form.
 */
export type Chapter = { title: string; line: string };

const CHAPTERS: readonly Chapter[] = [
  { title: "One link for every track you're sent.", line: "Share it anywhere. Every track sent to it lands on your desk." },
  { title: "Ask for what you need.", line: "Run a callout for a set, a label or a show. What's sent to it lands in its own collection." },
  { title: "Senders don't need an account.", line: "They open your link, drop a track and get an honest receipt." },
  { title: "Listen, then Keep or Not for me.", line: "Every track lands on your desk." },
  { title: "They see when you've listened.", line: "An honest receipt for every track. Your decision stays yours." },
  { title: "Ready for your next set.", line: "Download what you kept, or a whole collection, as a named folder with a playlist. Rekordbox XML too." },
];

/** Only while receivers can send from FloorTest (the `send_music` switch; off during the beta). */
const SEND_CHAPTER: Chapter = { title: "Send your own music too.", line: "Send to any FloorTest link and get the same honest receipt." };

export const storyChapters = (sendOn: boolean): readonly Chapter[] => (sendOn ? [...CHAPTERS, SEND_CHAPTER] : CHAPTERS);

export const STORY_END: Chapter = {
  title: "Your link, your desk.",
  line: "That's FloorTest: one link for the music you're sent, an honest receipt for every sender, and what you keep ready for your next set.",
};
