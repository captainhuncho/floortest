import Link from "next/link";
import { findPasswordReset } from "@/lib/auth";
import { AuthForm } from "../../AuthForm";
import { resetPassword } from "../../actions";
import { AuthFrame } from "../../AuthFrame";

export const metadata = { title: "Choose a new password — FloorTest", robots: { index: false } };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await findPasswordReset(token)))
    return (
      <AuthFrame>
        <h1 className="af-h">This link has expired</h1>
        <p className="af-sub mb-7">Reset links work once, for one hour.</p>
        <Link href="/forgot" className="af-btn af-prime">
          Send a new link
        </Link>
      </AuthFrame>
    );
  return (
    <AuthFrame>
      <h1 className="af-h">Choose a new password</h1>
      <AuthForm
        action={resetPassword.bind(null, token)}
        submit="Save and log in"
        fields={[
          { name: "password", label: "New password", type: "password", placeholder: "8+ characters", autoComplete: "new-password", minLength: 8, strength: true },
          { name: "confirm", label: "Confirm it", type: "password", autoComplete: "new-password", minLength: 8 },
        ]}
      />
      <p className="mt-4 text-sm text-mute">This signs you out on every other device.</p>
    </AuthFrame>
  );
}
