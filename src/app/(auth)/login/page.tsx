import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { login } from "../actions";

export const metadata = { title: "Log in — FloorTest" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-8 text-2xl font-bold tracking-tight">Back to the desk</h1>
      <AuthForm
        action={login}
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
      <p className="mt-6 text-center text-sm text-mute">
        No password?{" "}
        <Link href="/login/code" className="text-bone underline underline-offset-4">
          Email me a sign-in code
        </Link>
      </p>
    </>
  );
}
