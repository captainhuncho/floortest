import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
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
  if (!receiver) return bad("Receiver not found", 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Could not read the submission.");
  }
  // Sending from a FloorTest account: name and email come from the account, not the form.
  const account = body.asAccount ? await currentUser() : null;
  if (body.asAccount && !account) return bad("Sign in again to send from your account.", 401);
  const read = await readSubmission(body, receiver, account);
  if ("error" in read) return bad(read.error, read.status);
  // Without an account, the email must be confirmed with a code first (which is also where the bot check happens).
  if (!account && (await confirmedEmail()) !== read.meta.email) return NextResponse.json({ error: "Confirm your email first.", needsCode: true }, { status: 401 });

  try {
    return NextResponse.json(await startUpload(receiver, read.meta, read.size, ipFrom(req.headers)));
  } catch (e) {
    if (e instanceof IntakeError) return bad(e.message, e.status);
    console.error("[submit:start]", e);
    return bad("Something went wrong. Please try again.", 500);
  }
}
