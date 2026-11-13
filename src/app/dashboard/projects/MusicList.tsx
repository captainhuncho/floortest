"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CARD } from "@/components/Kit";
import { useConfirm } from "@/components/Dialog";
import { FormError } from "@/components/Feedback";
import { PlayIcon, PlayerWaveform, usePlayer, type PlayerTrack } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { fmtTime } from "@/lib/format";
import { deleteMusic, moveMusic, renameMusic } from "../actions/music";
import { GHOST, LIME } from "../kitButtons";
import { MoreIcon, Sheet } from "./ProjectsUI";

export type MusicItem = { id: number; title: string; artist: string; duration: number | null; peaks: number[] | null; added: string };

/** A Projects track in the player: a negative id so it never matches a desk track, and its own audio route. */
const toPlayer = (t: MusicItem): PlayerTrack => ({ id: -t.id, src: `/api/music/${t.id}/audio`, title: t.title, artist: t.artist, peaks: t.peaks, duration: t.duration, played: true });

/**
 * The desk's own tracks in one place (a project, or those in none): play any of them; the owner and admins rename,
 * move to another project and delete. `here` is the project on screen (null: in no project).
 */
export function MusicList({ tracks, canEdit, folders, here, empty }: { tracks: MusicItem[]; canEdit: boolean; folders: { id: number; name: string }[]; here: number | null; empty: string }) {
  const { current, playing, play, toggle, seek } = usePlayer();
  const [hidden, setHidden] = useState<number[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [menu, setMenu] = useState<MusicItem | null>(null);
  const [moving, setMoving] = useState<MusicItem | null>(null);
  const [ask, confirmDialog] = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const shown = tracks.filter((t) => !hidden.includes(t.id));
  const queue = shown.map(toPlayer);

  // Each leaves this list at once and comes back with a message if the server says no.
  async function leave(t: MusicItem, run: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    setHidden((h) => [...h, t.id]);
    const r = await run().catch(() => ({ ok: false as const, error: "Couldn't do that. Try again." }));
    if (!r.ok) {
      setHidden((h) => h.filter((id) => id !== t.id));
      return toast.show({ message: r.error, tone: "error" });
    }
    toast.show({ message: done });
    router.refresh();
  }

  async function remove(t: MusicItem) {
    const ok = await ask({ title: `Delete ${t.title}?`, body: "The track and its file are deleted from Projects. This can't be undone.", confirmLabel: "Delete", danger: true });
    if (ok) await leave(t, () => deleteMusic(t.id), `Deleted ${t.title}`);
  }

  function moveTo(t: MusicItem, folder: number | null) {
    setMoving(null);
    const name = folder === null ? "no project" : folders.find((f) => f.id === folder)?.name;
    void leave(t, () => moveMusic(t.id, folder), `Moved ${t.title} to ${name}`);
  }

  if (!shown.length) return <p className={`${CARD} p-5 text-[13px] text-mute`}>{empty}</p>;

  const targets: { id: number | null; name: string }[] = [...folders.filter((f) => f.id !== here), ...(here === null ? [] : [{ id: null, name: "No project" }])];

  return (
    <>
      <ul className={`${CARD} flex flex-col`} aria-label="Tracks">
        {shown.map((t) => {
          const on = current?.id === -t.id;
          return (
            <li key={t.id} className="flex flex-col gap-2 border-t border-line p-3 first:border-t-0">
              {editing === t.id ? (
                <RenameForm t={t} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => (on ? toggle() : play(toPlayer(t), queue))}
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-ink"
                    aria-label={on && playing ? `Pause ${t.title}` : `Play ${t.title}`}
                  >
                    <PlayIcon playing={on && playing} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-bone">{t.title}</p>
                    <p className="truncate text-[12px] text-mute">
                      {t.artist || "No artist"} · {fmtTime(t.duration)} · added {t.added}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setMenu(t)}
                      aria-haspopup="menu"
                      aria-label={`More for ${t.title}`}
                      className="grid size-11 shrink-0 place-items-center rounded-[12px] border border-line bg-well text-mute hover:text-bone"
                    >
                      <MoreIcon />
                    </button>
                  )}
                </div>
              )}
              {t.peaks && <PlayerWaveform on={on} length={t.duration ?? 0} peaks={t.peaks} onSeek={on ? seek : undefined} height={28} label={`Seek ${t.title}`} />}
            </li>
          );
        })}
      </ul>
      {menu && (
        <Sheet title={menu.title} onClose={() => setMenu(null)}>
          <button role="menuitem" onClick={() => (setEditing(menu.id), setMenu(null))}>
            Rename
          </button>
          {targets.length > 0 && (
            <button role="menuitem" onClick={() => (setMoving(menu), setMenu(null))}>
              Move to another project
            </button>
          )}
          <button role="menuitem" className="text-danger" onClick={() => (setMenu(null), void remove(menu))}>
            Delete
          </button>
          <button role="menuitem" className="text-center! text-mute" onClick={() => setMenu(null)}>
            Cancel
          </button>
        </Sheet>
      )}
      {moving && (
        <Sheet title={`Move ${moving.title} to`} onClose={() => setMoving(null)}>
          {targets.map((f) => (
            <button key={f.id ?? "none"} role="menuitem" onClick={() => moveTo(moving, f.id)}>
              {f.name}
            </button>
          ))}
          <button role="menuitem" className="text-center! text-mute" onClick={() => setMoving(null)}>
            Cancel
          </button>
        </Sheet>
      )}
      {confirmDialog}
    </>
  );
}

function RenameForm({ t, onDone }: { t: MusicItem; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(t.title);
  const [artist, setArtist] = useState(t.artist);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("The track needs a title.");
    setBusy(true);
    const r = await renameMusic(t.id, title, artist).catch(() => ({ ok: false as const, error: "Couldn't save. Try again." }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="Title" placeholder="Title" className="input text-[16px] sm:text-[13px]" autoFocus />
        <input value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={200} aria-label="Artist" placeholder="Artist" className="input text-[16px] sm:text-[13px]" />
      </div>
      <FormError>{error}</FormError>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={LIME}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDone} disabled={busy} className={GHOST}>
          Cancel
        </button>
      </div>
    </form>
  );
}
