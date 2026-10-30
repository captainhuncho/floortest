import { Logo } from "./Logo";

/** Built-in legal drafts. Replace with reviewed documents via TERMS_URL / PRIVACY_URL. */
export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: [string, string[]][] }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <Logo className="mb-12" />
      <p role="note" className="mb-8 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-[#ffb4aa]">
        Draft for the private beta. It describes how FloorTest works today.
      </p>
      <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-mute">Last updated {updated}</p>
      {sections.map(([h, paras]) => (
        <section key={h} className="mt-9">
          <h2 className="text-lg font-semibold">{h}</h2>
          {paras.map((p) => (
            <p key={p} className="mt-3 text-mute">
              {p}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
