"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VolumeNote } from "@/components/VolumeNote";
import { SEEK_STEP, seekAudio } from "@/lib/media-session";
import { VOLUME_STEP, clampVolume, playerKey, saveVolume, savedVolume } from "@/lib/player-keys";
import { useMediaSession } from "@/lib/use-media-session";

/**
 * The shared collection page's tracks, one native player each. This adds what a page of players needs: one track at a
 * time (starting one pauses the rest), the media keys and lock screen for the one playing (with next / previous through
 * the list), and keys: Space play/pause, ← / → 10 s, ↑ / ↓ volume, M mute. Each <audio> carries data-title and
 * data-artist for the lock screen.
 */
export function CollectionPlayer({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [touched, setTouched] = useState(0);
  const [count, setCount] = useState(0);

  const audios = useCallback(() => [...(root.current?.querySelectorAll("audio") ?? [])], []);

  // The volume saved on this device, for every player on the page; "play" (it doesn't bubble, so caught on the way
  // down) makes that track the one the keys and the lock screen drive.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const saved = savedVolume();
    const list = audios();
    for (const a of list) {
      a.volume = saved.volume;
      a.muted = saved.muted;
    }
    setVolume(saved.volume);
    setMuted(saved.muted);
    setCount(list.length);
    const onPlay = (e: Event) => {
      if (!(e.target instanceof HTMLAudioElement)) return;
      for (const a of audios()) if (a !== e.target && !a.paused) a.pause();
      setActive(e.target);
    };
    el.addEventListener("play", onPlay, true);
    return () => el.removeEventListener("play", onPlay, true);
  }, [audios]);

  const step = useCallback(
    (by: number) => {
      const list = audios();
      const next = active && list[list.indexOf(active) + by];
      if (!active || !next) return;
      active.pause();
      void next.play().catch(() => {});
    },
    [active, audios],
  );

  useMediaSession({
    audio: active,
    meta: active ? { title: active.dataset.title ?? "", artist: active.dataset.artist } : null,
    onNext: count > 1 ? () => step(1) : undefined,
    onPrev: count > 1 ? () => step(-1) : undefined,
  });

  const changeVolume = useCallback(
    (v: number, m: boolean) => {
      const next = clampVolume(v);
      for (const a of audios()) {
        a.volume = next;
        a.muted = m;
      }
      setVolume(next);
      setMuted(m);
      setTouched((n) => n + 1);
      saveVolume(next, m);
    },
    [audios],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const k = playerKey(e, { volumeNeedsShift: false });
      // Before anything has played, only Space does something (it starts the first track); the arrows still scroll.
      const a = active ?? (k === "toggle" ? audios()[0] : undefined);
      if (!k || !a) return;
      if (k === "toggle") void (a.paused ? a.play().catch(() => {}) : a.pause());
      else if (k === "back") seekAudio(a, a.currentTime - SEEK_STEP);
      else if (k === "forward") seekAudio(a, a.currentTime + SEEK_STEP);
      else if (k === "mute") changeVolume(a.volume, !a.muted);
      else changeVolume(a.volume + (k === "louder" ? VOLUME_STEP : -VOLUME_STEP), false);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, audios, changeVolume]);

  return (
    <div ref={root} data-collection-player>
      {children}
      {count > 0 && (
        <p className="mt-1 flex min-h-5 items-center justify-end gap-3 text-[11px] text-faint">
          <span className="mr-auto hidden [@media(pointer:fine)]:inline">Space play · ←/→ 10s · ↑/↓ volume · M mute · media keys work too</span>
          <VolumeNote volume={volume} muted={muted} touched={touched} />
        </p>
      )}
    </div>
  );
}
