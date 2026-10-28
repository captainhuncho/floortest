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
};

/** The account a switch is checked for: on a team desk, the desk (account) row, so every seat sees the same. */
export type SwitchSubject = { id: number; plan: string; kind: AccountType | null; email?: string };

export const MAX_RULE_ACCOUNTS = 200;
export const MAX_RULE_COUNTRIES = 60;
const COUNTRY = /^[A-Z]{2}$/;

/** Narrows anything beyond named accounts: without these, a rule is only its named accounts. */
const narrows = (r: SwitchRule) => r.types.length > 0 || r.plans.length > 0 || r.countries.length > 0 || r.percent < 100;

export const ruleIsEmpty = (r: SwitchRule) => r.accounts.length === 0 && !narrows(r);

/** A rule as stored (JSON in switches.rule), cleaned; null for no rule or anything unreadable. */
export function readRule(raw: string | null | undefined): SwitchRule | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const list = (v: unknown) => (Array.isArray(v) ? v : []);
    const rule: SwitchRule = {
      accounts: [...new Set(list(o.accounts).filter((n): n is number => Number.isSafeInteger(n) && (n as number) > 0))].slice(0, MAX_RULE_ACCOUNTS),
      types: [...new Set(list(o.types).filter(isAccountType))],
      plans: [...new Set(list(o.plans).filter((p): p is string => typeof p === "string" && /^[a-z0-9_-]{1,40}$/.test(p)))],
      countries: [...new Set(list(o.countries).filter((c): c is string => typeof c === "string" && COUNTRY.test(c)))].slice(0, MAX_RULE_COUNTRIES),
      percent: clampPercent(o.percent),
    };
    return ruleIsEmpty(rule) ? null : rule;
  } catch {
    return null;
  }
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
  if (!narrows(rule)) return false;
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
  if (!narrows(rule)) return `Only ${named}`;
  const who = `${rule.percent < 100 ? `${rule.percent}% of ` : ""}${parts.length ? `accounts ${parts.join(", ")}` : "all accounts"}`;
  return named ? `${named}, plus ${who}` : who.charAt(0).toUpperCase() + who.slice(1);
}
