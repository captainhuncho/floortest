import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { login } from "../actions";
import { siteCopy } from "@/lib/content";

export const metadata = { title: "Log in — FloorTest" };

export default async function LoginPage() {
  const c = await siteCopy("auth");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight lg:text-[40px] lg:leading-[44px] lg:tracking-[-1.2px]">{c.login_title}</h1>
      <p className="mb-8 mt-3 text-mute lg:text-base">Sign in to your music desk.</p>
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
