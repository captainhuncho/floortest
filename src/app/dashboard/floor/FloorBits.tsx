/**
 * The Floor's building blocks (owner, 30 Oct: the "elevated" Floor from the redesign renders): stat tiles with an icon
 * box, info rows like a spec sheet, the desk strip and the week's chart. Small type, small boxes, one card surface.
 * The shared parts (icon, chip, tiles, rows) live in components/Kit; the desk strip and legend are the Floor's own.
 * Server components; the play controls live in UpNextHero.
 */

import { Icon, type IconName } from "@/components/Kit";

export { Chip, IconBox, InfoRow, StatTile } from "@/components/Kit";
export type FloorIconName = IconName;
export const FloorIcon = Icon;

/** How full the desk is, as ticks: waiting (lime), kept (dim lime), not for me (grey), free (empty). Decorative; the legend says the numbers. */
export function DeskStrip({ waiting, kept, passed, limit }: { waiting: number; kept: number; passed: number; limit: number }) {
  const cells = Math.min(40, Math.max(limit, 1));
  const per = Math.max(limit, 1) / cells;
  return (
    <div aria-hidden className="flex h-6 gap-[2.5px]">
      {Array.from({ length: cells }, (_, i) => {
        const at = i * per;
        const tone = at < waiting ? "bg-lime" : at < waiting + kept ? "bg-[color-mix(in_oklab,var(--color-lime)_45%,var(--color-line-2))]" : at < waiting + kept + passed ? "bg-mute/55" : "bg-line-2";
        return <span key={i} className={`flex-1 rounded-[2px] ${tone}`} />;
      })}
    </div>
  );
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
