import { SettingsNav } from "./SettingsNav";

/** Settings: six short pages. Desktop has a left rail; phones reach each page from the Account menu. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-3 md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-10 md:px-8 md:py-8">
      <SettingsNav />
      <div className="min-w-0 max-w-3xl space-y-6 pb-10">{children}</div>
    </div>
  );
}
