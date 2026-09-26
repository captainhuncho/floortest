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
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
        footer={{ text: "New to FloorTest?", href: "/signup", link: "Claim your link" }}
      />
    </>
  );
}
