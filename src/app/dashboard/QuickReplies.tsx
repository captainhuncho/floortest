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
    <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Quick replies">
      {quickReplies(senderName).map((q) => (
        <button
          key={q.label}
          type="button"
          onClick={() => onPick(q.text)}
          className="rounded border border-line px-2 py-1 text-[11px] font-bold uppercase tracking-[0.5px] text-bone transition hover:border-lime hover:text-lime active:scale-95"
        >
          {q.label}
        </button>
      ))}
    </div>
  );
}
