import { AuthForm } from "../../AuthForm";
import { PasskeyButton } from "../../PasskeyButton";
import { passkeySecondStep, passkeySecondStepStart, secondStepHasPasskey, verifySecondStep } from "../../actions";

export const metadata = { title: "Two-factor sign-in — FloorTest" };

export default async function VerifySignIn() {
  // A passkey on this account works instead of the code (the account whose password was just checked).
  const passkey = await secondStepHasPasskey();
  return (
    <>
      <h1 className="mb-2 text-[24px] font-semibold leading-[1.15] tracking-[-0.03em] text-bone">One more step</h1>
      <p className="mb-5 text-[13px] leading-5 text-mute">Enter the 6-digit code from your authenticator app{passkey ? ", or use your passkey" : ""}.</p>
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
    </>
  );
}
