import { AuthForm } from "../../../AuthForm";
import { verifyLoginCode } from "../../../actions";

export const metadata = { title: "Enter your code — FloorTest" };

export default function EnterLoginCode() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Check your email</h1>
      <p className="mb-8 text-sm text-mute">If that address has an account, a 6-digit code is on its way. It works once, for 10 minutes.</p>
      <AuthForm
        action={verifyLoginCode}
        submit="Sign in"
        fields={[{ name: "code", label: "Code", type: "text", autoComplete: "one-time-code", placeholder: "123456" }]}
        footer={{ text: "No email?", href: "/login/code", link: "Send a new code" }}
      />
    </>
  );
}
