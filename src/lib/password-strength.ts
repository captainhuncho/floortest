/**
 * Password strength, shared by the live meter and the server checks so both always agree.
 * An estimate, not a guarantee: length and variety raise the score; common passwords, patterns and
 * the person's own name, email or link name pull it down. Score 2 ("Okay") or above is accepted.
 */

const COMMON = new Set(
  "password password1 password123 passw0rd 12345678 123456789 1234567890 qwerty123 qwertyuiop 11111111 00000000 iloveyou letmein welcome welcome1 admin123 abc12345 football baseball monkey123 sunshine princess dragon master superman trustno1 starwars whatever freedom computer michael shadow jordan23 liverpool chelsea arsenal floortest music123 dj123456 producer soundcloud beatport spotify techno123 housemusic amapiano afrobeats"
    .split(" "),
);
const ROWS = ["abcdefghijklmnopqrstuvwxyz", "qwertyuiopasdfghjklzxcvbnm", "01234567890"];

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 200;
export const LABELS = ["Too weak", "Weak", "Okay", "Strong", "Very strong"] as const;

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: (typeof LABELS)[number]; tip: string | null; ok: boolean };

/** Length of runs that follow a keyboard or alphabet row (abcd, 4321, qwer), or repeat one character (aaaa). */
function patterned(pw: string) {
  const s = pw.toLowerCase();
  let n = 0;
  for (let i = 2; i < s.length; i++) {
    const [a, b, c] = [s[i - 2], s[i - 1], s[i]];
    const run = ROWS.some((r) => {
      const x = r.indexOf(a), y = r.indexOf(b), z = r.indexOf(c);
      return x >= 0 && y >= 0 && z >= 0 && ((y === x + 1 && z === y + 1) || (y === x - 1 && z === y - 1));
    });
    if (run || (a === b && b === c)) n++;
  }
  return n;
}

export function passwordStrength(pw: string, context: string[] = []): Strength {
  const make = (score: Strength["score"], tip: string | null): Strength => ({ score, label: LABELS[score], tip, ok: score >= 2 && pw.length >= MIN_LENGTH && pw.length <= MAX_LENGTH });
  if (!pw) return make(0, null);
  if (pw.length > MAX_LENGTH) return make(0, `Use ${MAX_LENGTH} characters or fewer.`);
  const lower = pw.toLowerCase();
  const stripped = lower.replace(/[^a-z]/g, "");
  if (COMMON.has(lower) || (stripped.length >= 4 && COMMON.has(stripped))) return make(0, "That's one of the most common passwords. Pick something only you would use.");
  const own = context
    .flatMap((c) => c.toLowerCase().split(/[@\s.]+/))
    .filter((p) => p.length >= 3)
    .find((p) => lower.includes(p));
  if (own) return make(0, "Don't use your name, email or link name in your password.");
  if (pw.length < MIN_LENGTH) return make(0, `Use at least ${MIN_LENGTH} characters.`);

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const pool = [/[a-z]/.test(pw) && 26, /[A-Z]/.test(pw) && 26, /[0-9]/.test(pw) && 10, /[^A-Za-z0-9]/.test(pw) && 33].reduce<number>((s, v) => s + (v || 0), 0);
  const unique = new Set(lower).size;
  // Patterned and repeated characters add almost nothing, so count them at a fraction.
  const effective = Math.max(1, Math.min(pw.length, unique * 2) - patterned(pw) * 0.75);
  const bits = effective * Math.log2(Math.max(pool, 10));

  const score = (bits < 30 ? 0 : bits < 40 ? 1 : bits < 55 ? 2 : bits < 75 ? 3 : 4) as Strength["score"];
  const tip =
    score >= 3
      ? null
      : patterned(pw) > 1
        ? "Avoid sequences and repeats like abcd, 1234 or aaaa."
        : pw.length < 12
          ? "Make it longer. A few unrelated words work well."
          : classes < 3
            ? "Mix in capitals, numbers or symbols."
            : "Make it longer or less predictable.";
  return make(score, tip);
}
