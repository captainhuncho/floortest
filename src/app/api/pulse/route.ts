import { currentUser } from "@/lib/auth";
import { deskPulse } from "@/lib/pulse";

/** Signed-in desk: a tiny change marker the open page checks every few seconds (see LivePulse). */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ v: "" }, { status: 401 });
  return Response.json({ v: await deskPulse(user.id) }, { headers: { "Cache-Control": "no-store" } });
}
