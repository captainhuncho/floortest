import "server-only";
import { sendMail } from "./mail";

/**
 * The email that carries someone's stamped copy of the Terms they accepted. Account holders get it right after
 * sign-up or a re-tick; senders without an account get the PDF on their delivered email instead (once per version).
 */
export function termsPdfMail(o: { userId: number | null; email: string; name: string; acceptanceId: number }) {
  return sendMail({
    userId: o.userId,
    audience: o.userId ? "receiver" : "sender",
    to: o.email,
    subject: "Your copy of the FloorTest Terms",
    body: `Hi ${o.name.split(/\s+/)[0] || "there"},\n\nAttached is a copy of the FloorTest Terms you accepted, stamped with your name, email, the time (UTC) and the Terms version. Keep it for your records.\n\n— FloorTest`,
    reserved: true,
    termsPdf: { acceptanceId: o.acceptanceId, email: o.email },
  });
}
