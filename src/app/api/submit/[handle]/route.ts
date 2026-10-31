import { NextResponse } from "next/server";
import { currentDeskForChange } from "@/lib/auth";
import { IntakeError, startUpload } from "@/lib/intake";
import { userByHandle } from "@/lib/desk";
import { readSubmission } from "@/lib/submission";
import { ipFrom } from "@/lib/ratelimit";
import { confirmedEmail } from "@/lib/sender-code";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Step 1 of a submission. JSON body with the sender's details and the file's name and size.
 * Returns where to upload the file; the bytes go straight to storage, never through here.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/submit/[handle]">) {
  const receiver = await userByHandle((await ctx.params).handle);
  if (!receiver) return bad("No one has this link. Check the address with the person who shared it.", 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Your details didn't come through. Reload the page and press Send again.");
  }
  // Sending from a FloorTest account: name and email come from the account, not the form.
  const account = body.asAccount ? await currentDeskForChange() : null;
  if (account instanceof Response) return account;
  if (body.asAccount && !account) return bad("Sign in again to send from your account.", 401);
  // On a team desk, sending as the account is for its owner and admins.
  if (account && account.role === "member") return bad(`Only the owner or an A&R / Admin can send music as ${account.name}. Switch to your own desk to send as yourself.`, 403);
  const read = await readSubmission(body, receiver, account);
  if ("error" in read) return bad(read.error, read.status);
  // Without an account, the email must be confirmed with a code first (which is also where the bot check happens).
  if (!account && (await confirmedEmail()) !== read.meta.email) return NextResponse.json({ error: "Confirm your email first.", needsCode: true }, { status: 401 });

  try {
    return NextResponse.json(await startUpload(receiver, read.meta, read.size, ipFrom(req.headers)));
  } catch (e) {
    if (e instanceof IntakeError) return bad(e.message, e.status);
    console.error("[submit:start]", e);
    return bad("Couldn't start the upload. Nothing was sent. Try again in a minute: your details are still here.", 500);
  }
}
