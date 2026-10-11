import { switchDesk } from "./actions/account-team";

type Desk = { id: number; name: string; role: string };

/**
 * Shown to anyone on a team: which desk they're working on (and as what), and a menu to switch between their own desk
 * and the teams they're on. Plain forms, so it works before any script loads.
 */
export function DeskBar({ current, own, teams }: { current: Desk; own: Desk; teams: Desk[] }) {
  const onTeam = current.id !== own.id;
  const all = [own, ...teams];
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm sm:px-6 ${onTeam ? "border-lime/40 bg-lime/[0.07]" : "border-line"}`}>
      <span className="min-w-0 truncate">
        {onTeam ? (
          <>
            On <span className="font-semibold">{current.name}</span>&apos;s desk as {current.role === "admin" ? "an admin" : "a member"}
          </>
        ) : (
          <>Your own desk</>
        )}
      </span>
      <details className="relative">
        <summary className="cursor-pointer list-none font-medium underline underline-offset-4 [&::-webkit-details-marker]:hidden">Switch desk</summary>
        <ul className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-line bg-ink-2 p-1 shadow-pop">
          {all.map((d) => (
            <li key={d.id}>
              <form action={switchDesk.bind(null, d.id === own.id ? null : d.id)}>
                <button
                  aria-current={d.id === current.id ? "true" : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left hover:bg-ink-3 ${d.id === current.id ? "font-semibold" : ""}`}
                >
                  <span className="truncate">{d.id === own.id ? `${d.name} (yours)` : d.name}</span>
                  <span className="shrink-0 text-[11px] uppercase text-faint">{d.role}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
