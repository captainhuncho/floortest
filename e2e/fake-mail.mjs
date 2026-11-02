// A stand-in inbox for the end-to-end copy: with no Resend key, src/lib/mail.ts hands each logged email to MAIL_SINK_URL,
// and a test reads what an address was sent (e2e/link-pages.spec.ts reads a receipt code). Test runs only.
//   POST /mail { to, subject, body }   an email (from the app)
//   GET  /mail?to=<address>            that address's emails, newest last
import http from "node:http";

const PORT = Number(process.env.FAKE_MAIL_PORT || 3212);
const box = [];

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const send = (status, body) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      if (req.method === "POST" && url.pathname === "/mail") {
        const m = JSON.parse(raw || "{}");
        box.push({ to: String(m.to ?? "").toLowerCase(), subject: String(m.subject ?? ""), body: String(m.body ?? ""), at: Date.now() });
        return send(200, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/mail") return send(200, box.filter((m) => m.to === (url.searchParams.get("to") ?? "").toLowerCase()));
      if (req.method === "GET" && url.pathname === "/status") return send(200, { ok: true });
      send(404, { error: "Not found" });
    });
  })
  .listen(PORT, "127.0.0.1");
