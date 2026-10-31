import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { requestPasswordReset } from "../actions";

export const metadata = { title: "Reset your password — FloorTest" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="mb-2 text-[24px] font-semibold leading-[1.15] tracking-[-0.03em] text-bone">Reset your password</h1>
      <p className="mb-5 text-[13px] leading-5 text-mute">We&apos;ll email you a link to choose a new one.</p>
      <AuthForm
        action={requestPasswordReset}
        submit="Email me a reset link"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
        footer={{ text: "Remembered it?", href: "/login", link: "Log in" }}
        success={
          <div className="flex flex-col">
            <p className="text-[14px] font-semibold">Check your email.</p>
            <p className="mt-2 text-sm text-mute">
              If that address has an account, a reset link is on its way. It works for one hour.
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm underline underline-offset-4">
              Back to log in
            </Link>
          </div>
        }
      />
    </>
  );
}
