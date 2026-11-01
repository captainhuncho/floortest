import { can } from "@/lib/admin";
import type { OpsAccess } from "@/lib/ops-access";
import { queueRows, trackDetail } from "./data";
import { QueueView } from "./QueueView";

/** Whole numbers in range only, like the audio route: "?t=1.5" or a 15-digit id must not reach Postgres as an int. */
const trackId = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 2_147_483_647 ? n : 0;
};

/**
 * The new Moderation behind `ops_shell` (admin redesign B, step 4), read on the server: the rows (signals, or today's
 * search with ?q=), the chosen row (?t= a track, ?u= a held upload; else the newest) and that track's details.
 */
export async function Queue({ sp, me, access }: { sp: { q?: string; t?: string; u?: string }; me: string; access: OpsAccess }) {
  const search = (sp.q || "").trim().slice(0, 100);
  const rows = await queueRows(search);
  const asked = trackId(sp.t);
  const upload = (sp.u || "").slice(0, 100);
  const first = rows[0];
  const t = asked || (!upload && first?.track_id) || 0;
  const detail = t ? await trackDetail(t) : null;
  const initial =
    (asked && (rows.find((r) => r.track_id === asked)?.key ?? (detail ? `track:${asked}` : null))) ||
    (upload && rows.find((r) => r.kind === "late_scan" && r.key === `late_scan:${upload}`)?.key) ||
    first?.key ||
    null;
  return <QueueView rows={rows} search={search} initial={initial} detail={detail} me={me} canBlockEverywhere={can(access, "blocks")} />;
}
