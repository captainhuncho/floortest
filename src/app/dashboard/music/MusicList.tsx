"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CARD } from "@/components/Kit";
import { useConfirm } from "@/components/Dialog";
import { FormError } from "@/components/Feedback";
import { PlayIcon, PlayerWaveform, usePlayer, type PlayerTrack } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { fmtTime } from "@/lib/format";
import { deleteMusic, renameMusic } from "../actions/music";
import { GHOST, LIME } from "../kitButtons";

export type MusicItem = { id: number; title: string; artist: string; duration: number | null; peaks: number[] | null; added: string };

/** A My music track in the player: a negative id so it never matches a desk track, and its own audio route. */
const toPlayer = (t: MusicItem): PlayerTrack => ({ id: -t.id, src: `/api/music/${t.id}/audio`, title: t.title, artist: t.artist, peaks: t.peaks, duration: t.duration, played: true });

/** The desk's own tracks: play any of them; the owner and admins rename and delete. */
export function MusicList({ tracks, canEdit }: { tracks: MusicItem[]; canEdit: boolean }) {
  const { current, playing, play, toggle, seek } = usePlayer();
  const [hidden, setHidden] = useState<number[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [ask, confirmDialog] = useConfirm();
  const toast = useToast();
  const shown = tracks.filter((t) => !hidden.includes(t.id));
  const queue = shown.map(toPlayer);

  async function remove(t: MusicItem) {
    const ok = await ask({ title: `Delete ${t.title}?`, body: "The track and its file are deleted from My music. This can't be undone.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    // Gone at once; back with a message if the server says no.
    setHidden((h) => [...h, t.id]);
    const r = await deleteMusic(t.id).catch(() => ({ ok: false as const, error: "Couldn't delete it. Try again." }));
    if (!r.ok) {
      setHidden((h) => h.filter((id) => id !== t.id));
      toast.show({ message: r.error, tone: "error" });
    } else toast.show({ message: `Deleted ${t.title}` });
  }

  if (!shown.length)
    return <p className={`${CARD} p-5 text-[13px] text-mute`}>{canEdit ? "Nothing here yet. Add your own WAV or MP3 files above; they stay until you delete them." : "Nothing here yet. The owner or an A&R / Admin can add tracks."}</p>;

  return (
    <>
      <ul className={`${CARD} flex flex-col`} aria-label="My music">
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
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => setEditing(t.id)} className="tap-text px-2 text-[12px] font-bold text-mute hover:text-bone" aria-label={`Rename ${t.title}`}>
                        Rename
                      </button>
                      <button type="button" onClick={() => remove(t)} className="tap-text px-2 text-[12px] font-bold text-mute hover:text-danger" aria-label={`Delete ${t.title}`}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
              {t.peaks && <PlayerWaveform on={on} length={t.duration ?? 0} peaks={t.peaks} onSeek={on ? seek : undefined} height={28} label={`Seek ${t.title}`} />}
            </li>
          );
        })}
      </ul>
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
