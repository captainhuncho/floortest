import { AuthForm } from "../../AuthForm";
import { verifySecondStep } from "../../actions";

export const metadata = { title: "Two-factor sign-in — FloorTest" };

export default function VerifySignIn() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">One more step</h1>
      <p className="mb-8 text-mute">Enter the 6-digit code from your authenticator app.</p>
      <AuthForm
        action={verifySecondStep}
        submit="Verify"
        fields={[
          {
            name: "code",
            label: "Code",
            type: "text",
            autoComplete: "one-time-code",
            placeholder: "123 456",
            hint: "Lost your phone? Enter one of your recovery codes instead.",
          },
        ]}
        footer={{ text: "Wrong account?", href: "/login", link: "Start again" }}
      />
    </>
  );
}
