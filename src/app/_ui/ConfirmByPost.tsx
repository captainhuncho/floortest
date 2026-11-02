"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { IconName } from "@/components/Kit";
import { MessagePage, PRIMARY } from "./MessagePage";

type Words = { title: string; body: string };

/**
 * An email link that does something (arm a reopen alert, confirm a newsletter sign-up) acts only when the person presses
 * the button: opening the page (a GET) changes nothing, so a mail scanner that opens every link can't do it for them
 * (link-page audit, 2 Nov). `action` is a server action bound to the link's token; it answers whether it worked.
 */
export function ConfirmByPost({ action, icon, ask, button, done, failed }: { action: () => Promise<boolean>; icon: IconName; ask: Words; button: string; done: Words; failed: Words }) {
  const [result, run, pending] = useActionState(async () => action(), null as boolean | null);
  const home = (
    <Link href="/" className={PRIMARY}>
      Back to FloorTest
    </Link>
  );
  if (result !== null) {
    const w = result ? done : failed;
    return (
      <MessagePage icon={result ? icon : "link"} tone={result ? "ok" : "off"} title={w.title} actions={home}>
        <p role="status">{w.body}</p>
      </MessagePage>
    );
  }
  return (
    <MessagePage
      icon={icon}
      tone="wait"
      title={ask.title}
      actions={
        <form action={run} className="contents">
          <button className={PRIMARY} disabled={pending} aria-busy={pending || undefined}>
            {pending ? "One moment…" : button}
          </button>
        </form>
      }
    >
      <p>{ask.body}</p>
    </MessagePage>
  );
}
