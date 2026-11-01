import { test } from "node:test";
import assert from "node:assert/strict";
import { BETA_START, betaNumbers, betaWeek, biggestDrop, decisions, forecast, formatHours, funnel, isBetaAccount, isSelfSent, median, showShare, type BetaAccountRow } from "../src/lib/growth";

test("forecast follows a straight trend and widens its range further out", () => {
  const p = forecast([10, 12, 14, 16, 18, 20], 3);
  assert.deepEqual(p.map((x) => x.value), [22, 24, 26]);
  assert.ok(p[0].low <= p[0].value && p[0].high >= p[0].value);
  const noisy = forecast([10, 20, 9, 22, 11, 21], 3);
  assert.ok(noisy[2].high - noisy[2].low >= noisy[0].high - noisy[0].low, "the range grows with distance");
  assert.deepEqual(forecast([5, 6]), [], "too few weeks to project");
  assert.ok(forecast([9, 5, 2, 0, 0], 4).every((x) => x.value >= 0 && x.low >= 0), "never below zero");
});

test("funnel shares and the biggest drop", () => {
  const f = funnel([
    { label: "Joined", n: 100 },
    { label: "Got a track", n: 80 },
    { label: "Kept one", n: 20 },
    { label: "Paid", n: 10 },
  ]);
  assert.deepEqual(f.map((s) => s.ofFirst), [100, 80, 20, 10]);
  assert.deepEqual(f.map((s) => s.ofPrev), [100, 80, 25, 50]);
  assert.equal(biggestDrop(f)?.label, "Kept one");
  assert.equal(biggestDrop(funnel([{ label: "A", n: 0 }])), null);
});

test("decisions say what they saw, ignore tiny groups and stay quiet without data", () => {
  const steps = funnel([
    { label: "Joined", n: 50 },
    { label: "Got a track", n: 10 },
  ]);
  const cards = decisions({
    steps,
    sources: [
      { name: "instagram", people: 20, activated: 15, paid: 6 },
      { name: "lucky", people: 1, activated: 1, paid: 1 },
    ],
    kinds: [
      { name: "Curators", people: 10, activated: 8, paid: 4 },
      { name: "DJs", people: 20, activated: 10, paid: 2 },
    ],
    signups: [10, 10, 4, 4],
    next: [{ value: 5, low: 2, high: 8 }],
  });
  const titles = cards.map((c) => c.title);
  assert.ok(titles.some((t) => t.startsWith("Biggest drop")));
  assert.ok(titles.includes("Curators accounts pay most often"));
  assert.ok(titles.includes("Best source: instagram"), "the one-person group can't win");
  assert.ok(titles.includes("Sign-ups are slowing"));
  assert.deepEqual(decisions({ steps: [], sources: [], kinds: [], signups: [], next: [] }), []);
});

test("funnel uses the first step anyone reached as its base", () => {
  const f = funnel([
    { label: "Joined the waitlist", n: 0 },
    { label: "Signed up", n: 40 },
    { label: "Got a track", n: 10 },
  ]);
  assert.deepEqual(f.map((s) => s.ofFirst), [0, 100, 25]);
});

const H = 3_600_000;
const D = 24 * H;
const acct = (id: number, email: string, over: Partial<BetaAccountRow> = {}): BetaAccountRow => ({ id, email, created_at: BETA_START + H, suspended_at: null, ops: false, invited: false, team_emails: [], ...over });

test("beta week counts from 1 Nov 00:00 UTC and stops at 8", () => {
  assert.equal(betaWeek(BETA_START), 1);
  assert.equal(betaWeek(BETA_START + 7 * D - 1), 1);
  assert.equal(betaWeek(BETA_START + 7 * D), 2);
  assert.equal(betaWeek(BETA_START + 8 * 7 * D - 1), 8);
  assert.equal(betaWeek(BETA_START + 9 * 7 * D), 8, "week 9 and later show as 8");
  assert.equal(betaWeek(BETA_START - D), 1, "never below 1");
});

test("median of odd and even sets, none without values", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
  assert.equal(formatHours(null), "—");
  assert.equal(formatHours(0.5), "30 min");
  assert.equal(formatHours(5.25), "5.3 h");
  assert.equal(formatHours(30.4), "30 h");
});

test("small bases show the raw number only", () => {
  assert.equal(showShare(4), false);
  assert.equal(showShare(5), true);
});

test("owner, ops staff, seed and suspended accounts are not beta accounts; when they joined doesn't matter", () => {
  const admins = ["owner@example.com"];
  assert.equal(isBetaAccount(acct(1, "dj@example.com"), admins), true);
  assert.equal(isBetaAccount(acct(2, "Owner@Example.com"), admins), false, "ADMIN_EMAILS, any case");
  assert.equal(isBetaAccount(acct(3, "care@example.com", { ops: true }), admins), false, "ops staff");
  assert.equal(isBetaAccount(acct(4, "demo@floortest.test"), admins), false, "seed data");
  assert.equal(isBetaAccount(acct(5, "gone@example.com", { suspended_at: BETA_START + D }), admins), false, "suspended");
  assert.equal(isBetaAccount(acct(6, "early@example.com", { created_at: BETA_START - 20 * D }), admins), true, "invited in October still counts");
});

test("a track sent from the account's own email or a teammate's is self-sent", () => {
  const a = acct(1, "dj@example.com", { team_emails: ["mate@example.com"] });
  assert.equal(isSelfSent("DJ@example.com", a), true);
  assert.equal(isSelfSent("mate@example.com", a), true);
  assert.equal(isSelfSent("artist@example.com", a), false);
});

const ev = (user_id: number, type: string, last_at: number, n = 1) => ({ user_id, type, n, last_at });

test("beta numbers: who counts, the 7-day edge, activation and time to first listen", () => {
  const now = BETA_START + 20 * D;
  const accounts = [
    acct(1, "a@example.com", { invited: true, team_emails: ["mate@example.com"] }),
    acct(2, "b@example.com"),
    acct(3, "c@example.com", { invited: true, created_at: BETA_START - 10 * D }),
    acct(4, "owner@example.com"),
    acct(5, "staff@example.com", { ops: true }),
    acct(6, "seed@floortest.test"),
    acct(7, "gone@example.com", { suspended_at: now - D }),
    acct(8, "early@example.com", { created_at: BETA_START - 20 * D }),
    acct(9, "quiet@example.com", { created_at: BETA_START - 5 * D }),
  ];
  const activity = [
    // Decided exactly 7 days ago: inside the window. Its track was deleted, but the submitted event still counts.
    ev(1, "submitted", now - 9 * D),
    ev(1, "kept", now - 7 * D),
    // Decided 7 days and 1 ms ago: outside the window, still activated.
    ev(2, "submitted", now - 10 * D, 2),
    ev(2, "passed", now - 7 * D - 1),
    // Joined in October, active after 1 Nov: counts. Nothing arrived, so not activated.
    ev(3, "kept", now - D),
    // Joined in October and active only in October (23:30Z on 31 Oct is still October): doesn't count.
    ev(8, "submitted", BETA_START - 30 * 60_000),
    ev(8, "kept", BETA_START - 30 * 60_000),
    // Excluded accounts never count, however busy.
    ...[4, 5, 6, 7].flatMap((u) => [ev(u, "submitted", now - H, 5), ev(u, "kept", now - H, 5)]),
  ];
  const tracks = [
    { user_id: 1, created_at: BETA_START + D, played_at: BETA_START + D + 2 * H, deleted_at: null, sender_email: "artist@example.com" },
    { user_id: 1, created_at: BETA_START + D, played_at: BETA_START + D + 1 * H, deleted_at: null, sender_email: "a@example.com" },
    { user_id: 1, created_at: BETA_START + D, played_at: BETA_START + D + 1 * H, deleted_at: null, sender_email: "mate@example.com" },
    { user_id: 2, created_at: BETA_START + D, played_at: BETA_START + D + 10 * H, deleted_at: BETA_START + 3 * D, sender_email: "artist@example.com" },
    { user_id: 2, created_at: BETA_START + D, played_at: null, deleted_at: null, sender_email: "artist2@example.com" },
    { user_id: 2, created_at: BETA_START + D, played_at: null, deleted_at: BETA_START + 2 * D, sender_email: "artist3@example.com" },
    // Delivered in October: not part of the beta's time to first listen.
    { user_id: 8, created_at: BETA_START - 30 * 60_000, played_at: BETA_START + 99 * H, deleted_at: null, sender_email: "artist@example.com" },
    { user_id: 4, created_at: BETA_START + D, played_at: BETA_START + D + 100 * H, deleted_at: null, sender_email: "artist@example.com" },
  ];
  const n = betaNumbers({ now, adminEmails: ["owner@example.com"], accounts, activity, tracks });
  assert.equal(n.week, 3);
  assert.deepEqual([n.accounts, n.invited, n.other], [5, 2, 3], "accounts 1, 2, 3, 8 and 9");
  assert.deepEqual([n.joinedBefore, n.joinedSince], [3, 2]);
  assert.equal(n.invited + n.other, n.accounts, "the invited split adds up");
  assert.equal(n.joinedBefore + n.joinedSince, n.accounts, "the joined split adds up");
  assert.equal(n.weeklyActive, 2, "accounts 1 (exactly 7 days) and 3 (joined in October)");
  assert.equal(n.activated, 2, "accounts 1 and 2; October activity of account 8 doesn't count");
  assert.equal(n.firstListenHours, 6, "median of 2 h and 10 h; self-sent, October and owner tracks left out");
  assert.equal(n.listened, 2);
  assert.equal(n.listenAccounts, 2);
  assert.equal(n.waiting, 1, "the deleted unplayed track is not waiting");
});

test("beta numbers with no listens yet show no median", () => {
  const n = betaNumbers({ now: BETA_START + D, adminEmails: [], accounts: [acct(1, "a@example.com")], activity: [], tracks: [{ user_id: 1, created_at: BETA_START + H, played_at: null, deleted_at: null, sender_email: "x@example.com" }] });
  assert.equal(n.firstListenHours, null);
  assert.equal(formatHours(n.firstListenHours), "—");
  assert.equal(n.waiting, 1);
  assert.deepEqual([n.weeklyActive, n.activated, n.listened], [0, 0, 0]);
});
