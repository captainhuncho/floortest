import { botCheckKey } from "@/lib/turnstile";
import { siteEditor } from "@/lib/site-editor";
import { EditablePage, editable } from "@/components/Editable";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { login, passkeySignIn, passkeySignInStart } from "../actions";
import { PasskeyButton } from "../PasskeyButton";
import { siteCopy } from "@/lib/content";
import { isPreview } from "@/lib/env";
import { AuthFrame, AuthIcon } from "../AuthFrame";
import { StoryCaption } from "../Story";
import { storyChapters } from "../chapters";
import { switchOn } from "@/lib/switches";
import { googleConfig } from "@/lib/google-auth";
import { inApp } from "@/lib/in-app";

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
  const [c, sp, editor, sendOn] = await Promise.all([siteCopy("auth"), searchParams, siteEditor(), switchOn("send_music", null)]);
  const { E } = editable(c, !!editor);
  // Google sign-in is offered on the website only, not inside the app (App Review 4.8, owner 15 Nov).
  const app = await inApp();
  const google = !!googleConfig() && !isPreview && !app;
  const googleError = GOOGLE_ERRORS[String(sp.google ?? "")];
  return (
    <EditablePage editing={!!editor} page="auth" label="Sign-up and log-in" values={c}>
      <AuthFrame
        aside={<StoryCaption chapters={storyChapters(sendOn)} />}
        top={
          <>
            <span className="aw-q">New to FloorTest?</span>
            <Link href="/signup" className="aw-login">
              Claim your link
            </Link>
          </>
        }
      >
        <h1 className="af-h"><E k="login_title" /></h1>
        {/* No intro line by default (owner, 17 Nov); a saved one still shows, and the editor can always reach it. */}
        {(c.login_intro || !!editor) && <p className="af-sub"><E k="login_intro" /></p>}
        {googleError && (
          <p role="alert" className="af-alert af-first">
            {googleError}
          </p>
        )}
        <div className="af-gap af-first">
          {app && !!googleConfig() && (
            // Accounts made with Google have no password: the emailed code reaches the same account.
            <p className="af-row">
              Signed up with Google? Use <Link href="/login/code" className="af-lnk"><E k="login_code_link" /></Link>.
            </p>
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
                  <span className="af-links af-links-end">
                    <Link href="/forgot" className="af-lnk">Forgot your password?</Link>
                  </span>
                ),
              },
            ]}
            extra={
              // The other ways in, one tap each, under the main button: a passkey, an emailed code, then Google.
              <>
                <div className="af-or">or</div>
                <PasskeyButton label="Sign in with a passkey" className="af-btn af-sm" begin={passkeySignInStart} finish={passkeySignIn} />
                <Link href="/login/code" className="af-btn af-sm">
                  <AuthIcon name="mail" />
                  <E k="login_code_link" />
                </Link>
                {google && (
                  // A plain link: the route sets up the protected hand-off to Google. Website only, never in the app.
                  // eslint-disable-next-line @next/next/no-html-link-for-pages
                  <a href="/api/auth/google" className="af-btn af-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/google.svg" alt="" className="size-[18px]" />
                    Continue with Google
                  </a>
                )}
              </>
            }
            footer={{ text: "New to FloorTest?", href: "/signup", link: "Claim your link" }}
          />
        </div>
      </AuthFrame>
    </EditablePage>
  );
}
