import "server-only";
import { briefItems } from "@/lib/brief";
import { APP_URL } from "@/lib/mail";
import { genresFor } from "@/lib/plans";
import { cleanText, type CardFields } from "./render";
import type { CjkFont } from "./shape";

type Receiver = { name: string; handle: string; tz: string };
type Callout = { name: string; bpm_min: number | null; bpm_max: number | null; brief_wanted: string | null; brief_note: string | null; closes_at: number | null; genres: string };

const TZ_CJK: Record<string, CjkFont> = { "Asia/Tokyo": "jp", "Asia/Seoul": "kr", "Asia/Taipei": "tc", "Asia/Hong_Kong": "tc", "Asia/Macau": "tc" };

/** One East Asian font per card: kana and hangul say which, otherwise Chinese characters follow the account's time zone. */
function cjkFont(text: string, tz: string): CjkFont {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "jp";
  if (/\p{Script=Hangul}/u.test(text)) return "kr";
  return TZ_CJK[tz] ?? "sc";
}

/** What the card prints: only what the public link page already shows, and the same link in words and in the QR. */
export function cardFields(receiver: Receiver, callout: Callout): CardFields {
  const { list, custom } = genresFor(callout);
  const items = briefItems(callout, custom ? list : [], receiver.tz);
  const text = (key: string) => items.find((b) => b.key === key)?.text ?? "";
  const genres = custom ? list.map(cleanText).filter(Boolean).join(", ") : "";
  const bpm = text("bpm") ? `${text("bpm")} BPM` : "";
  const target = `${APP_URL}/${receiver.handle}`;
  const name = cleanText(receiver.name);
  const title = cleanText(callout.name);
  const details = [genres, bpm].filter(Boolean).join(". ") || cleanText(text("wanted"));
  return {
    name: name || receiver.handle,
    handle: receiver.handle,
    callout: title,
    details,
    bpm,
    closes: text("deadline"),
    link: target.replace(/^https?:\/\//, ""),
    target,
    cjk: cjkFont(`${name}${title}${details}`, receiver.tz),
  };
}
