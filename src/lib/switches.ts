import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { now, q, type Queryable } from "./db";
import { env } from "./env";
import { readRule, ruleCovers, type SwitchRule, type SwitchSubject } from "./switch-rules";

/**
 * Site-wide switches, flipped from Admin → Feature switches with no deploy. Each is off or on;
 * `initial` is its state until an admin first changes it. `targeted` ones can also carry a "who sees it" rule
 * (lib/switch-rules): they are read for an account, so a rule can narrow them. The rest act on visitors without an
 * account, on legal wording or on money, so they stay plain on/off.
 */
export const SWITCHES = {
  sharing: {
    label: "Collection share links",
    description: "Receivers share collections privately with people they name (verified by email), and the Terms, Privacy and Cookie pages show the private-sharing wording. Held until the lawyer approves that wording.",
    initial: false,
  },
  bot_check: {
    label: "Bot check on public forms",
    description: "Cloudflare Turnstile on sign-up, waitlist, contact and anonymous uploads. Turn off at once if people report they can't get past it.",
    initial: true,
  },
  open_signup: {
    label: "Open sign-up",
    description: "Anyone can create an account. Off (the beta): only a personal invite sent from Ops to that exact email opens an account; shared and referral codes don't.",
    initial: false,
  },
  billing: {
    label: "Paid plans and checkout",
    description: "Off: checkout applies the beta discount (total $0.00). On: the discount goes and checkout charges by card. Keep off until card payments are connected and the lawyer has approved the renewal wording.",
    initial: false,
  },
  teams: {
    label: "Account teams",
    description: "Owners invite people onto their account (seats by plan: Free 1, Pro 2, Team 5, plus add-on seats); each person keeps their own login and switches desks from the sidebar.",
    initial: false,
    targeted: true,
  },
  more_collections: {
    label: "More than two collections",
    description: "Off (the beta, owner 15 Oct): each desk holds two collections. On: as many as people want.",
    initial: false,
    targeted: true,
  },
  send_music: {
    label: "Send music between desks",
    description: "Off (the beta): receivers don't send to other receivers from FloorTest; the Send page, its sidebar item, the Floor's Send music and Account's row are hidden. Senders still send through anyone's link.",
    initial: false,
    targeted: true,
  },
  referrals: {
    label: "Referrals page",
    description: "Off (the beta): the Referrals page and its links are hidden. Invite codes and links people already have keep working.",
    initial: false,
    targeted: true,
  },
  plan_requests: {
    label: "Plan requests",
    description: "Off (the beta): the Plans page shows the plans without Request buttons, and the request form is closed. FloorTest sets plans from ops.",
    initial: false,
    targeted: true,
  },
  ops_shell: {
    label: "New ops navigation",
    description: "Ops only (admin redesign B): the rail, section panel and top bar on wide screens and the bottom bar on phones replace the top tabs and sidebar. Off: ops looks as before. Nothing changes outside ops.",
    initial: false,
  },
  uploads_paused: {
    label: "Pause all uploads",
    description: "Maintenance switch: every receiver's link stops taking new tracks, with a short notice to senders. Nothing is lost.",
    initial: false,
  },
} as const;
export type SwitchKey = keyof typeof SWITCHES;
/** Switches read for an account, which can carry a rule. */
export type TargetedSwitch = { [K in SwitchKey]: (typeof SWITCHES)[K] extends { targeted: true } ? K : never }[SwitchKey];
export type SiteSwitch = Exclude<SwitchKey, TargetedSwitch>;
export const isTargeted = (key: SwitchKey): key is TargetedSwitch => "targeted" in SWITCHES[key];

type State = { on: boolean; rule: SwitchRule | null };
type Row = { key: string; on: number; rule: string | null };
const stateFrom = (key: SwitchKey, r: Row | undefined): State =>
  r ? { on: !!Number(r.on), rule: isTargeted(key) ? readRule(r.rule) : null } : { on: SWITCHES[key].initial, rule: null };

const all = cache(async () => {
  const rows = await q.all<Row>("SELECT key, on_ AS on, rule FROM switches");
  return new Map(rows.map((r) => [r.key, r]));
});

/** On/off and the rule, as admin sees them. */
export async function switchState(key: SwitchKey, db?: Queryable): Promise<State> {
  if (db) return stateFrom(key, await db.get<Row>("SELECT key, on_ AS on, rule FROM switches WHERE key = ?", key));
  return stateFrom(key, (await all()).get(key));
}

/** Vercel's country for this request (x-vercel-ip-country); "" outside a request or when it isn't sent. */
async function requestCountry() {
  try {
    return ((await headers()).get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  } catch {
    return "";
  }
}

const subjectOf = async (id: number, db: Queryable) => {
  const r = await db.get<SwitchSubject>("SELECT id, plan, kind, email FROM users WHERE id = ?", id);
  return r ? { ...r, id: Number(r.id) } : null;
};

/**
 * The one check for a switch, on the server. Site switches: on or off. Targeted switches are checked for an account
 * (the desk row, or its id, which is looked up only when a rule needs it): off is off for everyone; on with no rule is
 * everyone; on with a rule is the accounts it covers, plus any desk whose owner is an ops super admin (ADMIN_EMAILS),
 * so the owner can test. No account (null) never matches a rule. Pass `db` when inside a transaction, so the read uses
 * the transaction's connection instead of waiting on a second one.
 */
export async function switchOn(key: SiteSwitch, db?: Queryable): Promise<boolean>;
export async function switchOn(key: TargetedSwitch, who: SwitchSubject | number | null, db?: Queryable): Promise<boolean>;
export async function switchOn(key: SwitchKey, a?: SwitchSubject | number | Queryable | null, b?: Queryable) {
  const db = a && typeof a === "object" && "get" in a ? a : b;
  const who = a && !(typeof a === "object" && "get" in a) ? a : null;
  const s = await switchState(key, db);
  if (!s.on || !s.rule) return s.on;
  const subject = typeof who === "number" ? await subjectOf(who, db ?? q) : who;
  const country = s.rule.countries.length ? await requestCountry() : "";
  return ruleCovers(key, s.rule, subject, country, isSuperAdmin(subject));
}

export async function setSwitch(key: SwitchKey, on: boolean, adminId: number) {
  await q.run(
    "INSERT INTO switches (key, on_, admin_id, updated_at) VALUES (?,?,?,?) ON CONFLICT (key) DO UPDATE SET on_ = excluded.on_, admin_id = excluded.admin_id, updated_at = excluded.updated_at",
    key,
    on ? 1 : 0,
    adminId,
    now(),
  );
}

const isSuperAdmin = (who: SwitchSubject | null) => !!who?.email && env.adminEmails.includes(who.email.toLowerCase());

/**
 * Who a rule reaches now, for admin: accounts covered (not suspended) and the total. A country list is checked on each
 * visit, so it isn't counted here: `covered` is the most it can reach.
 */
export async function ruleCoverage(key: TargetedSwitch, rule: SwitchRule) {
  const rows = await q.all<SwitchSubject>("SELECT id, plan, kind, email FROM users WHERE suspended_at IS NULL");
  const covered = rows.filter((r) => {
    const who = { ...r, id: Number(r.id) };
    return ruleCovers(key, rule, who, null, isSuperAdmin(who));
  }).length;
  return { covered, total: rows.length };
}

/** Sets or clears (null) a targeted switch's rule; on/off stays as it is. */
export async function setSwitchRule(key: TargetedSwitch, rule: SwitchRule | null, adminId: number) {
  await q.run(
    "INSERT INTO switches (key, on_, rule, admin_id, updated_at) VALUES (?,?,?,?,?) ON CONFLICT (key) DO UPDATE SET rule = excluded.rule, admin_id = excluded.admin_id, updated_at = excluded.updated_at",
    key,
    SWITCHES[key].initial ? 1 : 0,
    rule ? JSON.stringify(rule) : null,
    adminId,
    now(),
  );
}
