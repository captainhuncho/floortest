import "server-only";
import { q } from "./db";
import { env } from "./env";

/**
 * Wording of FloorTest's everyday emails, edited in Admin → Site content → Emails. `{name}` fill-ins are replaced
 * when the email is sent; a fill-in that ends up empty (an optional line) leaves no gap. Security and account emails
 * (sign-in codes, password and email changes, suspensions) keep fixed wording in code on purpose.
 */
import type { UnsubKind } from "./unsubscribe";

/**
 * `unsubscribe`: the email is optional and goes out with a one-click "Stop these emails" link (src/lib/mail.ts). Its
 * senders pass this same value, and the editor's preview shows the line, so what's previewed matches what's sent.
 */
export type EmailDef = { label: string; to: string; subject: string; body: string; vars: Record<string, string>; unsubscribe?: UnsubKind };

const RECEIPT = "Your receipt: {receipt_url}\nEverything you've sent: {sent_url}\n\n— FloorTest";
const TRACK_VARS = { sender: "Sender's name", receiver: "Receiver's name", title: "Track title", receipt_url: "Receipt link", sent_url: "Sender's history link" };

export const EMAILS = {
  delivered: {
    label: "Delivered",
    to: "Sender, when their track arrives",
    subject: "Delivered: {artist} – {title}",
    body: "Hi {sender},\n\n\"{title}\" was delivered to {receiver}{for_collection}.\nWe'll email you when it's listened to, when the original is downloaded, and if {receiver} replies.\n\nYour private receipt: {receipt_url}\nEverything you've sent, with what happened to each: {sent_url}\n\n— FloorTest",
    vars: { ...TRACK_VARS, artist: "Artist", for_collection: '" for <collection>" when sent to one, else empty' },
  },
  delivered_many: {
    label: "Delivered (several tracks)",
    to: "Sender, once for a send of several tracks",
    subject: "Delivered: {count} to {receiver}",
    body: "Hi {sender},\n\nYour {count} were delivered to {receiver}{for_collection}:\n\n{tracks}\n\nWe'll email you when each one is listened to, when an original is downloaded, and if {receiver} replies.\n\nEverything you've sent, with what happened to each: {sent_url}\n\n— FloorTest",
    vars: {
      sender: "Sender's name",
      receiver: "Receiver's name",
      count: 'How many tracks, e.g. "3 tracks"',
      tracks: "Each track (artist – title) with its private receipt link",
      for_collection: '" for <collection>" when sent to one, else empty',
      sent_url: "Sender's history link",
    },
  },
  listened: {
    label: "Listened",
    to: "Sender, after 30+ seconds of play",
    subject: "Listened: {artist} – {title}",
    body: `Hi {sender},\n\n{receiver} listened to "{title}".\n\nThis means it was played for at least 30 seconds (or a quarter of the track). It doesn't tell you whether it'll be played out.\n\n${RECEIPT}`,
    vars: { ...TRACK_VARS, artist: "Artist" },
  },
  downloaded: {
    label: "Downloaded",
    to: "Sender, when the original is downloaded",
    subject: "Downloaded: {artist} – {title}",
    body: `Hi {sender},\n\n{receiver} downloaded the original file of "{title}".\n\nDownloading usually means they want it on hand, but it isn't a promise.\n\n${RECEIPT}`,
    vars: { ...TRACK_VARS, artist: "Artist" },
  },
  played_out: {
    label: "Played out",
    to: "Sender, when their track is played in a set",
    subject: "Played out: {artist} – {title}",
    body: `Hi {sender},\n\n{receiver} played "{title}" out in a set{note}.\n\nThis means {receiver} marked it as played in a set. FloorTest doesn't detect plays: the DJ tells us, so it's their word.\n\n${RECEIPT}`,
    vars: { ...TRACK_VARS, artist: "Artist", note: '" (<the receiver\'s note>)" when they added one, else empty' },
  },
  welcome: {
    label: "Welcome",
    to: "Receiver, once their email is confirmed",
    subject: "Your link is live: {link_short}",
    body: "Hi {first_name},\n\nYour receiving link is ready: {link}\n\nPut it in your bio or your next callout. Artists upload the original file and you'll get an email when tracks arrive (change how often in Notifications).\n\nOn your desk:\n• Space plays\n• K keeps, X marks not for me, and the next track starts\n• U undoes\n\nKept tracks download as a crate with a Rekordbox XML.\n\nReply to this email with anything that's broken or missing. During the beta, the team reads every reply.\n\n— FloorTest",
    vars: { first_name: "Receiver's first name", link: "Their link", link_short: "Their link without https://" },
  },
  first_track_nudge: {
    label: "No tracks yet",
    to: "Receiver, 2 days after sign-up with no tracks",
    subject: "Nothing on your desk yet",
    body: "Hi {first_name},\n\nYour link hasn't had a track yet. The quickest way to get the first one: post a callout with your link, for example:\n\n\"Sending me music? Send the track here: {link}. You'll know when I've listened.\"\n\n— FloorTest",
    vars: { first_name: "Receiver's first name", link: "Their link" },
    unsubscribe: "alerts",
  },
  played_out_reminder: {
    label: "Played any of these?",
    to: "DJ receiver, Tuesday, if Monday's Floor question about last week's kept tracks wasn't answered",
    subject: "Played any of these at the weekend?",
    body: "Hi {first_name},\n\nYou kept {count} last week:\n{titles}\n\nIf any made your set, tick them and each sender sees Played out on their receipt: {prompt_url}\n\nNone this weekend? Say so there and we won't ask again until next week.\n\n— FloorTest",
    vars: { first_name: "Receiver's first name", count: "How many tracks, e.g. \"3 tracks\"", titles: "Up to five tracks, one per line", prompt_url: "The pick page" },
    unsubscribe: "alerts",
  },
  invite: {
    label: "Beta invite",
    to: "Invited person",
    subject: "You're invited to the FloorTest beta",
    body: "Hi,\n\n{inviter} invited you to the FloorTest beta: one receiving link that never changes and takes every track, a queue to review them fast, and receipts that tell senders what happened.\n{personal_note}\nClaim your link: {signup_url}\n\nYour invite code is {code}. It's for {email} only and works once.\n\n— FloorTest",
    vars: { inviter: "Who invited them", personal_note: "Your personal note in quotes, when you wrote one", signup_url: "Sign-up link with the code", code: "Invite code", email: "Their email" },
  },
  link_reopened: {
    label: "Link reopened",
    to: "Sender who asked to hear when a closed link reopens",
    subject: "{receiver} is taking music again",
    body: "Hi,\n\nYou asked to hear when {receiver}'s FloorTest link reopened. It's open now: {link}\n\nUpload the WAV or MP3 and you'll get a private receipt that tells you when it's listened to, downloaded or replied to.\n\nIf you didn't ask for this, ignore this email. This was the only one, and we won't email you again about it.\n\n— FloorTest",
    vars: { receiver: "Receiver's name", link: "Their link" },
  },
  link_rerouted: {
    label: "Link moved to an open collection",
    to: "Receiver, when their link moves off a closed collection (only if they turned this on)",
    subject: "Your link now sends to {collection}",
    body: "Hi {name},\n\n\"{closed}\" closed, so your link {link} now sends new tracks to \"{collection}\", as you asked in Settings → Receiving.\n\nChange where it sends, or turn this off: {settings_url}\n\n— FloorTest",
    vars: { name: "Receiver's first name", closed: "The collection that closed", collection: "Where the link sends now", link: "Their link", settings_url: "Receiving settings" },
  },
  referral: {
    label: "Referral bonus",
    to: "Receiver whose referral got their first track",
    subject: "You both get {bonus} more active tracks",
    body: "Hi {first_name},\n\n{friend} just received their first track on FloorTest, so you both get {bonus} more active tracks on your desks.\n\nYour referrals: {referrals_url}\n\n— FloorTest",
    vars: { first_name: "Receiver's first name", friend: "The person they referred", bonus: "How many more active tracks", referrals_url: "Their referrals page" },
  },
  verified: {
    label: "Verified",
    to: "Receiver, when ops adds the Verified mark",
    subject: "You're verified on FloorTest",
    body: "Hi {first_name},\n\nYour FloorTest page now shows the Verified mark next to your name. Senders see it when they open your link, so they know their music is reaching the real you.\n\n{how_line}\n\nSee your page: {link}\n\nIf anything here looks wrong, reply to this email and the team will sort it.\n\n— FloorTest",
    vars: {
      first_name: "Receiver's first name",
      link: "Their page",
      how_line: '"You can remove the code from your bio now." after a request; "You didn\'t need to do anything. The FloorTest team checked your profile and added it." when ops verified them directly',
    },
  },
} satisfies Record<string, EmailDef>;

/** The verified email's {how_line}: after their request, or when ops added the mark without one. */
export const VERIFIED_HOW = {
  request: "You can remove the code from your bio now.",
  direct: "You didn't need to do anything. The FloorTest team checked your profile and added it.",
} as const;

export type EmailId = keyof typeof EMAILS;
export const emailKey = (id: EmailId) => `email_${id}`;

/** Fill `{name}` fill-ins, then tidy the gaps an empty optional line leaves behind. */
export function fillEmail(s: string, vars: Record<string, string | number>) {
  return s
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The saved wording for an email (or its original wording), before fill-ins. */
export async function emailTemplate(id: EmailId, which: "published" | "draft" = "published") {
  const row = await q.get<{ draft: string; published: string }>("SELECT draft, published FROM site_content WHERE page = ?", emailKey(id));
  let saved: { subject?: unknown; body?: unknown } = {};
  try {
    saved = JSON.parse(row?.[which] || "{}");
  } catch {}
  return {
    subject: typeof saved.subject === "string" && saved.subject ? saved.subject : EMAILS[id].subject,
    body: typeof saved.body === "string" && saved.body ? saved.body : EMAILS[id].body,
  };
}

/** Subject and body ready to send. */
export async function emailText(id: EmailId, vars: Record<string, string | number>) {
  const t = await emailTemplate(id);
  return { subject: fillEmail(t.subject, vars).replace(/\s+/g, " "), body: fillEmail(t.body, vars) };
}

/** Example fill-ins for the editor's preview and test send. */
const U = env.appUrl;
export const SAMPLE_VARS: Record<string, string> = {
  sender: "Ade",
  receiver: "Maxwell",
  title: "Night Bus (Extended Mix)",
  artist: "Ade",
  receipt_url: `${U}/receipt/example`,
  sent_url: `${U}/sent`,
  for_collection: " for Friday residency",
  note: " (opened the second hour)",
  first_name: "Maxwell",
  name: "Maxwell",
  link: `${U}/maxwell`,
  closed: "Afterlife callout",
  collection: "Villagers callout",
  settings_url: `${U}/dashboard/settings/receiving`,
  link_short: `${U.replace(/^https?:\/\//, "")}/maxwell`,
  personal_note: '\n"Would love your ears on this."\n',
  inviter: "Maxwell",
  signup_url: `${U}/signup?invite=FLOOR-EXAMPLE`,
  code: "FLOOR-EXAMPLE",
  email: "you@example.com",
  friend: "Ade",
  bonus: "10",
  referrals_url: `${U}/dashboard/referrals`,
  count: "3 tracks",
  titles: "• Nightbus (sample) · Sample Artist\n• Tin Roof · Sample Collective\n• Lekki Run · Sample Producer",
  prompt_url: `${U}/dashboard/played-out`,
  how_line: "You didn't need to do anything. The FloorTest team checked your profile and added it.",
  tracks: `• Ade – Night Bus (Extended Mix)\n  Receipt: ${U}/receipt/example\n\n• Ade – Tin Roof\n  Receipt: ${U}/receipt/example-2`,
};
