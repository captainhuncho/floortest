import "server-only";
import { headers } from "next/headers";
import { isAppUserAgent } from "./app-ua";

/** The current request is from inside the app (App Review 4.8, owner 15 Nov: Google sign-in stays on the website only). */
export async function inApp() {
  return isAppUserAgent((await headers()).get("user-agent") ?? "");
}
