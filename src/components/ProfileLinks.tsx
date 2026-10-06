import { PLATFORMS, type ProfileLink } from "@/lib/socials";

const GLOBE = "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.9 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16zM8.03 8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.03 8zM12 19.96A14.1 14.1 0 0 1 10.09 16h3.82A14.1 14.1 0 0 1 12 19.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4h-3.38z";

/** A row of platform icons linking to someone's profiles. */
export function ProfileLinks({ links, size = 22, className = "" }: { links: ProfileLink[]; size?: number; className?: string }) {
  if (!links.length) return null;
  return (
    <ul className={`flex flex-wrap items-center gap-4 ${className}`} aria-label="Profiles">
      {links.map((l) => {
        const p = PLATFORMS.find((p) => p.key === l.platform);
        return (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" aria-label={p?.label ?? "Website"} title={p?.label ?? "Website"} className="block text-bone opacity-90 transition hover:opacity-100">
              <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
                <path d={p?.icon ?? GLOBE} />
              </svg>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
