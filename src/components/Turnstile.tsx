"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: { sitekey: string; theme: string; size: string; execution: "render" | "execute"; appearance: "always" | "execute" | "interaction-only" }) => string;
  execute: (el: HTMLElement | string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

/**
 * The bot check, inside a form. Cloudflare adds a hidden "cf-turnstile-response" field the server verifies.
 * It only runs once someone starts using the form (focus or tap), so visitors who just look don't create
 * checks that are never verified, and it stays invisible unless Cloudflare needs a click. A token works once,
 * so it's refreshed after every submit. Renders nothing when `siteKey` is null (switched off or not configured).
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
      id = t.render(el, { sitekey: siteKey, theme, size: "flexible", execution: "execute", appearance: "interaction-only" });
      if (started) t.execute(id);
      return true;
    };
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      if (id) api()?.execute(id);
    };
    const timer = setInterval(() => tryRender() && clearInterval(timer), 200);
    tryRender();
    const form = el.closest("form");
    // A token works once: after a submit, reset and run the check again so the next send has a fresh one.
    const refresh = () =>
      setTimeout(() => {
        if (!id) return;
        api()?.reset(id);
        api()?.execute(id);
      }, 0);
    form?.addEventListener("submit", refresh);
    form?.addEventListener("focusin", start);
    form?.addEventListener("pointerdown", start);
    return () => {
      clearInterval(timer);
      form?.removeEventListener("submit", refresh);
      form?.removeEventListener("focusin", start);
      form?.removeEventListener("pointerdown", start);
      if (id) api()?.remove(id);
    };
  }, [siteKey, theme]);
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={ref} />
    </>
  );
}
