import { isAccountType } from "./account-types";

/**
 * The guided sign-up (/signup, owner 31 Oct): one question per screen, then one submission of the same `signup`
 * action. These are the pure parts, shared by the screens and the tests: what each step needs before Continue, which
 * step a server error belongs to, and what may be kept in sessionStorage (never the password).
 */

/** 1 welcome, 2 name, 3 link, 4 role, 5 email and password. Steps 6 to 8 come after the account exists (/signup/ready). */
export type SignupStep = 1 | 2 | 3 | 4 | 5;
export const LAST_FORM_STEP: SignupStep = 5;
/** The progress line counts the seven questions after the welcome: steps 2 to 8. */
export const QUESTIONS = 7;
export const progressOf = (screen: number) => Math.max(0, Math.min(QUESTIONS, screen - 1));

export type SignupAnswers = {
  first_name: string;
  last_name: string;
  handle: string;
  kind: string;
  email: string;
  updates: boolean;
  offers: boolean;
};

export const EMPTY_ANSWERS: SignupAnswers = { first_name: "", last_name: "", handle: "", kind: "", email: "", updates: false, offers: false };

/** Same rule as the server's link-name check (createAccount) and checkHandle. */
export const HANDLE = /^[a-z0-9][a-z0-9-_]{1,29}$/;
export const cleanHandle = (raw: string) => raw.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "").slice(0, 30);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

export type StepIssue = { field: string; text: string } | null;

/** The first thing missing on a step, in plain words, or null when Continue may go on. Mirrors the server's checks. */
export function stepIssue(step: number, a: SignupAnswers, secret: { password?: string; agree?: boolean } = {}): StepIssue {
  if (step === 2) {
    if (!a.first_name.trim()) return { field: "first_name", text: "Add your first name." };
    if (!a.last_name.trim()) return { field: "last_name", text: "Add your surname." };
  }
  if (step === 3) {
    if (!a.handle) return { field: "handle", text: "Choose a username." };
    if (!HANDLE.test(a.handle)) return { field: "handle", text: "Use 2–30 letters, numbers, - or _." };
  }
  if (step === 4 && !isAccountType(a.kind)) return { field: "kind", text: "Pick one." };
  if (step === 5) {
    if (!a.email.trim()) return { field: "email", text: "Enter your email." };
    if (!EMAIL.test(a.email.trim())) return { field: "email", text: "That doesn't look like an email address." };
    const p = secret.password ?? "";
    if (!p) return { field: "password", text: "Choose a password of 8 characters or more." };
    if (p.length < MIN_PASSWORD) return { field: "password", text: `At least ${MIN_PASSWORD} characters.` };
    if (!secret.agree) return { field: "agree", text: "Tick this to continue." };
  }
  return null;
}

/** The first step (2 to 5) that still has something missing, so a reload or a deep link can't skip a question. */
export function firstOpenStep(a: SignupAnswers, upTo: SignupStep): SignupStep {
  for (const s of [2, 3, 4] as const) if (s < upTo && stepIssue(s, a)) return s;
  return upTo;
}

/**
 * Which screen a server answer belongs to, so the person lands where the field is. The no-enumeration answer
 * ("We couldn't create an account with those details") stays on the last step: it never says which detail it was.
 */
export function stepForError(message: string): SignupStep {
  if (/^Link names use|^That link name is reserved|^That name is protected|^That link is taken/.test(message)) return 3;
  if (/^Fill in your first name/.test(message)) return 2;
  return 5;
}

const STORE_KEYS = ["first_name", "last_name", "handle", "kind", "email"] as const;
export const STORAGE_KEY = "floortest-signup";

/** The answers as kept in sessionStorage: only the known fields, picked one by one, so a password can never ride along. */
export function toStored(a: SignupAnswers & Record<string, unknown>, step: number): string {
  const out: Record<string, string | boolean | number> = { step };
  for (const k of STORE_KEYS) out[k] = String(a[k] ?? "").slice(0, 200);
  out.updates = !!a.updates;
  out.offers = !!a.offers;
  return JSON.stringify(out);
}

/** Reads sessionStorage back, ignoring anything malformed or unexpected. */
export function fromStored(raw: string | null | undefined): { answers: Partial<SignupAnswers>; step: SignupStep } | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const answers: Partial<SignupAnswers> = {};
  for (const k of STORE_KEYS) if (typeof o[k] === "string") answers[k] = (o[k] as string).slice(0, 200);
  if (answers.handle !== undefined) answers.handle = cleanHandle(answers.handle);
  if (typeof o.updates === "boolean") answers.updates = o.updates;
  if (typeof o.offers === "boolean") answers.offers = o.offers;
  const n = Number(o.step);
  const step = (n >= 1 && n <= 5 ? Math.floor(n) : 1) as SignupStep;
  return { answers, step };
}

/** "Maxwell Adjavon" → "MA", for the photo slot before there's a photo. */
export const initials = (first: string, last: string) => `${first.trim()[0] ?? ""}${last.trim()[0] ?? ""}`.toUpperCase();
