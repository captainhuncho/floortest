import { canResend, checkCode, CodeError, confirmedEmail, sendCode } from "@/lib/sender-code";
import { ipFrom } from "@/lib/ratelimit";
import { BOT_MESSAGE, passedTurnstile } from "@/lib/turnstile";
import { normalEmail } from "@/lib/email-normal";
import { currentTerms, needsTermsTick } from "@/lib/terms-record";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** Is this email already confirmed in this browser? Answers only for the email asked about. */
export async function GET(req: Request) {
  const email = normalEmail(new URL(req.url).searchParams.get("email") ?? "");
  const confirmed = !!email && (await confirmedEmail()) === email;
  // Whether the Terms tick is needed is told only for the email this browser confirmed, never for any other.
  return Response.json({ confirmed, ...(confirmed ? await termsState(email) : {}) }, { headers: { "Cache-Control": "no-store" } });
}

/** Whether this confirmed sender must tick the Terms before sending, and the Terms version and hash to send back. */
async function termsState(email: string) {
  const terms = await currentTerms();
  return { termsNeeded: await needsTermsTick({ email }, terms), termsVersion: terms.version, termsHash: terms.hash };
}

/** send: bot check, then email a code. resend: a new code after a recent send. check: the typed code; sets the cookie. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = normalEmail(String(body.email ?? "")).slice(0, 200);
  if (!EMAIL.test(email)) return bad("Enter a valid email.");
  const ip = ipFrom(req.headers);
  try {
    if (body.action === "send") {
      if (!(await passedTurnstile(body.turnstile, ip, "send"))) return bad(BOT_MESSAGE, 403);
      await sendCode(email, ip, "human");
    } else if (body.action === "resend") {
      if (!(await canResend(email))) return bad("Start again to get a new code.", 403);
      await sendCode(email, ip, "resend");
    } else if (body.action === "check") {
      await checkCode(email, String(body.code ?? "").slice(0, 12));
      return Response.json({ ok: true, ...(await termsState(email)) });
    } else return bad("Unknown request.");
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof CodeError) return bad(e.message);
    throw e;
  }
}
