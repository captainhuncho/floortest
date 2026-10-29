/**
 * Text size steps for site copy (the on-page editor's size picker). A page keeps one `sizes` field, e.g.
 * "headline:lg,faq:sm": a field with no entry shows at its designed size. Only these fixed steps exist; the page turns a
 * step into a class (globals.css, "Site text sizes"), never into CSS taken from the request.
 */
export const SIZE_STEPS = { sm: "Smaller", lg: "Larger", xl: "Largest" } as const;
export type SizeStep = keyof typeof SIZE_STEPS;
export type Sizes = Record<string, SizeStep>;

/** The picker's choices, in order. "" is the designed size. */
export const SIZE_CHOICES: { step: SizeStep | ""; label: string }[] = [
  { step: "sm", label: SIZE_STEPS.sm },
  { step: "", label: "Default" },
  { step: "lg", label: SIZE_STEPS.lg },
  { step: "xl", label: SIZE_STEPS.xl },
];

export const isSizeStep = (s: unknown): s is SizeStep => typeof s === "string" && Object.hasOwn(SIZE_STEPS, s);

/** "headline:lg,faq:sm" → { headline: "lg", faq: "sm" }. Anything else (unknown fields, unknown steps, junk) is dropped. */
export function parseSizes(raw: string | null | undefined, allowed?: readonly string[]): Sizes {
  const out: Sizes = {};
  for (const part of String(raw ?? "").split(",")) {
    const [k, step, extra] = part.split(":").map((x) => x.trim());
    if (!k || extra !== undefined || !isSizeStep(step)) continue;
    if (allowed && !allowed.includes(k)) continue;
    if (!Object.hasOwn(out, k)) out[k] = step;
  }
  return out;
}

export const sizesString = (s: Sizes) =>
  Object.entries(s)
    .filter(([, v]) => isSizeStep(v))
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
