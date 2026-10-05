"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: { sitekey: string; theme: string; size: string; execution: "render" | "execute"; appearance: "always" | "execute" | "interaction-only" }) => string;
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
 * Renders nothing when `siteKey` is null (switched off or not configured).
 */
export function Turnstile({ siteKey, theme = "dark" }: { siteKey: string | null; theme?: "dark" | "light" | "auto" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);

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
      id = t.render(el, { sitekey: siteKey, theme, size: "flexible", execution: "execute", appearance: "interaction-only" });
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
  }, [siteKey, theme, started]);

  if (!siteKey) return null;
  return (
    <>
      {started && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />}
      <div ref={ref} />
    </>
  );
}
