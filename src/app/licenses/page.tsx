import { Logo } from "@/components/Logo";

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
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <Logo className="mb-12" />
      <h1 className="text-4xl font-bold tracking-tight">Third-party licenses</h1>
      <p className="mt-3 text-mute">FloorTest is built on these open-source projects.</p>
      <ul className="mt-8 divide-y divide-line rounded-xl border border-line">
        {LICENSES.map(([name, owner, license, url]) => (
          <li key={name} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
            <div>
              <p className="font-medium">{name}</p>
              <p className="text-sm text-mute">© {owner}</p>
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4 hover:text-lime">
              {license} ↗
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
