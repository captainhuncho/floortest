import { botCheckKey } from "@/lib/turnstile";
import { siteEditor } from "@/lib/site-editor";
import { EditablePage, editable } from "@/components/Editable";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { login, passkeySignIn, passkeySignInStart } from "../actions";
import { PasskeyButton } from "../PasskeyButton";
import { siteCopy } from "@/lib/content";
import { isPreview } from "@/lib/env";
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
  return (
    <EditablePage editing={!!editor} page="auth" label="Sign-up and log-in" values={c}>
    <>
      <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone"><E k="login_title" /></h1>
      <p className="mb-8 mt-2 text-[13px] text-mute">Sign in to your music desk.</p>
      {googleError && (
        <p role="alert" className="mb-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          {googleError}
        </p>
      )}
      {google && (
        <>
          {/* A plain link: the route sets up the protected hand-off to Google. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/auth/google" className="btn-ghost flex w-full items-center justify-center gap-3 py-3 text-sm font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/google.svg" alt="" className="size-[18px]" />
            Continue with Google
          </a>
          <div className="my-6 flex items-center gap-3 text-xs text-dim">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
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
              <Link href="/forgot" className="underline-offset-4 hover:text-bone hover:underline">
                Forgot your password?
              </Link>
            ),
          },
        ]}
        footer={{ text: "New to FloorTest?", href: "/signup", link: "Claim your link" }}
      />
      <div className="mt-4">
        <PasskeyButton label="Sign in with a passkey" begin={passkeySignInStart} finish={passkeySignIn} />
      </div>
      <p className="mt-6 text-center text-sm text-mute">
        No password?{" "}
        <Link href="/login/code" className="text-bone underline underline-offset-4">
          Email me a sign-in code
        </Link>
      </p>
    </>
    </EditablePage>
  );
}
