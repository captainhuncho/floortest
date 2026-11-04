import "server-only";
import crypto from "node:crypto";
import { recordIncident, type IncidentKind } from "./incidents";

/**
 * A failure's full detail goes to an incident; what anyone else sees is a reference to it (Safety's review of main
 * 91a0e5c, 4 Nov). Error messages can carry connection strings, hostnames, table names or a secret pasted into a
 * setting, and they were shown in ops messages, the admin log and job results (Admin → Jobs).
 */
export type SafeFailure = { error: "failed"; ref: string; message: string };

const ref = () => `E-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
const detail = (e: unknown) => (e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e));

/**
 * Records `e` as an incident named "`what` (E-XXXXXXXX)" with the full detail, and returns the reference and a plain
 * message. Recording never throws (recordIncident swallows its own failure), so this is safe inside a catch.
 */
export async function safeFailure(e: unknown, what: string, { kind = "server_error" as IncidentKind, path = "" } = {}): Promise<SafeFailure> {
  const r = ref();
  await recordIncident(kind, `${what} (${r})`, detail(e), path);
  return { error: "failed", ref: r, message: `${what}. Reference ${r} (see Incidents).` };
}
