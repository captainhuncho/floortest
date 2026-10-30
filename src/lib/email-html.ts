/**
 * The designed version of every email (Figma "Emails · 29 Oct", v2): a receipt, not a newsletter. It is drawn from the
 * same plain text that goes out as the text part, so wording edited in Admin → Site content → Emails needs no second
 * copy. Light by default, dark where the mail app asks for it; one small image (the app icon), at most one button, the
 * rest plain links whose text is the address they go to. Everything a sender typed is escaped.
 *
 * How the text becomes the layout:
 *   the subject                          → the headline
 *   "• line" (and indented lines under)  → a list
 *   a line that is only a code           → the code block (sign-in and email codes)
 *   the first short "Label: https://floortest…" line → the button, with the address written out under it
 *   any other address                    → a link showing that address
 *   "— FloorTest" at the end             → dropped (the brand line sits at the top)
 *   "Stop these emails: …" (added by mail.ts) → the footer link
 *   (always)                             → the footer: why it came, Privacy · Terms · Privacy choices · Contact ·
 *                                          Instagram (not on security emails), © FloorTest Labs
 *   `details` passed with the email (Delivered: Track, Artist, Sent to, File, Sent) → receipt rows above the button (or after a send's track list)
 */
import { env } from "./env";
import { INSTAGRAM_URL, footerGroups } from "./site";

const APP_URL = env.appUrl;

type Kind = { optional: boolean; reserved: boolean };

const C = {
  light: { bg: "#ffffff", text: "#0d0e0b", mute: "#4c4f45", faint: "#66695e", line: "#e3e6d8", panel: "#f1f3e8", link: "#4a6400", btn: "#10110f", btnText: "#ffffff" },
  dark: { bg: "#10110f", text: "#f1f1eb", mute: "#a3a69b", faint: "#94978e", line: "#2c2e29", panel: "#171815", link: "#d5ff48", btn: "#d5ff48", btnText: "#10110f" },
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const L = C.light;

const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g;
const LABEL_LINK_RE = /^([^:]{2,60}):\s+(https?:\/\/\S+)$/;
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{3,15}$/;

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const shown = (url: string) => url.replace(/^https?:\/\//, "");

/** Escapes a line and turns each address in it into a link that shows that address. */
function inline(line: string) {
  let out = "";
  let last = 0;
  for (const m of line.matchAll(URL_RE)) {
    out += escapeHtml(line.slice(last, m.index));
    out += `<a href="${escapeHtml(m[0])}" class="ft-link" style="color:${L.link};text-decoration:underline">${escapeHtml(shown(m[0]))}</a>`;
    last = m.index! + m[0].length;
  }
  return out + escapeHtml(line.slice(last));
}

/** A label short enough to read as a button ("Your receipt", "Claim your link"), not a sentence ("Your link is ready"). */
const buttonLabel = (label: string) => label.length <= 32 && !/[,.]|\b(is|are|was|were|has|have)\b/i.test(label);

type Block = { kind: "p" | "list" | "code" | "button"; lines: string[]; url?: string };

/** Splits the text into paragraphs and picks out the list, code, button and unsubscribe parts. */
export function parseBody(body: string) {
  let unsub: string | null = null;
  let text = body.replace(/\r\n/g, "\n");
  const stop = text.match(/\n*—\nStop these emails: (\S+)\s*$/);
  if (stop) {
    unsub = stop[1];
    text = text.slice(0, stop.index);
  }
  text = text.replace(/\n*— FloorTest\s*$/, "").trim();
  const blocks: Block[] = [];
  let buttonUsed = false;
  for (const para of text.split(/\n{2,}/)) {
    const lines = para.split("\n");
    if (lines.length === 1 && CODE_RE.test(lines[0].trim()) && /\d/.test(lines[0])) {
      blocks.push({ kind: "code", lines: [lines[0].trim()] });
      continue;
    }
    // "On your desk:" then bullets: the lead-in stays a paragraph, the bullets become the list.
    const firstBullet = lines.findIndex((l) => l.startsWith("• "));
    if (firstBullet >= 0) {
      if (firstBullet > 0) blocks.push({ kind: "p", lines: lines.slice(0, firstBullet) });
      // Bullets separated by blank lines (each track with its receipt) are still one list.
      const prev = blocks.at(-1);
      if (firstBullet === 0 && prev?.kind === "list") prev.lines.push(...lines);
      else blocks.push({ kind: "list", lines: lines.slice(firstBullet) });
      continue;
    }
    // The first short "Label: our address" line becomes the button; the paragraph's other lines stay text.
    const rest: string[] = [];
    for (const line of lines) {
      const m = !buttonUsed && line.match(LABEL_LINK_RE);
      if (m && m[2].startsWith(APP_URL) && buttonLabel(m[1].trim())) {
        if (rest.length) blocks.push({ kind: "p", lines: rest.splice(0) });
        blocks.push({ kind: "button", lines: [m[1].trim()], url: m[2] });
        buttonUsed = true;
      } else rest.push(line);
    }
    if (rest.length) blocks.push({ kind: "p", lines: rest });
  }
  return { blocks, unsub };
}

const P_STYLE = `margin:0 0 16px;font-size:15px;line-height:23px;color:${L.text}`;

function renderList(lines: string[]) {
  const items: string[][] = [];
  for (const line of lines) {
    if (line.startsWith("• ")) items.push([line.slice(2)]);
    else if (items.length) items[items.length - 1].push(line.trim());
  }
  const rows = items.map(([first, ...more]) => {
    const sub = more.map((m) => `<br><span class="ft-mute" style="color:${L.mute};font-size:14px">${inline(m)}</span>`).join("");
    return `<tr><td class="ft-line ft-text" style="padding:10px 0;border-bottom:1px solid ${L.line};font-size:15px;line-height:22px;color:${L.text}">${inline(first)}${sub}</td></tr>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ft-line" style="margin:0 0 20px;border-top:1px solid ${L.line}">${rows.join("")}</table>`;
}

function renderBlock(b: Block) {
  if (b.kind === "code")
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px"><tr><td class="ft-panel" style="background:${L.panel};border-radius:8px;padding:14px 20px;font-family:${MONO};font-size:28px;line-height:34px;letter-spacing:4px;color:${L.text}">${escapeHtml(b.lines[0])}</td></tr></table>`;
  if (b.kind === "button")
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 10px"><tr><td class="ft-btn" style="background:${L.btn};border-radius:8px"><a href="${escapeHtml(b.url!)}" class="ft-btn-text" style="display:inline-block;padding:11px 18px;font-size:15px;line-height:20px;font-weight:600;color:${L.btnText};text-decoration:none">${escapeHtml(b.lines[0])}</a></td></tr></table>` +
      `<p class="ft-mute" style="margin:0 0 20px;font-size:13px;line-height:19px;color:${L.mute}">Or open ${inline(b.url!)}</p>`;
  if (b.kind === "list") return renderList(b.lines);
  return `<p style="${P_STYLE}">${b.lines.map(inline).join("<br>")}</p>`;
}

function footerLine({ optional, reserved }: Kind, unsub: string | null) {
  if (unsub) return `You're getting this because of your FloorTest email settings. <a href="${escapeHtml(unsub)}" class="ft-faint" style="color:${L.faint};text-decoration:underline">Stop these emails</a>`;
  if (reserved) return "Sent to the email on your FloorTest account. Security emails can't be turned off.";
  if (optional) return "You're getting this because of your FloorTest email settings.";
  return "";
}

/** The footer's links (owner, 30 Oct): the legal pages from the site footer (so hosted Terms or Privacy URLs follow), Contact, and
 * Instagram to follow us. Security emails leave Instagram out: a sign-in code mail links nowhere but FloorTest. */
const FOOTER_PAGES = ["Privacy Policy", "Terms of Use", "Your Privacy Choices", "Contact us"];
function footerLinks({ reserved }: Kind) {
  const all = footerGroups().flatMap((g) => g.links);
  const links = FOOTER_PAGES.flatMap((label) => all.filter((l) => l.label === label)).map((l) => ({ label: l.label, href: l.external ? l.href : APP_URL + l.href }));
  if (!reserved) links.push({ label: "Instagram", href: INSTAGRAM_URL });
  return links
    .map((l) => `<a href="${escapeHtml(l.href)}" class="ft-mute" style="color:${L.mute};text-decoration:underline;white-space:nowrap">${escapeHtml(l.label)}</a>`)
    .join(`<span class="ft-faint" style="color:${L.faint}"> &nbsp;·&nbsp; </span>`);
}

function footer(kind: Kind, unsub: string | null) {
  const why = footerLine(kind, unsub);
  const row = (html: string, top = 0) => `<tr><td class="ft-faint" style="padding-top:${top}px;font-size:12px;line-height:18px;color:${L.faint}">${html}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ft-line" style="margin-top:28px;border-top:1px solid ${L.line}">` +
    (why ? row(why, 20) : "") +
    row(footerLinks(kind), why ? 12 : 20) +
    row(`© ${new Date().getUTCFullYear()} FloorTest Labs · <a href="${APP_URL}" class="ft-faint" style="color:${L.faint};text-decoration:none">${escapeHtml(shown(APP_URL))}</a>`, 12) +
    `</table>`;
}

const DARK_CSS = (() => {
  const d = C.dark;
  const rules: [string[], string][] = [
    [[".ft-body"], `background:${d.bg}`],
    [[".ft-text", ".ft-text p"], `color:${d.text}`],
    [[".ft-mute", ".ft-mute a"], `color:${d.mute}`],
    [[".ft-faint"], `color:${d.faint}`],
    [[".ft-line"], `border-color:${d.line}`],
    [[".ft-panel"], `background:${d.panel}!important;color:${d.text}`],
    [[".ft-link"], `color:${d.link}`],
    [[".ft-btn"], `background:${d.btn}`],
    [[".ft-btn-text"], `color:${d.btnText}`],
  ];
  const css = (prefix: string) => rules.map(([sel, decl]) => `${sel.map((s) => prefix + s).join(",")}{${decl}!important}`).join("");
  // Apple Mail and most phones read the media query; Outlook.com marks its dark mode with [data-ogsc].
  return `@media (prefers-color-scheme:dark){${css("")}}${css("[data-ogsc] ")}`;
})();

/** Receipt lines (Track, Artist, Sent to…): label left, value right, a hairline under each. */
function renderDetails(details: [string, string][]) {
  const rows = details.map(
    ([label, value]) =>
      `<tr><td class="ft-line ft-mute" style="padding:10px 16px 10px 0;border-bottom:1px solid ${L.line};width:104px;vertical-align:top;font-size:14px;line-height:20px;color:${L.mute}">${escapeHtml(label)}</td>` +
      `<td class="ft-line ft-text" style="padding:10px 0;border-bottom:1px solid ${L.line};vertical-align:top;font-size:14px;line-height:20px;color:${L.text}">${escapeHtml(value)}</td></tr>`,
  );
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ft-line" style="margin:8px 0 24px;border-top:1px solid ${L.line}">${rows.join("")}</table>`;
}

/** The HTML part for an email whose text part is `body`. `details`, if any, sit above the button or after the list. */
export function emailHtml(subject: string, body: string, kind: Kind, details?: [string, string][]) {
  const { blocks, unsub } = parseBody(body);
  const parts = blocks.map(renderBlock);
  if (details?.length) {
    // Above the button; with no button, straight after the first list (a send's tracks); else at the end.
    const button = blocks.findIndex((b) => b.kind === "button");
    const list = blocks.findIndex((b) => b.kind === "list");
    parts.splice(button >= 0 ? button : list >= 0 ? list + 1 : parts.length, 0, renderDetails(details));
  }
  const preheader = blocks.find((b) => b.kind === "p" && !/^(Hi|Hello)\b[^.]*,$/.test(b.lines[0]))?.lines.join(" ").slice(0, 140) ?? "";
  // A code shown in its own block isn't repeated in the headline. Code subjects no longer carry the code (owner, 29 Oct:
  // no repetition, and no code on lock screens), but an email already queued with "123456 is your…" still reads right.
  const code = blocks.find((b) => b.kind === "code")?.lines[0];
  let headline = subject.replace(/\s+[—–-]\s+FloorTest$/, "");
  if (code && headline.includes(code)) headline = headline.replace(`${code} is your `, "Your ").replace(code, "").replace(/\s{2,}/g, " ").trim();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(subject)}</title><style>${DARK_CSS}</style></head>` +
    `<body class="ft-body" style="margin:0;padding:0;background:${L.bg};font-family:${FONT};-webkit-text-size-adjust:100%">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ft-body" style="background:${L.bg}"><tr><td align="center" style="padding:32px 20px 40px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px"><tr><td align="left" class="ft-text" style="font-family:${FONT};color:${L.text}">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px"><tr><td style="padding-right:8px"><img src="${APP_URL}/brand/icon-192.png" width="24" height="24" alt="FloorTest" style="display:block;border:0;border-radius:6px"></td><td class="ft-text" style="font-size:15px;line-height:20px;font-weight:600;color:${L.text}">FloorTest</td></tr></table>` +
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.3px;color:${L.text}" class="ft-text">${escapeHtml(headline)}</h1>` +
    parts.join("") +
    footer(kind, unsub) +
    `</td></tr></table></td></tr></table></body></html>`;
}
