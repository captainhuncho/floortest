import { botCheckKey } from "@/lib/turnstile";
import { AuthForm } from "../../AuthForm";
import { requestLoginCode } from "../../actions";

export const metadata = { title: "Sign in with a code — FloorTest" };

export default async function LoginCodePage() {
  return (
    <>
      <h1 className="mb-2 text-[24px] font-semibold leading-[1.15] tracking-[-0.03em] text-bone">Sign in with a code</h1>
      <p className="mb-5 text-[13px] leading-5 text-mute">No password needed. We&apos;ll email you a 6-digit code.</p>
      <AuthForm
        action={requestLoginCode}
        challengeKey={await botCheckKey()}
        submit="Email me a code"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
        footer={{ text: "Rather use your password?", href: "/login", link: "Log in" }}
      />
    </>
  );
}
