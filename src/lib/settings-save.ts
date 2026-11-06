import "server-only";
import { asPerson, q } from "@/lib/db";

/**
 * The owner's own Settings saves (B8, Backend slice 1): run as the person, so the database allows only the owner's own
 * row and only these columns (migrations 0108 and 0132). The action (src/app/dashboard/actions/settings.ts) and the
 * test (tests/person-settings.test.ts) run these exact statements.
 */
export const ALERTS_SQL =
  "UPDATE users SET notify_submissions = ?, digest_hour = ?, quiet_start = ?, quiet_end = ?, notify_alerts = ?, notify_product = ?, notify_marketing = ?, tz = ? WHERE id = ?";
export const PROFILE_SQL = "UPDATE users SET name = ?, first_name = ?, last_name = ?, kind = ?, kind_note = ?, tools = ? WHERE id = ?";
export const NOT_SAVED = "Couldn't save your settings. Reload the page and try again.";

export type Alerts = {
  mode: "instant" | "digest" | "off";
  digestHour: number;
  quietStart: number | null;
  quietEnd: number | null;
  alerts: boolean;
  product: boolean;
  marketing: boolean;
  tz: string;
};

/**
 * Saves the alerts and contact choices; null when saved, else the message to show. The consent times are set by the
 * database in the same statement (trigger users_consent_times, migration 0134): kept while still given, set when newly
 * given, cleared when taken back.
 */
export async function saveAlerts(person: number, desk: number, a: Alerts): Promise<string | null> {
  const r = await asPerson(person, () =>
    q.run(ALERTS_SQL, a.mode, a.digestHour, a.quietStart, a.quietEnd, a.alerts ? 1 : 0, a.product ? 1 : 0, a.marketing ? 1 : 0, a.tz, desk),
  );
  return r.changes ? null : NOT_SAVED;
}

export type Profile = { name: string; firstName: string; lastName: string; kind: string | null; kindNote: string; tools: string | null };

/** Saves the profile fields; null when saved, else the message to show. */
export async function saveProfile(person: number, desk: number, p: Profile): Promise<string | null> {
  const r = await asPerson(person, () => q.run(PROFILE_SQL, p.name, p.firstName, p.lastName, p.kind, p.kindNote, p.tools, desk));
  return r.changes ? null : NOT_SAVED;
}
