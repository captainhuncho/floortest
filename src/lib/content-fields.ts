import { parseSizes, sizesString } from "./text-size";

/**
 * Wording and images on public pages, edited in Admin → Site content. Each field's `start` is the text the page
 * had when the editor was built; a field nobody has edited shows that. `{name}` placeholders are filled in by the page.
 * This file holds the field definitions and how a saved value is cleaned, with no request code, so tests and the
 * content writer can use it directly; pages read their wording through content.ts (siteCopy).
 */
type Kind = "line" | "text" | "pairs" | "image";
export type Field = { label: string; kind: Kind; start: string; vars?: string[]; hint?: string };

const f = (label: string, start: string, more: Partial<Field> = {}): Field => ({ label, kind: "line", start, ...more });
const text = (label: string, start: string, more: Partial<Field> = {}) => f(label, start, { kind: "text", ...more });
/** Every page's text sizes (see text-size.ts): set with the size picker on the page; empty means every text at its designed size. */
const sizes = () => f("Text sizes", "", { hint: "Easiest to change on the page itself: pick a text, then Smaller, Default, Larger or Largest. Format: field:sm, field:lg or field:xl, separated by commas." });

/** Home page sections that can be reordered or hidden (the header, hero and footer always stay put). */
export const HOME_SECTIONS = {
  deck: "Cued up like a deck",
  log: "One track's week",
  desk: "Two sides of the desk",
  preview: "Product preview",
  how: "How it works",
  journey: "Receipts",
  private: "Privacy",
  plans: "Plans",
  waitlist: "Waitlist",
  faq: "Questions",
} as const;
export type HomeSection = keyof typeof HOME_SECTIONS;
const SECTION_IDS = Object.keys(HOME_SECTIONS) as HomeSection[];

/** "how,-faq,preview" → every section once, in that order, missing ones appended; a leading "-" hides it. */
export function sectionOrder(s: string): { id: HomeSection; hidden: boolean }[] {
  const seen = new Set<string>();
  const out: { id: HomeSection; hidden: boolean }[] = [];
  for (const raw of s.split(",")) {
    const hidden = raw.trim().startsWith("-");
    const id = raw.trim().replace(/^-/, "") as HomeSection;
    if (SECTION_IDS.includes(id) && !seen.has(id)) {
      seen.add(id);
      out.push({ id, hidden });
    }
  }
  // A section added after the order was saved goes in at its default place, not at the end.
  for (const id of SECTION_IDS) if (!seen.has(id)) out.splice(Math.min(SECTION_IDS.indexOf(id), out.length), 0, { id, hidden: false });
  return out;
}
export const orderString = (o: { id: HomeSection; hidden: boolean }[]) => o.map((x) => `${x.hidden ? "-" : ""}${x.id}`).join(",");

export const SITE_PAGES = {
  home: {
    label: "Home",
    path: "/",
    fields: {
      sections: f("Section order", "deck,log,desk,private,plans,waitlist,faq,-journey,-how,-preview", { hint: "Easiest to change on the page itself (Edit on the page). A \"-\" in front hides a section." }),
      eyebrow: f("Line above the headline", "The receiving desk for people who live on new music."),
      headline: f("Headline", "From the studio"),
      headline_italic: f("Headline, second line (italic)", "to the floor."),
      intro: text("Intro", "One link for every track you're sent. Play it, keep it, answer the sender. No more DMs."),
      hero_example: f("Hero: example link", "See an example"),
      hero_beta: f("Hero: small line under the buttons", "Private beta"),
      hero_invite_link: f("Hero: invite link (invite-only)", "Have an invite? Claim your link"),
      hero_your_link: f("Hero card: label (signed in)", "Your link"),
      hero_route_label: f("Hero card: routing line", "Same link. You choose where it routes."),
      deck_title: f("Cued up like a deck: title", "Cued up like a deck."),
      deck_intro: text("Cued up like a deck: intro", "Play, keep, next. On your phone in the booth or at your desk."),
      deck_readouts: text("Cued up like a deck: readouts", "Order\nOldest first\n\nListened\n30 s\n\nKeep\n→ crate", { kind: "pairs", hint: "Each readout: a label line, then its value. Leave a blank line between readouts. Three fit best." }),
      log_title: f("One track's week: title", "Sent during the week. Played during the weekend."),
      log_rows: text(
        "One track's week: rows",
        "Tue 18:00 | Callout open | | Reads your brief\nWed 21:40 | Lands in Up next | | Delivered\nThu 00:12 | 30 seconds in | Real playback only | Listened\nThu 00:13 | Keep | |\nSat 19:30 | Into the crate | Rekordbox XML and M3U8 | Downloaded\nSun 01:12 | On the floor | | Played out",
        { kind: "pairs", hint: "One row per line: time | what happens | small detail | what the sender sees. Leave a part empty to skip it. Each row keeps its picture by position (six pictures)." },
      ),
      log_private: f("One track's week: when the sender sees nothing", "Nothing. Your call stays private."),
      desk_title: f("Two sides of the desk: title", "Two sides of one desk."),
      desk_intro: text("Two sides of the desk: intro", "You decide. The sender knows what happened, and nothing more."),
      desk_neon: f("Two sides of the desk: neon sign", "send me music", { hint: "The large faint sign behind the pictures. Screen readers skip it." }),
      desk_caption_dj: f("Two sides of the desk: laptop caption", "The DJ's desk"),
      desk_caption_sender: f("Two sides of the desk: phone caption", "The sender's receipt"),
      preview_label: f("Product preview: label", "Live product preview"),
      preview_hint: f("Product preview: hint", "Click a track"),
      preview_image: f("Product preview image", "", { kind: "image", hint: "Replaces the clickable product preview below the receipts section. Leave empty to keep the clickable preview." }),
      preview_alt: f("Product preview image: description", "The FloorTest review queue", { hint: "Read aloud by screen readers." }),
      how_title: f("How it works: title", "Share once. Decide fast."),
      how_steps: text(
        "How it works: steps",
        "Share one link\nPut it in your bio or a callout. Senders upload the original WAV or MP3, no account needed.\n\nDecide fast\nPlay, Keep or Not for me, and the next track is already up. Kept tracks export straight to Rekordbox.",
        { kind: "pairs", hint: "Each step: a title line, then its text. Leave a blank line between steps." },
      ),
      journey_title: f("Receipts: title", "Know what happened next."),
      journey_intro: text("Receipts: intro", "Every sender gets a private receipt. FloorTest records every step between sending a track and hearing back."),
      journey_steps: text(
        "Receipts: steps",
        "Delivered\nOriginal audio received safely\n\nListened\nPlayed for 30+ seconds\n\nDownloaded\nThe original file was downloaded\n\nReplied\nA message came back",
        { kind: "pairs", hint: "Each step: a title line, then its text. Leave a blank line between steps. The icons stay in order (four)." },
      ),
      private_title: f("Privacy section: title", "Music stays between the people you choose."),
      private_points: text(
        "Privacy section: points",
        "Your calls stay private\nSenders see listens, downloads and replies. Never Keep or Not for me.\n\nYou control intake\nPause your link, close a callout, block anyone.\n\nClear retention\nUndecided tracks are deleted after 90 days, Not for me 30 days after you mark it. Kept tracks stay until you delete them.",
        { kind: "pairs", hint: "Each point: a title line, then its text. Leave a blank line between points." },
      ),
      plans_kicker: f("Plans: small label", "Plans"),
      plans_title: f("Plans: headline (beta)", "Start free. Grow when your desk does.", { hint: "Shown while the Billing switch is off." }),
      plans_intro: text("Plans: intro (beta)", "Free for 20 active tracks. Pro and Team for bigger desks and crews."),
      plans_title_launch: f("Plans: headline (after launch)", "Free while you find your sound.", { hint: "Shown once the Billing switch is on." }),
      plans_intro_launch: text("Plans: intro (after launch)", "Free holds 20 tracks at a time, for good. Pro and Team make room for hundreds more and bring your crew in."),
      plans_compare: f("Plans: link to the pricing page", "Compare all plans →"),
      waitlist_title: f("Waitlist: title", "No invite yet?"),
      waitlist_intro: text("Waitlist: intro", "Invites go out a few at a time. Leave your details and we'll email yours."),
      footer_line: f("Footer: who it's for", "Built for DJs, producers and labels."),
      newsletter_title: f("Footer: newsletter heading", "Get the FloorTest newsletter"),
      footer_note: f("Footer: line after the copyright", "Private beta. Web · iPhone and Android soon."),
      faq_title: f("Questions: title", "Before the first track lands."),
      faq: text(
        "Questions and answers",
        "Do senders need an account?\nNo. They send with their name and email, confirm it once, and get a private receipt.\n\nWhat can senders send?\nWAV or MP3, up to 250 MB. The real file, not a streaming link.\n\nDoes your link change?\nNever. Point it at any collection, or pause it while you're away.\n\nWhat counts as \"listened\"?\n30 seconds of real playback, or a quarter of a short track. Skipping doesn't count.\n\nIs it free?\nYes, for up to 20 active tracks, for good. Pro and Team are free during the beta.",
        { kind: "pairs", hint: "Each question on its own line, the answer below it. Leave a blank line between questions." },
      ),
      sizes: sizes(),
    },
  },
  pricing: {
    label: "Pricing",
    path: "/pricing",
    fields: {
      pricing_title: f("Title", "Start free. Grow when your desk does."),
      pricing_intro: text("Intro", "Free for up to 20 active tracks, for good. Pro and Team are free during the beta. Paid plans come after it: beta receivers hear first, get at least 30 days' notice, and never lose tracks they already have."),
      pricing_back: f("Link back to home", "← Back to home"),
      sizes: sizes(),
    },
  },
  auth: {
    label: "Sign-up and log-in",
    path: "/signup",
    fields: {
      login_title: f("Log-in heading", "Back to the desk"),
      signup_title: f("Sign-up heading", "Claim your link"),
      login_intro: f("Log-in intro", "Sign in to your music desk."),
      login_code_prompt: f("Log-in: line before the code link", "No password?"),
      login_code_link: f("Log-in: code link", "Email me a sign-in code"),
      signup_intro: text("Sign-up intro", "One link for every callout. Free for up to 20 active tracks."),
      signup_invite_only: text("Sign-up: invite-only note", "FloorTest is invite-only during the beta: use the sign-up link in your invite email, with the email it went to.", { hint: "Shown while sign-up is invite-only." }),
      signup_waitlist_link: f("Sign-up: waitlist link (invite-only)", "No invite? Join the waitlist"),
      sizes: sizes(),
    },
  },
  link: {
    label: "Public link",
    path: "/maxwell",
    fields: {
      kicker: f("Line above the receiver's name", "Send music to"),
      receiving_for: f("Before the callout's name", "Receiving for"),
      looking_for: f("Brief heading", "What I'm looking for"),
      bullet_files: f("Note: files", "WAV or MP3, up to 250 MB. No account needed."),
      bullet_private: f("Note: who hears it", "Only {receiver} can hear or download your file.", { vars: ["receiver"] }),
      bullet_private_team: f("Note: who hears it (with a team)", "Only {receiver} and the people on their FloorTest team can hear or download your file.", { vars: ["receiver"] }),
      bullet_retention: f("Note: deletion", "Files that aren't kept are deleted within {days} days.", { vars: ["days"] }),
      bullet_receipt: f("Note: receipt", "You'll get a private receipt and an email when it's listened to, downloaded or replied to."),
      closed_note: f("When the link is closed", "This link stays the same. Check back soon."),
      impersonation_prompt: f("Footer: impersonation question", "Not sure this is really {receiver}?", { vars: ["receiver"] }),
      impersonation_link: f("Footer: impersonation link", "Report impersonation"),
      sizes: sizes(),
    },
  },
  receipt: {
    label: "Receipts",
    path: "/sent",
    fields: {
      kicker: f("Line above the track title", "Private receipt"),
      todo_title: f("Heading: things to do", "For you"),
      history_title: f("Heading: history", "What's happened"),
      means_title: f("Link: what the steps mean", "What these mean"),
      details_title: f("Link: details", "Details"),
      retention_note: f("Details: deletion", "Files are deleted within {days} days of delivery unless {receiver} keeps them.", { vars: ["days", "receiver"] }),
      private_note: f("Privacy note", "Only {receiver} can hear or download your file. It's never shared publicly.", { vars: ["receiver"] }),
      footer: text("Footer", "No account needed. Bookmark this page to check in any time, or [see everything you've sent] in one place.", {
        hint: "Words in [square brackets] link to the sender's history page.",
      }),
      invite_prompt: f("Footer invitation: question", "DJ too?"),
      invite_link: f("Footer invitation: link", "Get your own link"),
      invite_after: f("Footer invitation: after the link", ", so music sent to you arrives like this."),
      sizes: sizes(),
    },
  },
} satisfies Record<string, { label: string; path: string; fields: Record<string, Field> }>;

export type SitePage = keyof typeof SITE_PAGES;
export type Copy<P extends SitePage> = Record<keyof (typeof SITE_PAGES)[P]["fields"], string>;
export type Values = Record<string, string>;
/** Fill `{name}` placeholders. Unknown names are left as they are, so a typo is visible rather than silent. */
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** "Title\nBody\n\nTitle\nBody" → [[title, body], …]. */
export const pairs = (s: string) =>
  s
    .split(/\n\s*\n/)
    .map((b) => b.trim().split("\n"))
    .filter((l) => l[0])
    .map(([t, ...rest]) => [t.trim(), rest.join(" ").trim()] as const);

/** "time | what | detail | sender" per line → rows; an empty part is null. Lines without a "what" are skipped. */
export const rows = (s: string) =>
  s
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter((p) => p[1])
    .map(([time, what, detail, sender]) => [time ?? "", what, detail || null, sender || null] as [string, string, string | null, string | null]);

/** Fields a size can be picked for: every text field of the page (not the section order, images or the sizes themselves). */
export const sizeableKeys = (page: SitePage) =>
  Object.entries(SITE_PAGES[page].fields as Record<string, Field>)
    .filter(([k, fld]) => fld.kind !== "image" && k !== "sizes" && k !== "sections")
    .map(([k]) => k);

/** Public address for an uploaded site image. */
export const siteImageUrl = (key: string) => (key ? `/api/site-image/${key.replace(/^site\//, "")}` : "");


const IMAGE_KEY = /^site\/[a-f0-9]{18}\.(jpg|png|webp)$/;

/** One field, cleaned the same way wherever it was edited (the ops form or on the page). */
export function cleanField(page: SitePage, key: string, fld: Field, raw: unknown) {
  let v = String(raw ?? "").replace(/\r\n/g, "\n").trim().slice(0, 4000);
  if (fld.kind === "image") return v && IMAGE_KEY.test(v) ? v : "";
  if (page === "home" && key === "sections") return orderString(sectionOrder(v || fld.start));
  // Only the fixed steps, only for this page's text fields: anything else in the request is dropped, never stored.
  if (key === "sizes") return sizesString(parseSizes(v, sizeableKeys(page)));
  if (!v) v = fld.start;
  return v;
}
