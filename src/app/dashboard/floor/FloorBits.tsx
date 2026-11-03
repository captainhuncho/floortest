/**
 * The Floor's building blocks (owner, 30 Oct: the "elevated" Floor from the redesign renders): stat tiles with an icon
 * box, info rows like a spec sheet, the desk's ticks and the week's chart. Small type, small boxes, one card surface.
 * The shared parts (icon, chip, tiles, rows) live in components/Kit; the desk strip and legend are the Floor's own.
 * Server components; the play controls live in UpNextHero.
 */

import { Icon, type IconName } from "@/components/Kit";

export { Chip, IconBox, InfoRow, StatTile } from "@/components/Kit";
export type FloorIconName = IconName;
export const FloorIcon = Icon;

/** How full the desk is, one colour per tick of the 26-tick arc (TickArc): waiting (lime), kept (dim lime), not for me (grey), free (empty). */
export function deskTicks({ waiting, kept, passed, limit }: { waiting: number; kept: number; passed: number; limit: number }) {
  const ticks = 26;
  const per = Math.max(limit, 1) / ticks;
  return Array.from({ length: ticks }, (_, i) => {
    const at = (i + 0.5) * per;
    return at < waiting ? "var(--color-lime)" : at < waiting + kept ? "color-mix(in oklab, var(--color-lime) 45%, var(--color-line-2))" : at < waiting + kept + passed ? "color-mix(in oklab, var(--color-mute) 55%, transparent)" : "var(--color-ink-4)";
  });
}

export function Legend({ items }: { items: { label: string; tone: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-mute">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2 rounded-[2.5px] ${i.tone}`} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
