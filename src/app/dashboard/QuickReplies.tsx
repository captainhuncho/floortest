"use client";

/** One-tap starting points for a reply. They fill the box; nothing is sent until you press Send. */
export const quickReplies = (name: string) => {
  const first = name.trim().split(/\s+/)[0] || "there";
  return [
    { label: "Interested", text: `Thanks ${first}, I'm into this one and I'll be testing it in my sets. Send anything else you're working on.` },
    { label: "Send stems", text: `Thanks ${first}, I like this. Could you send the stems over? It'd help me play it out properly.` },
    {
      label: "Not for me",
      text: `Thanks for sending this, ${first}. It's not right for what I'm playing at the moment, but keep me in mind for future music.`,
    },
  ];
};

export function QuickReplies({ senderName, onPick }: { senderName: string; onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Quick replies">
      {quickReplies(senderName).map((q) => (
        <button
          key={q.label}
          type="button"
          onClick={() => onPick(q.text)}
          className="inline-flex min-h-11 items-center rounded-[10px] border border-line bg-well px-3 text-[12px] font-semibold text-bone transition hover:border-lime hover:text-lime active:scale-95 motion-reduce:active:scale-100 sm:min-h-9"
        >
          {q.label}
        </button>
      ))}
    </div>
  );
}
