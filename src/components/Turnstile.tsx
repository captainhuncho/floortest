"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: { sitekey: string; theme: string; size: string }) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

/**
 * The bot check, inside a form. Cloudflare adds a hidden "cf-turnstile-response" field the server verifies.
 * Rendered explicitly so it also appears after in-app navigation. A token works once, so it's refreshed
 * after every submit. Renders nothing when `siteKey` is null (the bot check is switched off or not configured).
 */
export function Turnstile({ siteKey, theme = "dark" }: { siteKey: string | null; theme?: "dark" | "light" | "auto" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!siteKey || !el) return;
    let id: string | undefined;
    const tryRender = () => {
      const t = api();
      if (!t || id) return !!id;
      id = t.render(el, { sitekey: siteKey, theme, size: "flexible" });
      return true;
    };
    const timer = setInterval(() => tryRender() && clearInterval(timer), 200);
    tryRender();
    const form = el.closest("form");
    const refresh = () => setTimeout(() => id && api()?.reset(id), 0);
    form?.addEventListener("submit", refresh);
    return () => {
      clearInterval(timer);
      form?.removeEventListener("submit", refresh);
      if (id) api()?.remove(id);
    };
  }, [siteKey, theme]);
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={ref} className="min-h-[65px]" />
    </>
  );
}
