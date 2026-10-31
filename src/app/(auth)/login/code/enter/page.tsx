import { AuthForm } from "../../../AuthForm";
import { verifyLoginCode } from "../../../actions";

export const metadata = { title: "Enter your code — FloorTest" };

export default function EnterLoginCode() {
  return (
    <>
      <h1 className="mb-2 text-[24px] font-semibold leading-[1.15] tracking-[-0.03em] text-bone">Check your email</h1>
      <p className="mb-5 text-[13px] leading-5 text-mute">If that address has an account, a 6-digit code is on its way. It works once, for 10 minutes.</p>
      <AuthForm
        action={verifyLoginCode}
        submit="Sign in"
        fields={[{ name: "code", label: "Code", type: "text", inputMode: "numeric", autoComplete: "one-time-code", placeholder: "123456" }]}
        footer={{ text: "No email?", href: "/login/code", link: "Send a new code" }}
      />
    </>
  );
}
