import "server-only";
import { now, q } from "./db";

/** One line in the admin log. Its own module (no Next.js imports) so library code and tests can write it too. */
export async function logAdmin(adminId: number, action: string, target = "", detail = "") {
  await q.run("INSERT INTO admin_log (admin_id, action, target, detail, created_at) VALUES (?,?,?,?,?)", adminId, action, target, detail.slice(0, 300), now());
}
