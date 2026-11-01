import "../admin/admin.css";
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
    // Same textured canvas as the admin inside (owner, 1 Nov), with the form on a calm panel.
    <main id="main" className="admin-canvas app-ui flex min-h-dvh items-center justify-center bg-ink px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))] text-bone">
      <div className="admin-rise w-full max-w-[400px]">
        <div className="mb-6 flex items-center justify-between">
          <Logo href="/ops-login" ops />
          <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-bold uppercase tracking-[1px] text-faint">
            <span aria-hidden className="size-1.5 rounded-full bg-[var(--admin-violet,#9b8cff)]" />
            Ops
          </span>
        </div>
        <section aria-labelledby="ops-h" className="admin-panel p-6 sm:p-7">
          <h1 id="ops-h" className="text-[24px] font-semibold tracking-[-0.02em]">Sign in to ops</h1>
          <p className="mb-6 mt-1 text-[14px] text-mute">Password and two-step code, every time.</p>
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
        </section>
        <p className="mt-5 text-center text-[12.5px] text-faint">Signs out after an hour without activity, and after 8 hours at most.</p>
      </div>
    </main>
  );
}
