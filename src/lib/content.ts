import "server-only";
import { cache } from "react";
import { draftMode } from "next/headers";
import { currentUser } from "./auth";
import { isAdminEmail } from "./admin";
import { q } from "./db";

/**
 * Wording and images on public pages, edited in Admin → Site content. Each field's `start` is the text the page
 * had when the editor was built; a field nobody has edited shows that. `{name}` placeholders are filled in by the page.
 */
type Kind = "line" | "text" | "pairs" | "image";
export type Field = { label: string; kind: Kind; start: string; vars?: string[]; hint?: string };

const f = (label: string, start: string, more: Partial<Field> = {}): Field => ({ label, kind: "line", start, ...more });
const text = (label: string, start: string, more: Partial<Field> = {}) => f(label, start, { kind: "text", ...more });

export const SITE_PAGES = {
  home: {
    label: "Home",
    path: "/",
    fields: {
      eyebrow: f("Line above the headline", "The receiving desk for unreleased music"),
      headline: f("Headline", "From private tracks"),
      headline_italic: f("Headline, second line (italic)", "to the DJ set."),
      intro: text("Intro", "One receiving link for every track you're sent. Hear what's new in seconds, keep what's right for your set, and answer every sender without a single DM."),
      preview_image: f("Product preview image", "", { kind: "image", hint: "Replaces the clickable product preview below the receipts section. Leave empty to keep the clickable preview." }),
      preview_alt: f("Product preview image: description", "The FloorTest review queue", { hint: "Read aloud by screen readers." }),
      how_title: f("How it works: title", "Share once. Decide fast."),
      how_steps: text(
        "How it works: steps",
        "Share one link\nPut it in your bio or a callout. Senders upload the original WAV or MP3, no account needed.\n\nDecide fast\nPlay, keep or pass, and the next track is already up. Kept tracks export straight to Rekordbox.\n\nSenders hear back\nEvery sender gets a private receipt: delivered, listened, downloaded, replied.",
        { kind: "pairs", hint: "Each step: a title line, then its text. Leave a blank line between steps." },
      ),
      private_title: f("Privacy section: title", "Music stays between the people you choose."),
      plans_kicker: f("Plans: small label", "Plans"),
      plans_title: f("Plans: headline (beta)", "Start free. Grow when your inbox does.", { hint: "Shown while the Billing switch is off." }),
      plans_intro: text("Plans: intro (beta)", "Free for 20 active tracks. Pro and Team for busy desks and whole crews."),
      plans_title_launch: f("Plans: headline (after launch)", "Free while you find your sound.", { hint: "Shown once the Billing switch is on." }),
      plans_intro_launch: text("Plans: intro (after launch)", "Free holds 20 tracks at a time, for good. Pro and Team make room for hundreds more and bring your crew in."),
      faq_title: f("Questions: title", "Before the first track lands."),
      faq: text(
        "Questions and answers",
        "Do senders need an account?\nNo. They send through a receiver's link with their name and email, confirm the email once, and get a private receipt link to follow the track.\n\nWhat files can be submitted?\nThe original WAV or MP3, up to 250 MB. No streaming or cloud links: the receiver gets the actual file.\n\nDoes your link change?\nNever. It stays the same while you route new tracks into whichever collection is receiving, or pause it while you're away.\n\nWhat counts as \"listened\"?\nAt least 30 seconds of real playback, or a quarter of a short track. Skipping around doesn't count, so the signal means something.\n\nIs it free?\nYes, for up to 20 active tracks, and free for good at that size. During the beta, Pro and Team are free too, and sign-up is by invite.",
        { kind: "pairs", hint: "Each question on its own line, the answer below it. Leave a blank line between questions." },
      ),
    },
  },
  pricing: {
    label: "Pricing",
    path: "/pricing",
    fields: {
      pricing_title: f("Title", "Start free. Grow when your inbox does."),
      pricing_intro: text("Intro", "Free for up to 20 active tracks, for good. Pro and Team are free during the beta. Paid plans come after it: beta users hear first, get at least 30 days' notice, and never lose tracks they already have."),
    },
  },
  auth: {
    label: "Sign-up and log-in",
    path: "/signup",
    fields: {
      login_title: f("Log-in heading", "Back to the desk"),
      signup_title: f("Sign-up heading", "Claim your link"),
      signup_intro: text("Sign-up intro", "One link for every callout. Free for up to 20 active tracks."),
    },
  },
  link: {
    label: "Public link",
    path: "/maxwell",
    fields: {
      kicker: f("Line above the receiver's name", "Send music to"),
      looking_for: f("Brief heading", "What I'm looking for"),
      bullet_files: f("Note: files", "WAV or MP3, up to 250 MB. No account needed."),
      bullet_private: f("Note: who hears it", "Only {receiver} can hear or download your file.", { vars: ["receiver"] }),
      bullet_private_team: f("Note: who hears it (with a team)", "Only {receiver} can download your file. Their team can listen and suggest, nothing more.", { vars: ["receiver"] }),
      bullet_retention: f("Note: deletion", "Files that aren't kept are deleted within {days} days.", { vars: ["days"] }),
      bullet_receipt: f("Note: receipt", "You'll get a private receipt and an email when it's listened to, downloaded or replied to."),
      closed_note: f("When the link is closed", "This link stays the same. Check back soon."),
    },
  },
  receipt: {
    label: "Receipts",
    path: "/sent",
    fields: {
      kicker: f("Line above the track title", "Private receipt"),
      private_note: f("Privacy note", "Only {receiver} can hear or download your file. It's never shared publicly.", { vars: ["receiver"] }),
      footer: text("Footer", "No account needed. Bookmark this page to check in any time, or [see everything you've sent] in one place.", {
        hint: "Words in [square brackets] link to the sender's history page.",
      }),
    },
  },
} satisfies Record<string, { label: string; path: string; fields: Record<string, Field> }>;

export type SitePage = keyof typeof SITE_PAGES;
type Copy<P extends SitePage> = Record<keyof (typeof SITE_PAGES)[P]["fields"], string>;
export type Values = Record<string, string>;

const parse = (s: string | null | undefined): Values => {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};

export const contentRow = (page: SitePage) =>
  q.get<{ draft: string; published: string; updated_at: number; published_at: number | null }>("SELECT draft, published, updated_at, published_at FROM site_content WHERE page = ?", page);

/** Admins previewing (Admin → Site content → Preview) see drafts; everyone else sees what's published. */
const previewing = cache(async () => {
  if (!(await draftMode()).isEnabled) return false;
  const u = await currentUser();
  return !!u && isAdminEmail(u.email);
});

/** A page's wording: the published (or, when previewing, draft) value for each field, else the field's starting text. */
export const siteCopy = cache(async <P extends SitePage>(page: P): Promise<Copy<P>> => {
  const row = await contentRow(page);
  const saved = parse((await previewing()) ? row?.draft : row?.published);
  const fields = SITE_PAGES[page].fields as Record<string, Field>;
  return Object.fromEntries(Object.entries(fields).map(([k, fld]) => [k, typeof saved[k] === "string" ? saved[k] : fld.start])) as Copy<P>;
});

/** Fill `{name}` placeholders. Unknown names are left as they are, so a typo is visible rather than silent. */
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** "Title\nBody\n\nTitle\nBody" → [[title, body], …]. */
export const pairs = (s: string) =>
  s
    .split(/\n\s*\n/)
    .map((b) => b.trim().split("\n"))
    .filter((l) => l[0])
    .map(([t, ...rest]) => [t.trim(), rest.join(" ").trim()] as const);

/** Public address for an uploaded site image. */
export const siteImageUrl = (key: string) => (key ? `/api/site-image/${key.replace(/^site\//, "")}` : "");
