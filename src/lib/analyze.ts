"use client";

export type Analysis = { duration: number; peaks: number[]; bpm: number | null };

const PEAK_COUNT = 180;

/** Decodes the file in the browser to get duration, a waveform overview and a tempo estimate. */
export async function analyzeAudio(file: File): Promise<Analysis | null> {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    void ctx.close();
    const mono = mixdown(audio);
    return { duration: audio.duration, peaks: peaks(mono), bpm: estimateBpm(mono, audio.sampleRate) };
  } catch {
    return null;
  }
}

function mixdown(buf: AudioBuffer) {
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buf.numberOfChannels;
  }
  return out;
}

function peaks(x: Float32Array) {
  const size = Math.max(1, Math.floor(x.length / PEAK_COUNT));
  const out: number[] = [];
  let max = 0;
  for (let p = 0; p < PEAK_COUNT; p++) {
    let m = 0;
    const end = Math.min(x.length, (p + 1) * size);
    for (let i = p * size; i < end; i++) {
      const v = Math.abs(x[i]);
      if (v > m) m = v;
    }
    out.push(m);
    if (m > max) max = m;
  }
  return out.map((v) => Math.round((max ? v / max : 0) * 100) / 100);
}

/** Onset-envelope autocorrelation over a 60s window, folded into a DJ-friendly 85–175 BPM range. */
export function estimateBpm(x: Float32Array, rate: number): number | null {
  const hop = Math.round(rate / 100); // 100 envelope frames per second
  const start = Math.min(Math.floor(x.length * 0.25), Math.max(0, x.length - rate * 60));
  const end = Math.min(x.length, start + rate * 60);
  const frames = Math.floor((end - start) / hop);
  if (frames < 400) return null;

  const env = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    const s = start + f * hop;
    for (let i = s; i < s + hop; i++) e += x[i] * x[i];
    e = Math.log1p(e * 100);
    env[f] = Math.max(0, e - prev);
    prev = e;
  }
  const mean = env.reduce((a, b) => a + b, 0) / frames;
  for (let f = 0; f < frames; f++) env[f] -= mean;

  const fps = rate / hop;
  let best = 0;
  let bestLag = 0;
  const minLag = Math.floor((fps * 60) / 180);
  const maxLag = Math.ceil((fps * 60) / 70);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let f = 0; f + lag < frames; f++) s += env[f] * env[f + lag];
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  if (!bestLag) return null;
  // Parabolic interpolation around the peak for sub-frame accuracy.
  const ac = (lag: number) => {
    let s = 0;
    for (let f = 0; f + lag < frames; f++) s += env[f] * env[f + lag];
    return s;
  };
  const a = ac(bestLag - 1), b = best, c = ac(bestLag + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  let bpm = (60 * fps) / (bestLag + (Number.isFinite(shift) ? shift : 0));
  while (bpm < 85) bpm *= 2;
  while (bpm > 175) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}
