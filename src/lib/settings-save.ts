import "server-only";
import { asPerson, asSystem, now, q } from "@/lib/db";

/**
 * The owner's own Settings saves (B8, Backend slice 1): run as the person, so the database allows only the owner's own
 * row and only these columns (migrations 0108 and 0132). The action (src/app/dashboard/actions/settings.ts) and the
 * test (tests/person-settings.test.ts) run these exact statements.
 */
export const ALERTS_SQL =
  "UPDATE users SET notify_submissions = ?, digest_hour = ?, quiet_start = ?, quiet_end = ?, notify_alerts = ?, notify_product = ?, notify_marketing = ?, product_consent_at = ?, marketing_consent_at = ?, tz = ? WHERE id = ?";
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
 * Saves the alerts and contact choices; null when saved, else the message to show. A consent keeps its first time while
 * still given, starts now when newly given, and clears when taken back. The earlier times are read by the app: they're
 * the person's record, but teammates can see the person's row, so they aren't readable as the person.
 */
export async function saveAlerts(person: number, desk: number, a: Alerts, at = now()): Promise<string | null> {
  const before = await asSystem(() =>
    q.get<{ product_consent_at: number | null; marketing_consent_at: number | null }>("SELECT product_consent_at, marketing_consent_at FROM users WHERE id = ?", desk),
  );
  if (!before) return NOT_SAVED;
  const r = await asPerson(person, () =>
    q.run(
      ALERTS_SQL,
      a.mode, a.digestHour, a.quietStart, a.quietEnd, a.alerts ? 1 : 0, a.product ? 1 : 0, a.marketing ? 1 : 0,
      a.product ? (before.product_consent_at ?? at) : null,
      a.marketing ? (before.marketing_consent_at ?? at) : null,
      a.tz, desk,
    ),
  );
  return r.changes ? null : NOT_SAVED;
}

export type Profile = { name: string; firstName: string; lastName: string; kind: string | null; kindNote: string; tools: string | null };

/** Saves the profile fields; null when saved, else the message to show. */
export async function saveProfile(person: number, desk: number, p: Profile): Promise<string | null> {
  const r = await asPerson(person, () => q.run(PROFILE_SQL, p.name, p.firstName, p.lastName, p.kind, p.kindNote, p.tools, desk));
  return r.changes ? null : NOT_SAVED;
}
