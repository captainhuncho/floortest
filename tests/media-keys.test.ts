import assert from "node:assert/strict";
import { test } from "node:test";
import { MEDIA_ACTIONS, SEEK_STEP, bindMediaSession, type AudioLike, type MediaAction, type SessionLike } from "../src/lib/media-session";
import { VOLUME_STEP, clampVolume, playerKey, volumeWords } from "../src/lib/player-keys";

type Handler = Parameters<SessionLike["setActionHandler"]>[1];

/** A stand-in for navigator.mediaSession that records what the player tells it. */
function stubSession() {
  const handlers = new Map<MediaAction, Handler>();
  const positions: ({ duration: number; position: number; playbackRate: number } | undefined)[] = [];
  const s: SessionLike = {
    metadata: { title: "old" },
    playbackState: "none",
    setActionHandler: (a, h) => void handlers.set(a, h),
    setPositionState: (p) => void positions.push(p),
  };
  return { s, handlers, positions };
}

/** A stand-in audio element: events fire when the test says so. */
function stubAudio(duration = 300) {
  const listeners = new Map<string, Set<() => void>>();
  const a: AudioLike & { fire(ev: string): void; played: number } = {
    currentTime: 0,
    duration,
    paused: true,
    playbackRate: 1,
    played: 0,
    play() {
      a.paused = false;
      a.played++;
      return Promise.resolve();
    },
    pause() {
      a.paused = true;
    },
    addEventListener: (t, l) => void (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(l),
    removeEventListener: (t, l) => void listeners.get(t)?.delete(l),
    fire: (ev) => listeners.get(ev)?.forEach((l) => l()),
  };
  return { a, listeners };
}

const run = (h: Handler | undefined, d: { seekTime?: number; seekOffset?: number; fastSeek?: boolean } = {}) => {
  assert.ok(h, "handler registered");
  h(d);
};

test("binding registers every media action, with next / previous only when there's a list", () => {
  const { s, handlers } = stubSession();
  const { a } = stubAudio();
  bindMediaSession(s, a, { next: () => {}, previous: () => {} });
  for (const action of MEDIA_ACTIONS) assert.equal(typeof handlers.get(action), "function", action);

  const solo = stubSession();
  bindMediaSession(solo.s, stubAudio().a);
  assert.equal(solo.handlers.get("nexttrack"), null, "moderation player: no next");
  assert.equal(solo.handlers.get("previoustrack"), null);
  assert.equal(typeof solo.handlers.get("seekto"), "function");
});

test("the handlers drive the audio: play, pause, stop, seek by 10 s, seek to, next and previous", () => {
  const { s, handlers } = stubSession();
  const { a } = stubAudio(100);
  let next = 0;
  let prev = 0;
  bindMediaSession(s, a, { next: () => next++, previous: () => prev++ });
  run(handlers.get("play"));
  assert.equal(a.paused, false);
  run(handlers.get("pause"));
  assert.equal(a.paused, true);
  a.currentTime = 50;
  run(handlers.get("seekforward"));
  assert.equal(a.currentTime, 50 + SEEK_STEP);
  run(handlers.get("seekbackward"), { seekOffset: 30 });
  assert.equal(a.currentTime, 30, "the system's own step wins");
  run(handlers.get("seekto"), { seekTime: 250 });
  assert.equal(a.currentTime, 100, "never past the end");
  run(handlers.get("seekbackward"));
  run(handlers.get("seekto"), { seekTime: -5 });
  assert.equal(a.currentTime, 0, "never before the start");
  a.currentTime = 40;
  a.paused = false;
  run(handlers.get("stop"));
  assert.equal(a.paused, true);
  assert.equal(a.currentTime, 0);
  run(handlers.get("nexttrack"));
  run(handlers.get("previoustrack"));
  assert.deepEqual([next, prev], [1, 1]);
});

test("a custom play runs instead of audio.play (the desk counts refused plays)", () => {
  const { s, handlers } = stubSession();
  const { a } = stubAudio();
  let asked = 0;
  bindMediaSession(s, a, { play: () => asked++ });
  run(handlers.get("play"));
  assert.equal(asked, 1);
  assert.equal(a.played, 0);
});

test("position and play state follow the audio as it plays and seeks", () => {
  const { s, positions } = stubSession();
  const { a } = stubAudio(200);
  bindMediaSession(s, a);
  assert.equal(s.playbackState, "paused");
  assert.deepEqual(positions.at(-1), { duration: 200, position: 0, playbackRate: 1 });
  void a.play();
  a.fire("play");
  assert.equal(s.playbackState, "playing");
  a.currentTime = 120;
  a.fire("seeked");
  assert.deepEqual(positions.at(-1), { duration: 200, position: 120, playbackRate: 1 });
  a.playbackRate = 1.5;
  a.fire("ratechange");
  assert.equal(positions.at(-1)?.playbackRate, 1.5);
  a.pause();
  a.fire("pause");
  assert.equal(s.playbackState, "paused");
});

test("no position while the length is unknown (setPositionState would throw)", () => {
  const { s, positions } = stubSession();
  const { a } = stubAudio(NaN);
  bindMediaSession(s, a);
  a.fire("seeked");
  assert.equal(positions.length, 0);
  a.duration = 90;
  a.fire("loadedmetadata");
  assert.equal(positions.length, 1);
});

test("cleanup hands the keys back: every handler null, no state, no metadata, no listeners", () => {
  const { s, handlers, positions } = stubSession();
  const { a, listeners } = stubAudio();
  const undo = bindMediaSession(s, a, { next: () => {}, previous: () => {} });
  undo();
  for (const action of MEDIA_ACTIONS) assert.equal(handlers.get(action), null, action);
  assert.equal(s.playbackState, "none");
  assert.equal(s.metadata, null);
  assert.equal(positions.at(-1), undefined, "position cleared");
  for (const set of listeners.values()) assert.equal(set.size, 0);
});

test("a browser that refuses an action (older Safari and 'stop') doesn't break the rest", () => {
  const { s, handlers } = stubSession();
  const set = s.setActionHandler;
  s.setActionHandler = (action, h) => {
    if (action === "stop") throw new TypeError("not supported");
    set(action, h);
  };
  bindMediaSession(s, stubAudio().a);
  assert.equal(typeof handlers.get("seekto"), "function");
  assert.equal(handlers.has("stop"), false);
});

/** A fake focus target: `closest` answers for the selectors that list one of its tags. */
const at = (...tags: string[]) => ({ closest: (sel: string) => (tags.some((t) => sel.split(",").some((p) => p.trim() === t)) ? {} : null) });
const press = (key: string, extra: Record<string, unknown> = {}) => ({ key, code: key === " " ? "Space" : undefined, ...extra });
const desk = { volumeNeedsShift: true };
const shared = { volumeNeedsShift: false };

test("keys: Space plays, arrows seek, M mutes", () => {
  assert.equal(playerKey(press(" "), desk), "toggle");
  assert.equal(playerKey(press("ArrowLeft"), desk), "back");
  assert.equal(playerKey(press("ArrowRight"), desk), "forward");
  assert.equal(playerKey(press("m"), desk), "mute");
  assert.equal(playerKey(press("M"), shared), "mute");
});

test("keys: volume is Shift+↑/↓ on the desk (plain ↑/↓ move between tracks) and ↑/↓ on a shared collection", () => {
  assert.equal(playerKey(press("ArrowUp"), desk), null);
  assert.equal(playerKey(press("ArrowDown"), desk), null);
  assert.equal(playerKey(press("ArrowUp", { shiftKey: true }), desk), "louder");
  assert.equal(playerKey(press("ArrowDown", { shiftKey: true }), desk), "quieter");
  assert.equal(playerKey(press("ArrowUp"), shared), "louder");
  assert.equal(playerKey(press("ArrowDown"), shared), "quieter");
  assert.equal(playerKey(press("ArrowUp", { shiftKey: true }), shared), null);
});

test("keys: ignored while typing, in a dialog or menu, with a modifier, or on a control that uses the key", () => {
  for (const tag of ["input", "textarea", "select", '[role="dialog"]', '[aria-modal="true"]', '[role="menu"]', "dialog"]) {
    assert.equal(playerKey(press(" ", { target: at(tag) }), desk), null, tag);
    assert.equal(playerKey(press("m", { target: at(tag) }), desk), null, tag);
    assert.equal(playerKey(press("ArrowRight", { target: at(tag) }), desk), null, tag);
  }
  assert.equal(playerKey(press("ArrowRight", { metaKey: true }), desk), null);
  assert.equal(playerKey(press("m", { ctrlKey: true }), desk), null);
  assert.equal(playerKey(press("ArrowLeft", { altKey: true }), desk), null);
  assert.equal(playerKey(press(" ", { target: at("button") }), desk), null, "Space presses a focused button");
  assert.equal(playerKey(press("ArrowRight", { target: at("[role=slider]") }), desk), null, "the waveform's own arrows");
  assert.equal(playerKey(press(" ", { target: at("audio") }), shared), null, "a native player's own keys");
  assert.equal(playerKey(press("ArrowRight", { target: at("button") }), desk), "forward", "arrows still seek from a button");
  assert.equal(playerKey(press("k"), desk), null, "the review keys aren't the player's");
});

test("volume clamps to 0–1 in whole percent", () => {
  assert.equal(clampVolume(1.3), 1);
  assert.equal(clampVolume(-0.2), 0);
  assert.equal(clampVolume(Number.NaN), 1);
  let v = 1;
  for (let i = 0; i < 12; i++) v = clampVolume(v - VOLUME_STEP);
  assert.equal(v, 0, "ten steps down is silence, not 1e-16");
  for (let i = 0; i < 3; i++) v = clampVolume(v + VOLUME_STEP);
  assert.equal(v, 0.3);
  assert.equal(volumeWords(0.3, false), "Volume 30%");
  assert.equal(volumeWords(0.3, true), "Muted");
  assert.equal(volumeWords(0, false), "Muted");
});
