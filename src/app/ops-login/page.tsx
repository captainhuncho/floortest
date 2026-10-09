import { botCheckKey } from "@/lib/turnstile";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { currentOpsAdmin } from "@/lib/ops";
import { AuthForm } from "../(auth)/AuthForm";
import { opsSignIn } from "./actions";

export const metadata = { title: "Sign in — FloorTest ops", robots: { index: false, follow: false } };

/** The admin area's own sign-in page (ops.floortest.app). Password and two-step code every time. */
export default async function OpsLogin() {
  if (await currentOpsAdmin()) redirect("/admin");
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-12">
      <Logo href="/ops-login" ops />
      <p className="mt-2 text-[12px] font-medium uppercase tracking-[0.5px] text-dim">Ops</p>
      <h1 className="mb-8 mt-8 text-2xl font-semibold">Sign in</h1>
      <AuthForm
        action={opsSignIn}
        challengeKey={await botCheckKey()}
        submit="Sign in"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "username" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
          { name: "code", label: "Two-step code", placeholder: "6-digit or recovery code", autoComplete: "one-time-code" },
        ]}
      />
      <p className="mt-6 text-xs text-dim">Signs out after an hour without activity, and after 8 hours at most.</p>
    </main>
  );
}
