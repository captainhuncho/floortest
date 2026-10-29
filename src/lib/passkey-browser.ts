import { browserSupportsWebAuthn } from "@simplewebauthn/browser";

/**
 * Whether to offer passkeys in this browser: the website only (the iPhone and Android apps keep their own sign-in
 * until they're set up for passkeys) and only where the browser can make them.
 */
export function passkeysHere() {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !cap?.isNativePlatform?.() && browserSupportsWebAuthn();
}

/** What to say when the browser's passkey prompt ends without an answer. */
export function passkeyProblem(e: unknown) {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return "The passkey prompt was closed or timed out. Try again when you're ready.";
  if (name === "InvalidStateError") return "This device or password manager already has a passkey for your account.";
  return "Your browser couldn't use a passkey here. Try again, or use another way.";
}
