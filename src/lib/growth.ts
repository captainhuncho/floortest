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
  const first = steps[0]?.n || 0;
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
