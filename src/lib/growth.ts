import { normalEmail } from "./email-normal";

/**
 * Growth & decisions (owner, 1 Nov 2026): the maths behind the ops page, kept pure so it can be tested.
 * Everything here works from FloorTest's own counts; no outside analytics needed.
 */

export type Point = { value: number; low: number; high: number };

/**
 * A straight-line projection of a weekly series, with a likely range (about 80% of weeks would land inside it if the
 * past few weeks are a fair guide). Needs at least 3 weeks; never goes below zero. It's a projection, not a promise.
 */
export function forecast(series: number[], ahead = 4): Point[] {
  const n = series.length;
  if (n < 3) return [];
  const xs = series.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = series.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = sxx ? xs.reduce((a, x, i) => a + (x - mx) * (series[i] - my), 0) / sxx : 0;
  const at = (x: number) => my + slope * (x - mx);
  const sd = Math.sqrt(series.reduce((a, y, i) => a + (y - at(i)) ** 2, 0) / Math.max(1, n - 2));
  return Array.from({ length: ahead }, (_, k) => {
    const x = n + k;
    // The range widens the further out it looks.
    const spread = 1.28 * sd * Math.sqrt(1 + 1 / n + (x - mx) ** 2 / (sxx || 1));
    const value = Math.max(0, at(x));
    return { value: Math.round(value), low: Math.max(0, Math.round(at(x) - spread)), high: Math.max(0, Math.round(at(x) + spread)) };
  });
}

export type Step = { label: string; n: number };
export type FunnelStep = Step & { ofFirst: number; ofPrev: number };

/** Each step's share of the first step and of the one before it (0–100, whole numbers). */
export function funnel(steps: Step[]): FunnelStep[] {
  // The base is the first step anyone reached: with sign-up open and no waitlist, later steps still read as shares.
  const first = steps.find((s) => s.n > 0)?.n || 0;
  return steps.map((s, i) => {
    const prev = i ? steps[i - 1].n : s.n;
    return { ...s, ofFirst: first ? Math.round((s.n / first) * 100) : 0, ofPrev: prev ? Math.round((s.n / prev) * 100) : 0 };
  });
}

/** The step (after the first) that loses the biggest share of the people who reached the one before it. */
export function biggestDrop(steps: FunnelStep[]): FunnelStep | null {
  const later = steps.slice(1).filter((s, i) => steps[i].n > 0 && s.n <= steps[i].n);
  return later.length ? later.reduce((worst, s) => (s.ofPrev < worst.ofPrev ? s : worst)) : null;
}

export type Group = { name: string; people: number; activated: number; paid: number };
export type Card = { title: string; detail: string; tone: "good" | "watch" | "act" };

/** Groups with too few people to judge are left out of comparisons, so one lucky sign-up can't top the list. */
export const MIN_GROUP = 5;

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/**
 * Plain findings from the numbers, most useful first. Each says what it saw and what to do; nothing is claimed
 * without the counts behind it.
 */
export function decisions(input: { steps: FunnelStep[]; sources: Group[]; kinds: Group[]; signups: number[]; next: Point[] }): Card[] {
  const cards: Card[] = [];
  const drop = biggestDrop(input.steps);
  if (drop && drop.ofPrev < 60) {
    const before = input.steps[input.steps.indexOf(drop) - 1];
    cards.push({ title: `Biggest drop: ${before.label.toLowerCase()} → ${drop.label.toLowerCase()}`, detail: `Only ${drop.ofPrev}% make that step (${drop.n} of ${before.n}). Fixing this step moves every number after it.`, tone: "act" });
  }
  const bestOf = (groups: Group[]) => groups.filter((g) => g.people >= MIN_GROUP).sort((a, b) => pct(b.paid, b.people) - pct(a.paid, a.people) || b.people - a.people);
  const kinds = bestOf(input.kinds);
  if (kinds.length >= 2 && pct(kinds[0].paid, kinds[0].people) > 0) {
    const top = kinds[0];
    const low = kinds[kinds.length - 1];
    cards.push({ title: `${top.name} accounts pay most often`, detail: `${pct(top.paid, top.people)}% of ${top.name} accounts pay, against ${pct(low.paid, low.people)}% of ${low.name} (${top.people} and ${low.people} people). Aim invites and posts at ${top.name} accounts.`, tone: "good" });
  }
  const sources = bestOf(input.sources).filter((g) => g.name !== "Unknown");
  if (sources.length) {
    const top = sources[0];
    cards.push({ title: `Best source: ${top.name}`, detail: `${top.people} sign-ups, ${pct(top.activated, top.people)}% got a track, ${pct(top.paid, top.people)}% pay. Put more effort there.`, tone: "good" });
  }
  const s = input.signups;
  if (s.length >= 4) {
    const recent = s.slice(-2).reduce((a, b) => a + b, 0);
    const before = s.slice(-4, -2).reduce((a, b) => a + b, 0);
    if (before >= 4 && recent < before * 0.75) cards.push({ title: "Sign-ups are slowing", detail: `${recent} in the last two weeks, against ${before} the two before. Check invites and the waitlist.`, tone: "watch" });
    else if (before >= 4 && recent > before * 1.25) cards.push({ title: "Sign-ups are speeding up", detail: `${recent} in the last two weeks, against ${before} the two before.`, tone: "good" });
  }
  if (input.next.length) {
    const total = input.next.reduce((a, p) => a + p.value, 0);
    cards.push({ title: `About ${total} sign-ups in the next 4 weeks`, detail: `Likely between ${input.next.reduce((a, p) => a + p.low, 0)} and ${input.next.reduce((a, p) => a + p.high, 0)}, if the last weeks are a fair guide. A projection, not a promise.`, tone: "watch" });
  }
  return cards;
}

/* ------------------------------------------------------------------------------------------------------------------
 * Beta numbers (owner, 1 Nov 2026): the three weekly targets from docs/beta-launch-plan.md, shown at the top of
 * Admin → Growth. The base is every account that isn't excluded, whenever it was made (invites went out before
 * 1 Nov); activity (events and delivered tracks) counts only from the beta start. The page runs three queries
 * (accounts, then events and tracks bounded to the start) and hands the rows to betaNumbers(); everything that
 * decides who counts lives here so it can be tested.
 * ---------------------------------------------------------------------------------------------------------------- */

/** The beta starts at midnight UTC on 1 Nov 2026. Activity before this instant doesn't count; accounts made before it do. */
export const BETA_START = Date.UTC(2026, 10, 1);
/** The beta runs 8 weeks; after that the week number stays at 8. */
export const BETA_WEEKS = 8;
/** Below this many accounts in a metric's base, show the raw number only: no percentage and no target bar. */
export const SMALL_BASE = 5;
export const BETA_TARGETS = { weeklyActive: 15, activated: 25, firstListenHours: 48 } as const;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const HOUR_MS = 3_600_000;

/** "Beta week X of 8": week 1 is the first 7 days from the start, capped at 8 (and never below 1). */
export function betaWeek(now: number, start = BETA_START): number {
  return Math.min(BETA_WEEKS, Math.max(1, Math.floor((now - start) / WEEK_MS) + 1));
}

/** The middle value (the mean of the two middle values for an even count), or null when there are none. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Whether a metric's base is big enough to show a share and a target bar. */
export const showShare = (base: number) => base >= SMALL_BASE;

export type BetaAccountRow = {
  id: number;
  email: string;
  created_at: number;
  suspended_at: number | null;
  /** Has a row in ops_members (any role, active or not). */
  ops: boolean;
  /** users.invite_code set, or a waitlist row with invited_at set and the same email (lower case). */
  invited: boolean;
  /** Emails (lower case) of the people on this account's team (account_members), for the self-sent rule. */
  team_emails: string[];
};

/**
 * Whether an account counts in the beta, whenever it was made: not suspended, and not the owner, ops staff or
 * seed/test data. `adminEmails` is ADMIN_EMAILS as env.ts reads it (already lower case).
 */
export function isBetaAccount(u: Pick<BetaAccountRow, "email" | "suspended_at" | "ops">, adminEmails: readonly string[]): boolean {
  const email = normalEmail(u.email);
  if (u.suspended_at != null || u.ops) return false;
  if (adminEmails.includes(email)) return false;
  return !email.endsWith("@floortest.test");
}

/** Per account and event type ('submitted', 'kept' or 'passed'): how many since the start, and the latest one. */
export type BetaActivityRow = { user_id: number; type: string; n: number; last_at: number };

/** A track on a beta account since the start, with its sender's email (lower case). */
export type BetaTrackRow = { user_id: number; created_at: number; played_at: number | null; deleted_at: number | null; sender_email: string };

export type BetaNumbers = {
  week: number;
  accounts: number;
  invited: number;
  other: number;
  /** Accounts made before the start (early invites) and since. */
  joinedBefore: number;
  joinedSince: number;
  weeklyActive: number;
  activated: number;
  /** Median hours from delivered to first listen, or null with no listens yet. */
  firstListenHours: number | null;
  /** Tracks behind the median (delivered by a sender and listened to). */
  listened: number;
  /** Tracks delivered by a sender, still there and not listened to yet. */
  waiting: number;
  /** Accounts behind the median (beta accounts with at least one listened track). */
  listenAccounts: number;
};

/**
 * Inferred rule (no stored flag says who sent a track): a track counts as delivered by a sender unless the sender's
 * email is the receiving account's own email or the email of someone on that account's team. Those are tracks the
 * desk added itself, or a teammate sent in, so they say nothing about how fast a receiver listens.
 */
export function isSelfSent(senderEmail: string, account: Pick<BetaAccountRow, "email" | "team_emails">): boolean {
  const s = normalEmail(senderEmail);
  return s === normalEmail(account.email) || account.team_emails.some((e) => normalEmail(e) === s);
}

/** The three beta numbers from the bounded rows. Pure: same rows and clock, same answer. */
export function betaNumbers(input: { now: number; adminEmails: readonly string[]; accounts: BetaAccountRow[]; activity: BetaActivityRow[]; tracks: BetaTrackRow[]; start?: number }): BetaNumbers {
  const start = input.start ?? BETA_START;
  const beta = new Map(input.accounts.filter((u) => isBetaAccount(u, input.adminEmails)).map((u) => [Number(u.id), u]));
  const joinedBefore = [...beta.values()].filter((u) => Number(u.created_at) < start).length;
  const invited = [...beta.values()].filter((u) => u.invited).length;
  const weekAgo = input.now - WEEK_MS;
  const submitted = new Set<number>();
  const decided = new Set<number>();
  const recent = new Set<number>();
  for (const a of input.activity) {
    const id = Number(a.user_id);
    const last = Number(a.last_at);
    // Activity before the beta start never counts (the query is bounded the same way).
    if (!beta.has(id) || !(Number(a.n) > 0) || last < start) continue;
    if (a.type === "submitted") submitted.add(id);
    else if (a.type === "kept" || a.type === "passed") {
      decided.add(id);
      // The last 7 days include the moment exactly 7 days ago.
      if (last >= weekAgo && last <= input.now) recent.add(id);
    }
  }
  const weeklyActive = recent.size;
  const activated = [...decided].filter((id) => submitted.has(id)).length;
  const waits: number[] = [];
  const listenAccounts = new Set<number>();
  let waiting = 0;
  for (const t of input.tracks) {
    const account = beta.get(Number(t.user_id));
    if (!account || Number(t.created_at) < start || isSelfSent(t.sender_email, account)) continue;
    if (t.played_at != null) {
      waits.push(Math.max(0, Number(t.played_at) - Number(t.created_at)));
      listenAccounts.add(Number(t.user_id));
    } else if (t.deleted_at == null) waiting++;
  }
  const mid = median(waits);
  return {
    week: betaWeek(input.now, start),
    accounts: beta.size,
    invited,
    other: beta.size - invited,
    joinedBefore,
    joinedSince: beta.size - joinedBefore,
    weeklyActive,
    activated,
    firstListenHours: mid == null ? null : mid / HOUR_MS,
    listened: waits.length,
    waiting,
    listenAccounts: listenAccounts.size,
  };
}

/** Hours as people read them: "—" with none, minutes under an hour, one decimal under 10 h, whole hours above. */
export function formatHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  return h < 10 ? `${h.toFixed(1)} h` : `${Math.round(h)} h`;
}
