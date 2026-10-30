"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteReplyTemplate, getReplyTemplates, saveReplyTemplate } from "./actions/review";

/** Saved replies next to the reply box: insert one, or save what you've written for next time. */
export function ReplyTemplates({ onPick, current }: { onPick: (text: string) => void; current: () => string }) {
  const [list, setList] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    getReplyTemplates().then(setList);
  }, []);

  return (
    <div className="relative">
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Templates{list.length ? ` (${list.length})` : ""}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-[min(20rem,calc(100vw-2rem))] rounded-[13px] border border-line bg-card p-2 shadow-pop">
          {list.length ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {list.map((t, i) => (
                <li key={i} className="flex items-start gap-2 rounded-[10px] hover:bg-well">
                  <button
                    type="button"
                    className="min-w-0 flex-1 px-2 py-1.5 text-left text-[13px]"
                    onClick={() => {
                      onPick(t);
                      setOpen(false);
                    }}
                  >
                    <span className="line-clamp-2">{t}</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete template"
                    className="grid min-h-9 min-w-9 place-items-center text-faint hover:text-danger"
                    onClick={() => start(async () => setList(await deleteReplyTemplate(i)))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-1.5 text-sm text-mute">No templates yet. Write a reply, then save it here.</p>
          )}
          <button
            type="button"
            className="mt-1 w-full rounded-[10px] border-t border-line px-2 py-2 text-left text-[13px] text-lime hover:bg-well disabled:text-mute"
            disabled={pending || list.length >= 10}
            onClick={() => {
              const text = current().trim();
              if (text) start(async () => setList(await saveReplyTemplate(text)));
            }}
          >
            {list.length >= 10 ? "10 templates max" : "+ Save current reply as a template"}
          </button>
        </div>
      )}
    </div>
  );
}
