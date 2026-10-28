// A stand-in for the virus scanner's Worker (scanner/cloudflare/index.js) for the end-to-end copy: every file is clean,
// but a test can make it sleep (until woken, or for a while: answers "starting" like a waking container) or stay down.
//   POST /__mode { asleepMs?: number, down?: boolean }   sets the behaviour (test only)
//   GET  /__seen                                         what it was asked since the last /__mode
import http from "node:http";

const PORT = Number(process.env.FAKE_SCANNER_PORT || 3211);
const SECRET = process.env.SCAN_SECRET || "";
let asleepUntil = 0;
let down = false;
let seen = [];

const send = (res, status, body, headers = {}) => res.writeHead(status, { "Content-Type": "application/json", ...headers }).end(JSON.stringify(body));

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const route = `${req.method} ${req.url}`;
      if (route === "POST /__mode") {
        const m = JSON.parse(raw || "{}");
        asleepUntil = m.asleepMs ? Date.now() + m.asleepMs : 0;
        down = !!m.down;
        seen = [];
        return send(res, 200, { ok: true });
      }
      if (route === "GET /__seen") return send(res, 200, seen);
      seen.push(route);
      const waking = down || Date.now() < asleepUntil;
      if (route === "GET /status") return send(res, 200, { worker: true, container: waking ? "stopped" : "healthy" });
      if (route === "GET /health") return waking ? send(res, 503, { error: "Scanner starting" }, { "Retry-After": "10" }) : send(res, 200, { clamd: true });
      if (req.headers.authorization !== `Bearer ${SECRET}`) return send(res, 401, { error: "Unauthorized" });
      // Woken: ready about 1.5 s later (a real cold start is 15–30 s), unless it's set to stay down.
      if (route === "POST /wake") {
        if (!down && Date.now() < asleepUntil) asleepUntil = Date.now() + 1_500;
        return send(res, 202, { waking: true });
      }
      if (route === "POST /scan") return waking ? send(res, 503, { error: "Scanner starting" }, { "Retry-After": "10" }) : send(res, 200, { clean: true });
      send(res, 404, { error: "Not found" });
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake scanner on ${PORT}`));
