import { AuthForm } from "../../AuthForm";
import { requestLoginCode } from "../../actions";

export const metadata = { title: "Sign in with a code — FloorTest" };

export default function LoginCodePage() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Sign in with a code</h1>
      <p className="mb-8 text-sm text-mute">No password needed. We&apos;ll email you a 6-digit code.</p>
      <AuthForm
        action={requestLoginCode}
        submit="Email me a code"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
        footer={{ text: "Rather use your password?", href: "/login", link: "Log in" }}
      />
    </>
  );
}
