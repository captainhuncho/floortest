import { botCheckKey } from "@/lib/turnstile";
import { siteEditor } from "@/lib/site-editor";
import { EditablePage, editable } from "@/components/Editable";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { login, passkeySignIn, passkeySignInStart } from "../actions";
import { PasskeyButton } from "../PasskeyButton";
import { siteCopy } from "@/lib/content";
import { env, isPreview } from "@/lib/env";
import { AuthFrame, LinkCard } from "../AuthFrame";
import { googleConfig } from "@/lib/google-auth";

const GOOGLE_ERRORS: Record<string, string> = {
  unconfirmed: "Your FloorTest account's email isn't confirmed yet. Use “Email me a sign-in code” below once; after that, Google works.",
  suspended: "This account is suspended. To appeal, go to the Contact page and choose Suspension appeal.",
  expired: "That took too long. Try Continue with Google again.",
  untrusted: "Google sign-in works with Gmail and company Google Workspace accounts. For this email, log in with your password or an email code.",
  different: "A different Google account is connected to this FloorTest account. Use that one, or log in another way.",
  failed: "Google didn't confirm your sign-in. Try again, or log in another way.",
};

export const metadata = { title: "Log in — FloorTest" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const [c, sp, editor] = await Promise.all([siteCopy("auth"), searchParams, siteEditor()]);
  const { E } = editable(c, !!editor);
  const google = !!googleConfig() && !isPreview;
  const googleError = GOOGLE_ERRORS[String(sp.google ?? "")];
  const host = env.appUrl.replace(/^https?:\/\//, "");
  return (
    <EditablePage editing={!!editor} page="auth" label="Sign-up and log-in" values={c}>
      <AuthFrame aside={<LinkCard label="Your link" name="Maxwell Adjavon" role="DJ" handle="maxwell" host={host} initials="MA" note="Every track sent to it lands on your desk." />}>
        <h1 className="af-h"><E k="login_title" /></h1>
        <p className="af-sub"><E k="login_intro" /></p>
        {googleError && (
          <p role="alert" className="af-alert af-first">
            {googleError}
          </p>
        )}
        <div className="af-gap af-first">
          {google && (
            <>
              {/* A plain link: the route sets up the protected hand-off to Google. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/api/auth/google" className="af-btn">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/google.svg" alt="" className="size-[18px]" />
                Continue with Google
              </a>
              <div className="af-or">or</div>
            </>
          )}
          <AuthForm
            action={login}
            challengeKey={await botCheckKey()}
            submit="Log in"
            fields={[
              { name: "email", label: "Email", type: "email", autoComplete: "email" },
              {
                name: "password",
                label: "Password",
                type: "password",
                autoComplete: "current-password",
                hint: (
                  // Two ways in without the password, side by side so the screen fits a small phone.
                  <span className="af-links">
                    <Link href="/forgot" className="af-lnk">Forgot your password?</Link>
                    <Link href="/login/code" className="af-lnk"><E k="login_code_link" /></Link>
                  </span>
                ),
              },
            ]}
            extra={<PasskeyButton label="Sign in with a passkey" begin={passkeySignInStart} finish={passkeySignIn} />}
            footer={{ text: "New to FloorTest?", href: "/signup", link: "Claim your link" }}
          />
        </div>
      </AuthFrame>
    </EditablePage>
  );
}
