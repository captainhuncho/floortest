import { AuthForm } from "../../AuthForm";
import { PasskeyButton } from "../../PasskeyButton";
import { passkeySecondStep, passkeySecondStepStart, secondStepHasPasskey, verifySecondStep } from "../../actions";
import { AuthFrame } from "../../AuthFrame";

export const metadata = { title: "Two-factor sign-in — FloorTest" };

export default async function VerifySignIn() {
  // A passkey on this account works instead of the code (the account whose password was just checked).
  const passkey = await secondStepHasPasskey();
  return (
    <AuthFrame>
      <h1 className="af-h">One more step</h1>
      <p className="af-sub mb-7">Enter the 6-digit code from your authenticator app{passkey ? ", or use your passkey" : ""}.</p>
      {passkey && (
        <div className="mb-6">
          <PasskeyButton label="Use a passkey instead" begin={passkeySecondStepStart} finish={passkeySecondStep} />
        </div>
      )}
      <AuthForm
        action={verifySecondStep}
        submit="Verify"
        fields={[
          {
            name: "code",
            label: "Code",
            type: "text",
            inputMode: "numeric",
            autoComplete: "one-time-code",
            placeholder: "123 456",
            hint: "Lost your phone? Enter one of your recovery codes instead.",
          },
        ]}
        footer={{ text: "Wrong account?", href: "/login", link: "Start again" }}
      />
    </AuthFrame>
  );
}
