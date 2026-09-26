import { db } from "@/lib/db";
import { AuthForm } from "../AuthForm";
import { signup } from "../actions";

export const metadata = { title: "Create your receiver — FloorTest" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const ref = ((await searchParams).ref || "").toUpperCase().slice(0, 16);
  const referrer = ref ? (db().prepare("SELECT name FROM users WHERE referral_code = ?").get(ref) as { name: string } | undefined) : undefined;
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Claim your receiver link</h1>
      <p className="mb-8 text-sm text-mute">One permanent link for every callout. Free for 20 active songs.</p>
      {referrer && (
        <p className="mb-6 rounded-lg border border-lime/40 bg-lime/5 px-4 py-3 text-sm">
          Invited by <span className="font-medium">{referrer.name}</span>. You both get 10 extra song slots once your first track arrives.
        </p>
      )}
      <AuthForm
        action={signup}
        hidden={referrer ? { ref } : undefined}
        submit="Create receiver"
        fields={[
          { name: "name", label: "DJ / curator name", placeholder: "Maxwell", autoComplete: "name" },
          { name: "handle", label: "Your link", prefix: "floortest.app/", placeholder: "maxwell", autoComplete: "username" },
          { name: "email", label: "Email", type: "email", placeholder: "you@example.com", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", placeholder: "8+ characters", autoComplete: "new-password" },
        ]}
        footer={{ text: "Already receiving?", href: "/login", link: "Log in" }}
      />
    </>
  );
}
