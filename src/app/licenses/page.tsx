import { DocHead, PublicShell } from "@/components/LegalPage";
import { CARD, Icon } from "@/components/Kit";

export const metadata = { title: "Third-party licenses — FloorTest" };

const LICENSES = [
  ["Next.js", "Vercel, Inc.", "MIT", "https://github.com/vercel/next.js/blob/canary/license.md"],
  ["React & React DOM", "Meta Platforms, Inc.", "MIT", "https://github.com/facebook/react/blob/main/LICENSE"],
  ["Tailwind CSS", "Tailwind Labs, Inc.", "MIT", "https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE"],
  ["server-only", "Vercel, Inc.", "MIT", "https://www.npmjs.com/package/server-only"],
  ["node-qrcode", "Ryan Day", "MIT", "https://github.com/soldair/node-qrcode/blob/master/license"],
  ["Instrument Serif", "The Instrument Serif Project Authors", "SIL Open Font License 1.1", "https://fonts.google.com/specimen/Instrument+Serif/license"],
  ["JetBrains Mono", "The JetBrains Mono Project Authors", "SIL Open Font License 1.1", "https://fonts.google.com/specimen/JetBrains+Mono/license"],
] as const;

export default function Licenses() {
  return (
    <PublicShell>
      <DocHead label={<><Icon name="shield" className="size-[15px]" />Legal</>} title="Third-party licenses">
        <p className="text-[13.5px] leading-6 text-mute">FloorTest is built on these open-source projects.</p>
      </DocHead>
      <ul className={`${CARD} flex flex-col px-4 sm:px-6`}>
        {LICENSES.map(([name, owner, license, url], i) => (
          <li key={name} className={`flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 ${i ? "border-t border-line" : ""}`}>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-bone">{name}</p>
              <p className="text-[11.5px] text-mute">© {owner}</p>
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer" className="tap-text text-[12px] text-mute underline underline-offset-4 hover:text-bone">
              {license} ↗
            </a>
          </li>
        ))}
      </ul>
    </PublicShell>
  );
}
