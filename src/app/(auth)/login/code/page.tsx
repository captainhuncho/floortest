import { botCheckKey } from "@/lib/turnstile";
import { AuthForm } from "../../AuthForm";
import { requestLoginCode } from "../../actions";
import { AuthFrame } from "../../AuthFrame";

export const metadata = { title: "Sign in with a code — FloorTest" };

export default async function LoginCodePage() {
  return (
    <AuthFrame>
      <h1 className="af-h">Sign in with a code</h1>
      <p className="af-sub mb-7">No password needed. We&apos;ll email you a 6-digit code.</p>
      <AuthForm
        action={requestLoginCode}
        challengeKey={await botCheckKey()}
        submit="Email me a code"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
        footer={{ text: "Rather use your password?", href: "/login", link: "Log in" }}
      />
    </AuthFrame>
  );
}
