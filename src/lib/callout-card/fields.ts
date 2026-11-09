import "server-only";
import { briefItems } from "@/lib/brief";
import { APP_URL } from "@/lib/mail";
import { genresFor } from "@/lib/plans";
import { cleanText, printable, type CardFields } from "./render";

type Receiver = { name: string; handle: string; tz: string };
type Callout = { name: string; bpm_min: number | null; bpm_max: number | null; brief_wanted: string | null; brief_note: string | null; closes_at: number | null; genres: string };

/** What the card prints: only what the public link page already shows, and the same link in words and in the QR. */
export function cardFields(receiver: Receiver, callout: Callout): CardFields {
  const clean = (s: string) => {
    const text = cleanText(s);
    return printable(text) ? text : "";
  };
  const { list, custom } = genresFor(callout);
  const items = briefItems(callout, custom ? list : [], receiver.tz);
  const text = (key: string) => items.find((b) => b.key === key)?.text ?? "";
  const genres = custom ? list.map(clean).filter(Boolean).join(", ") : "";
  const bpm = text("bpm") ? `${text("bpm")} BPM` : "";
  const target = `${APP_URL}/${receiver.handle}`;
  return {
    name: clean(receiver.name) || receiver.handle,
    handle: receiver.handle,
    callout: clean(callout.name),
    details: [genres, bpm].filter(Boolean).join(". ") || clean(text("wanted")),
    closes: text("deadline"),
    link: target.replace(/^https?:\/\//, ""),
    target,
  };
}
