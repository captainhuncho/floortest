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
  week: "One track's week (Sun to Fri)",
  booth: "Saturday: you play it",
  receipt: "The sender finds out",
  fair: "Fair to the people sending",
  preview: "Product preview",
  how: "How it works",
  journey: "Receipts",
  private: "Privacy",
  plans: "Plans",
  faq: "Questions",
  end: "Your link is waiting",
  waitlist: "Waitlist",
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
      sections: f("Section order", "week,booth,receipt,fair,plans,faq,end,waitlist,-private,-journey,-how,-preview", { hint: "Easiest to change on the page itself (Edit on the page). A \"-\" in front hides a section." }),
      nav_how: f("Header: link to the week", "How it works"),
      nav_plans: f("Header: link to the plans", "Plans"),
      headline: f("Headline", "From the studio"),
      headline_italic: f("Headline, second line (italic)", "to the floor."),
      intro: text("Intro", "Every track people send you, in one place. Keep what fits your set, and the person who made it hears back."),
      hero_beta: f("Hero: small line under the claim box", "Private beta"),
      hero_invite_link: f("Hero: invite link (invite-only)", "Have an invite? Claim your link"),
      hero_your_link: f("Link card: label", "Your link"),
      hero_route_label: f("Link card: routing line", "Same link. You choose where it routes."),
      loop_messages: text(
        "Hero picture: the messages",
        "This transfer has expired\ndid you get my track? | m\n47 unread\npromos_FINAL_2\nnew_mix_v3_master.wav | m\nRe: Re: Fwd: demo\ncan you send it again?\nDownload limit reached | m\nvoice note · 0:42\ncheck your message requests\nwhich version was the final? | m",
        { kind: "pairs", hint: "One message per line, shown one by one over the warehouse photo. Add \" | m\" after a message to set it in the mono type. Eleven fit; keep each one short. Screen readers skip them." },
      ),
      sun_time: f("Sunday: time", "Sun 21:00"),
      sun_title: f("Sunday: title", "One link. Point it anywhere."),
      sun_body: text("Sunday: text", "It goes in your bio once and never changes. Yesterday it opened your Friday residency. Tonight it opens the radio show callout."),
      route_rows: text("Sunday: where the link routes", "Yesterday | Friday residency\nToday | Radio show callout", { kind: "pairs", hint: "One row per line: when | where the link opens. Two rows; the second is the one it moves to." }),
      mon_time: f("Monday: time", "Mon 09:12"),
      mon_title: f("Monday: title", "It landed in one place."),
      mon_body: text("Monday: text", "Tracks came in overnight through your link. Who sent it, the BPM and the length are already there. Nothing to download first."),
      queue_title: f("Monday card: title", "Queue"),
      queue_note: f("Monday card: small line", "5 new since last night"),
      tue_time: f("Tuesday: time", "Tue 18:40 · on the bus"),
      tue_title: f("Tuesday: title", "Play. Keep. Next."),
      tue_body: text("Tuesday: text", "Keep what fits your set. Not for me for the rest, kindly. Either way, the sender sees you listened."),
      review_hint: f("Tuesday card: line before a tap", "Try it: tap Keep or Not for me."),
      review_kept: f("Tuesday card: after Keep", "Kept. It's in Friday's crate."),
      review_unkept: f("Tuesday card: after taking Keep back", "Taken back out."),
      review_next: f("Tuesday card: after Not for me", "Not for me. {name} still sees you listened. Next track.", { vars: ["name"] }),
      fri_time: f("Friday: time", "Fri 23:00"),
      fri_title: f("Friday: title", "The crate is ready."),
      fri_body: text("Friday: text", "Every track you kept, ready to download with a Rekordbox playlist."),
      crate_title: f("Friday card: title", "Prepare"),
      crate_note: f("Friday card: small line", "12 kept this week"),
      crate_button: f("Friday card: download label", "Download for Rekordbox"),
      sat_time: f("Saturday: time", "Sat 02:14"),
      sat_title: f("Saturday: title", "You play it."),
      sat_body: text("Saturday: text", "After the set, tick what you played. That's all it takes for the people who made it to hear."),
      ticks_title: f("Saturday card: title", "What did you play?"),
      ticks_note: f("Saturday card: small line", "Sat 03:40"),
      thanks_time: f("The sender finds out: time", "Sat · the next morning"),
      thanks_title: f("The sender finds out: title", "And the person who made it finds out."),
      thanks_body: text("The sender finds out: text", "Played out lands on their receipt. Months in the studio, and it reached a floor."),
      receipt_title: f("Receipt card: title", "Receipt · Second Light"),
      receipt_to: f("Receipt card: who it went to", "Sent to Kwame A."),
      receipt_steps: text("Receipt card: steps", "Delivered | Mon 02:31\nListened | Tue 18:42\nDownloaded | Fri 23:04\nPlayed out | Sat 03:41", { kind: "pairs", hint: "One step per line: step | when. The last one fills in when the receipt comes into view." }),
      fair_title: f("Fair to senders: title", "Fair to the people sending"),
      fair_points: text(
        "Fair to senders: points",
        "No account to send\nThey open your link and upload the original file.\n\nAn honest receipt\nDelivered, Listened, Downloaded, Played out. Nothing bigger than the truth.\n\nTheir files stay theirs\nOriginals are never changed. Tracks nobody keeps are deleted after 90 days.",
        { kind: "pairs", hint: "Each point: a title line, then its text. Leave a blank line between points. Three fit best." },
      ),
      end_title: f("Your link is waiting: title", "Your link is waiting."),
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
      login_intro: f("Log-in intro", "", { hint: "Empty by default: the log-in screen shows no line under its heading unless one is saved here." }),
      login_code_prompt: f("Log-in: line before the code link", "No password?"),
      login_code_link: f("Log-in: code link", "Email me a sign-in code"),
      signup_intro: text("Sign-up intro", "One link for every callout. Free for up to 20 active tracks."),
      signup_invite_only: text("Sign-up: invite-only note", "Invite-only for now. Use the link in your invite email.", { hint: "Shown while sign-up is invite-only." }),
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
      bullet_no_account: f("Note: no account", "No account. We email you a code to send."),
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

/** "left | right" per line → [left, right]; lines without a left part are skipped, a missing right part is "". */
export const cells = (s: string) =>
  s
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter((p) => p[0])
    .map(([a, b]) => [a, b ?? ""] as [string, string]);

/** The home hero's messages: one per line; " | m" after a message sets it in the mono type. */
export const messages = (s: string) => cells(s).map(([text, mark]) => ({ text, mono: mark.toLowerCase() === "m" }));

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
