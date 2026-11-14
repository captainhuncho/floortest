"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CARD, Icon } from "@/components/Kit";
import { useConfirm } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { moveAllToProjects } from "../actions/music";

const tracks = (n: number) => `${n} track${n === 1 ? "" : "s"}`;

/**
 * 1b (owner, 13 Nov): one tap moves every track the desk added to its collections itself into Projects (in no project).
 * Senders' tracks stay. Asks first: the tracks leave their collections.
 */
export function MoveAllToProjects({ count }: { count: number }) {
  const router = useRouter();
  const toast = useToast();
  const [ask, confirmDialog] = useConfirm();
  const [pending, start] = useTransition();
  const run = async () => {
    const ok = await ask({
      title: `Move ${tracks(count)} to Projects?`,
      body: "Every track you added to a collection yourself moves here, with its audio. They leave their collections, and their artwork and stems go. Tracks senders sent stay where they are.",
      confirmLabel: "Move them",
    });
    if (!ok) return;
    start(async () => {
      const r = await moveAllToProjects();
      const message = r.full
        ? `Moved ${tracks(r.moved)}. Projects are full, so ${tracks(r.left)} stayed in your collections.`
        : r.left
          ? `Moved ${tracks(r.moved)}. ${tracks(r.left)} held for a check stayed in your collections.`
          : `Moved ${tracks(r.moved)} to Projects.`;
      toast.show({ message, tone: r.left ? "error" : undefined });
      router.refresh();
    });
  };
  return (
    <div className={`${CARD} flex flex-wrap items-center gap-3 p-3`}>
      <p className="min-w-0 flex-1 text-[13px] text-mute">
        {tracks(count)} you added yourself {count === 1 ? "is" : "are"} still in your collections.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-well px-3 text-[13px] font-semibold text-bone hover:border-line-2"
      >
        <Icon name="music" className="size-4" />
        {pending ? "Moving…" : "Move all to Projects"}
      </button>
      {confirmDialog}
    </div>
  );
}
