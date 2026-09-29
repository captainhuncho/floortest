import type { EventRow } from "@/lib/db";
import { fmtDate } from "@/lib/format";

const LABEL: Record<EventRow["type"], string> = {
  submitted: "Sent",
  played: "You listened to",
  downloaded: "You downloaded",
  kept: "You kept",
  passed: "Not for me:",
  note: "Private note",
  reply: "You replied",
  deleted: "You deleted",
  expired: "Auto-deleted",
  moved: "Moved",
  blocked: "You blocked this sender",
  unblocked: "You unblocked this sender",
  played_out: "You played out",
};

export function History({
  events,
  currentTrackId,
  showSender,
}: {
  events: (EventRow & { track_title: string | null; sender_name?: string })[];
  currentTrackId?: number;
  showSender?: boolean;
}) {
  if (!events.length) return <p className="text-sm text-mute">No history yet.</p>;
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3">
          <span aria-hidden className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${e.type === "note" ? "bg-mute" : "bg-lime"}`} />
          <div className="min-w-0">
            <p>
              {showSender && e.sender_name && <span className="text-mute">{e.sender_name}: </span>}
              <span className="font-medium">{LABEL[e.type]}</span>
              {e.track_title && e.type !== "note" && e.type !== "reply" && (
                <span className={e.track_id === currentTrackId ? "text-bone" : "text-mute"}> “{e.track_title}”</span>
              )}
              {(e.type === "moved" || e.type === "submitted") && e.detail && <span className="text-mute"> {e.detail}</span>}
            </p>
            {(e.type === "note" || e.type === "reply") && (
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-ink px-3 py-2 text-mute">{e.detail}</p>
            )}
            <p className="text-sm text-mute">{fmtDate(e.created_at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
