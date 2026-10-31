import { AuthForm } from "../../../AuthForm";
import { verifyLoginCode } from "../../../actions";
import { AuthFrame } from "../../../AuthFrame";

export const metadata = { title: "Enter your code — FloorTest" };

export default function EnterLoginCode() {
  return (
    <AuthFrame>
      <h1 className="af-h">Check your email</h1>
      <p className="af-sub mb-7">If that address has an account, a 6-digit code is on its way. It works once, for 10 minutes.</p>
      <AuthForm
        action={verifyLoginCode}
        submit="Sign in"
        fields={[{ name: "code", label: "Code", type: "text", inputMode: "numeric", autoComplete: "one-time-code", placeholder: "123456" }]}
        footer={{ text: "No email?", href: "/login/code", link: "Send a new code" }}
      />
    </AuthFrame>
  );
}
