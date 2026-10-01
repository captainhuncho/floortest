// End-to-end check of the public submission flow against any deployment.
// Usage: npm run smoke -- <base-url> <receiver-handle>
//   e.g. npm run smoke -- http://localhost:3000 maxwell
// Creates one real track (delete it from the dashboard afterwards) and checks a disguised file is refused.

const [base = "http://localhost:3000", handle = "maxwell"] = process.argv.slice(2);
const email = `smoke+${Date.now()}@example.com`;

function wav(seconds = 6, bpm = 124) {
  const rate = 22050;
  const n = rate * seconds;
  const beat = (60 / bpm) * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = (i % beat) / rate;
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 30)) * t) * Math.exp(-t * 9) * 29000), 44 + i * 2);
  }
  return buf;
}

async function submit(file: Buffer, fileName: string) {
  const start = await fetch(`${base}/api/submit/${handle}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `198.51.100.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ name: "Smoke Test", email, title: `Smoke ${new Date().toISOString()}`, genre: "Other", fileName, size: file.length }),
  });
  const s = (await start.json()) as { uploadId?: string; target?: { url: string; headers: Record<string, string> }; error?: string };
  if (!start.ok) return { step: "start", status: start.status, error: s.error };
  const url = new URL(s.target!.url, base).toString();
  const put = await fetch(url, { method: "PUT", headers: s.target!.headers, body: new Uint8Array(file) });
  if (!put.ok) return { step: "upload", status: put.status, error: await put.text() };
  const done = await fetch(`${base}/api/submit/${handle}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: s.uploadId, duration: 6 }),
  });
  const d = (await done.json()) as { token?: string; error?: string };
  return done.ok ? { step: "done", status: done.status, token: d.token } : { step: "complete", status: done.status, error: d.error };
}

(async () => {
  let failed = 0;
  const check = (name: string, ok: boolean, detail: unknown) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok ? "" : JSON.stringify(detail));
    if (!ok) failed++;
  };
  const health = await fetch(`${base}/api/health`);
  check("health endpoint answers", health.ok, await health.text());
  const page = await fetch(`${base}/${handle}`);
  check(`receiver page /${handle} loads`, page.ok, page.status);

  const good = await submit(wav(), "Smoke Test - Kick Loop.wav");
  check("real WAV is delivered", good.step === "done" && !!good.token, good);
  if (good.token) {
    const receipt = await fetch(`${base}/t/${good.token}`);
    check("sender receipt page loads", receipt.ok, receipt.status);
  }
  const fake = await submit(Buffer.from("MZ this is not audio at all, just a disguised file"), "not-audio.wav");
  check("disguised file is refused", fake.step === "complete" && fake.status === 415, fake);

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})();

export {};
