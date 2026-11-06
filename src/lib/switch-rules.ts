import { createHash } from "node:crypto";
import { ACCOUNT_TYPES, isAccountType, type AccountType } from "./account-types";

/**
 * "Who sees it" on a feature switch (owner, 27 Oct): with the switch on, a rule narrows it to some accounts. Off is off
 * for everyone; on with no rule is everyone. Targets only what FloorTest already holds about an account (the account
 * itself, its type, its plan, and the country Vercel reports for the request); never age, gender, ethnicity, health or
 * religion, and no third-party flag service.
 *
 * How a rule reads: named accounts always get it. The other parts narrow everyone else, and each part that is set must
 * match (type and plan and country), then the percentage takes a stable slice of what's left. A rule with only named
 * accounts is for those accounts alone.
 */
export type SwitchRule = {
  /** Account (desk) ids that always get it. */
  accounts: number[];
  types: AccountType[];
  /** Plan ids, e.g. "free", "pro". */
  plans: string[];
  /** ISO 3166 two-letter codes, upper case, as Vercel sends them in x-vercel-ip-country. */
  countries: string[];
  /** 1–100: the share of matching accounts that get it. 100 is all of them. */
  percent: number;
  /**
   * Only on a rule read back from storage, never saved: the parts that were set but can't be read any more (an account
   * type that no longer exists, say), or "rule" when the stored rule can't be read at all. Such a rule covers only its
   * named accounts.
   */
  lost?: LostPart[];
};
export type LostPart = "accounts" | "types" | "plans" | "countries" | "rule";

/** The account a switch is checked for: on a team desk, the desk (account) row, so every seat sees the same. */
export type SwitchSubject = { id: number; plan: string; kind: AccountType | null; email?: string };

export const MAX_RULE_ACCOUNTS = 200;
export const MAX_RULE_COUNTRIES = 60;
const COUNTRY = /^[A-Z]{2}$/;
const PLAN_ID = /^[a-z0-9_-]{1,40}$/;

/** Narrows anything beyond named accounts: without these, a rule is only its named accounts. */
const narrows = (r: SwitchRule) => r.types.length > 0 || r.plans.length > 0 || r.countries.length > 0 || r.percent < 100;
const narrowsByPart = (r: SwitchRule) => r.types.length > 0 || r.plans.length > 0 || r.countries.length > 0;

export const ruleIsEmpty = (r: SwitchRule) => r.accounts.length === 0 && !narrows(r);

/** A stored rule that lost a part or can't be read: it covers only its named accounts, never everyone. */
export const ruleIsLost = (r: SwitchRule) => !!r.lost?.length;

const LOST_WORDS: Record<LostPart, string> = {
  rule: "the stored rule can't be read",
  accounts: "its named accounts can't be read",
  types: "its account types no longer exist",
  plans: "its plans no longer exist",
  countries: "its countries can't be read",
};
/** Why a lost rule reaches nobody, in words: "its account types no longer exist". */
export const lostWords = (r: SwitchRule) => (r.lost ?? []).map((p) => LOST_WORDS[p]).join("; ");

/** Reaches only its named accounts (or nobody), for a stored value that can't be read. */
const unreadable = (): SwitchRule => ({ accounts: [], types: [], plans: [], countries: [], percent: 100, lost: ["rule"] });

/**
 * A rule as stored (JSON in switches.rule), cleaned; null only for no rule (nothing stored, or a rule with nothing set).
 * Fails closed: anything stored that can't be read, and any part that was set but kept none of its values, gives a lost
 * rule that covers only its named accounts. Dropping the part instead would widen the rule, at worst to everyone.
 */
export function readRule(raw: string | null | undefined): SwitchRule | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return unreadable();
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return unreadable();
  const r = o as Record<string, unknown>;
  const parts = ["accounts", "types", "plans", "countries"] as const;
  if (parts.some((k) => r[k] !== undefined && !Array.isArray(r[k]))) return unreadable();
  if (r.percent !== undefined && !(typeof r.percent === "number" && Number.isFinite(r.percent))) return unreadable();
  const list = (k: (typeof parts)[number]) => (r[k] as unknown[] | undefined) ?? [];
  const rule: SwitchRule = {
    accounts: [...new Set(list("accounts").filter((n): n is number => Number.isSafeInteger(n) && (n as number) > 0))].slice(0, MAX_RULE_ACCOUNTS),
    types: [...new Set(list("types").filter(isAccountType))],
    plans: [...new Set(list("plans").filter((p): p is string => typeof p === "string" && PLAN_ID.test(p)))],
    countries: [...new Set(list("countries").filter((c): c is string => typeof c === "string" && COUNTRY.test(c)))].slice(0, MAX_RULE_COUNTRIES),
    percent: clampPercent(r.percent),
  };
  const lost = parts.filter((k) => list(k).length > 0 && rule[k].length === 0);
  if (lost.length) return { ...rule, lost };
  return ruleIsEmpty(rule) ? null : rule;
}

/** The rule form's fields besides type_* and plan_* (src/app/admin/switches/page.tsx). */
const RULE_FIELDS = ["handles", "countries", "percent"];
/** A rule form's fields. `keys` are every field name the form sent, so a page from another release is caught. */
export type RuleForm = { keys: string[]; get: (k: string) => unknown };

/**
 * The rule an admin's form asks for, or why it can't be saved. `accountIds` are the named handles already looked up;
 * `planIds` the plans that exist; `stored` the rule saved now. Refuses:
 * - a form with a field, type, plan or country this release doesn't know (a page left open from another release), since
 *   dropping it would widen the rule;
 * - a missing or non-numeric percentage, rather than reading it as 100;
 * - a rule that would itself read back as lost;
 * - saving over a lost rule without setting each lost part again (the deliberate way out is Clear rule).
 */
export function ruleFromForm(form: RuleForm, accountIds: number[], planIds: string[], stored: SwitchRule | null): { rule: SwitchRule | null } | { error: string } {
  const stale = "This page is out of date. Reload it and try again.";
  for (const k of form.keys) {
    if (k.startsWith("type_")) {
      if (!isAccountType(k.slice(5))) return { error: stale };
    } else if (k.startsWith("plan_")) {
      if (!planIds.includes(k.slice(5))) return { error: stale };
    } else if (!RULE_FIELDS.includes(k) && !k.startsWith("$ACTION")) return { error: stale };
  }
  const words = String(form.get("countries") ?? "").toUpperCase().split(/[\s,;]+/).filter(Boolean);
  if (words.some((c) => !COUNTRY.test(c))) return { error: "Countries must be two-letter codes, like GB IE." };
  const percent = String(form.get("percent") ?? "").trim();
  if (!/^\d{1,3}$/.test(percent) || Number(percent) < 1 || Number(percent) > 100) return { error: "Set a percentage from 1 to 100." };
  const next = readRule(
    JSON.stringify({
      accounts: accountIds,
      types: Object.keys(ACCOUNT_TYPES).filter((t) => form.get(`type_${t}`) === "on"),
      plans: planIds.filter((p) => form.get(`plan_${p}`) === "on"),
      countries: parseCountries(words.join(" ")),
      percent: Number(percent),
    }),
  );
  // A part that wouldn't read back (a plan id the stored rule can't hold, say) would save a rule that reaches nobody.
  if (next && ruleIsLost(next)) return { error: `This rule can't be saved because ${lostWords(next)}.` };
  if (stored && ruleIsLost(stored)) {
    const setAgain = (p: LostPart) =>
      !!next && (p === "rule" ? next.accounts.length > 0 || narrowsByPart(next) : next[p].length > 0);
    if (!stored.lost!.every(setAgain))
      return { error: `This rule reaches nobody because ${lostWords(stored)}. Set that part again, or use Clear rule (everyone) on purpose.` };
  }
  return { rule: next };
}

export function clampPercent(v: unknown) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : 100;
  return Number.isFinite(n) ? Math.min(100, Math.max(1, Math.round(n))) : 100;
}

/** Country codes from free text ("gb, IE  au"): the valid two-letter ones, upper case. */
export const parseCountries = (text: string) =>
  [...new Set(text.toUpperCase().split(/[\s,;]+/).filter((c) => COUNTRY.test(c)))].slice(0, MAX_RULE_COUNTRIES);

/**
 * Where an account falls, 0–99, for one switch: a hash of the switch name and the account id, so the same account always
 * gets the same answer for that switch (raising the percentage only adds people), and different switches pick
 * different slices.
 */
export function bucket(key: string, accountId: number) {
  return createHash("sha256").update(`${key}:${accountId}`).digest().readUInt32BE(0) % 100;
}

/**
 * Whether a rule covers this account. `superAdmin`: the desk's owner is an ops super admin (ADMIN_EMAILS), who can
 * always test. `country` is the request's country code ("" when unknown, which never matches a country list); null
 * skips the country part, for admin's count of who a rule could reach.
 */
export function ruleCovers(key: string, rule: SwitchRule, who: SwitchSubject | null, country: string | null, superAdmin = false) {
  if (!who) return false;
  if (superAdmin || rule.accounts.includes(who.id)) return true;
  if (ruleIsLost(rule) || !narrows(rule)) return false;
  if (rule.types.length && !(who.kind && rule.types.includes(who.kind))) return false;
  if (rule.plans.length && !rule.plans.includes(who.plan)) return false;
  if (rule.countries.length && country !== null && !rule.countries.includes(country.toUpperCase())) return false;
  return bucket(key, who.id) < rule.percent;
}

/** One line for admin: who the rule is for, in words. */
export function describeRule(rule: SwitchRule, planName: (id: string) => string = (id) => id) {
  const parts = [
    rule.types.length ? rule.types.map((t) => ACCOUNT_TYPES[t]).join(" or ") : "",
    rule.plans.length ? `on ${rule.plans.map(planName).join(" or ")}` : "",
    rule.countries.length ? `in ${rule.countries.join(", ")}` : "",
  ].filter(Boolean);
  const named = rule.accounts.length ? `${rule.accounts.length} named account${rule.accounts.length === 1 ? "" : "s"}` : "";
  if (ruleIsLost(rule)) return `${named ? `Only ${named}; nobody else` : "Nobody"} (super admins can test): ${lostWords(rule)}`;
  if (!narrows(rule)) return `Only ${named}`;
  const who = `${rule.percent < 100 ? `${rule.percent}% of ` : ""}${parts.length ? `accounts ${parts.join(", ")}` : "all accounts"}`;
  return named ? `${named}, plus ${who}` : who.charAt(0).toUpperCase() + who.slice(1);
}
