"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { BotAction } from "@/lib/turnstile";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      action: string;
      theme: string;
      size: string;
      execution: "render" | "execute";
      appearance: "always" | "execute" | "interaction-only";
      "error-callback": (code: string) => boolean;
    },
  ) => string;
  execute: (el: HTMLElement | string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

/**
 * The bot check, inside a form. Cloudflare adds a hidden "cf-turnstile-response" field the server verifies.
 * Nothing loads from Cloudflare until someone starts using the form (focus or tap): visitors who only read
 * the page never contact it, privacy blockers have nothing to flag, and every check that runs gets verified.
 * It stays invisible unless Cloudflare needs a click. A token works once, so it's renewed after every submit.
 * `action` names the form; the server refuses a check solved for another one.
 * Renders nothing when `siteKey` is null (switched off or not configured).
 */
export function Turnstile({ siteKey, action, theme = "dark", eager = false }: { siteKey: string | null; action: BotAction; theme?: "dark" | "light" | "auto"; /** Start the check straight away (it appeared because one is needed now). */ eager?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(eager);

  // Wait for the first sign of use.
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!siteKey || !form || started) return;
    const start = () => setStarted(true);
    // Someone already typing before the page finished loading (slow phones) counts as using the form.
    if (form.contains(document.activeElement)) return void start();
    form.addEventListener("focusin", start);
    form.addEventListener("pointerdown", start);
    return () => {
      form.removeEventListener("focusin", start);
      form.removeEventListener("pointerdown", start);
    };
  }, [siteKey, started]);

  // Then load the script, render and run the check straight away.
  useEffect(() => {
    const el = ref.current;
    if (!siteKey || !el || !started) return;
    let id: string | undefined;
    const tryRender = () => {
      const t = api();
      if (!t || id) return !!id;
      // Without an error callback Cloudflare throws every failed check as a page crash (seen in Sentry when a send
      // page sat open for hours and the background renewal failed). Handled here: Cloudflare retries on its own, the
      // next submit renews the check anyway, and the server still refuses a send without a valid token.
      id = t.render(el, { sitekey: siteKey, action, theme, size: "flexible", execution: "execute", appearance: "interaction-only", "error-callback": () => true });
      t.execute(id);
      return true;
    };
    const timer = setInterval(() => tryRender() && clearInterval(timer), 100);
    tryRender();
    const form = el.closest("form");
    const refresh = () =>
      setTimeout(() => {
        if (!id) return;
        api()?.reset(id);
        api()?.execute(id);
      }, 0);
    form?.addEventListener("submit", refresh);
    return () => {
      clearInterval(timer);
      form?.removeEventListener("submit", refresh);
      if (id) api()?.remove(id);
    };
  }, [siteKey, action, theme, started]);

  if (!siteKey) return null;
  return (
    <>
      {started && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />}
      <div ref={ref} />
    </>
  );
}
