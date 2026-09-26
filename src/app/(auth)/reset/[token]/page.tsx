import Link from "next/link";
import { findPasswordReset } from "@/lib/auth";
import { AuthForm } from "../../AuthForm";
import { resetPassword } from "../../actions";

export const metadata = { title: "Choose a new password — FloorTest", robots: { index: false } };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await findPasswordReset(token)))
    return (
      <>
        <h1 className="mb-2 text-2xl font-bold tracking-tight">This link has expired</h1>
        <p className="mb-6 text-sm text-mute">Reset links work once, for one hour.</p>
        <Link href="/forgot" className="btn-lime">
          Send a new link
        </Link>
      </>
    );
  return (
    <>
      <h1 className="mb-8 text-2xl font-bold tracking-tight">Choose a new password</h1>
      <AuthForm
        action={resetPassword.bind(null, token)}
        submit="Save and log in"
        fields={[
          { name: "password", label: "New password", type: "password", placeholder: "8+ characters", autoComplete: "new-password", minLength: 8 },
          { name: "confirm", label: "Confirm it", type: "password", autoComplete: "new-password", minLength: 8 },
        ]}
      />
      <p className="mt-4 text-sm text-mute">This signs you out on every other device.</p>
    </>
  );
}
