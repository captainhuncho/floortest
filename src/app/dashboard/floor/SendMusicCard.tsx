import Link from "next/link";

/**
 * Figma "Send Music Card": add their link name after your host (or paste a whole link), or tap someone you've sent to
 * before. Stacked at every width: on the Floor it shares its row with Your link from 640px, so a one-line layout with a
 * fixed-width field ran past its half of the row (and hid "Send to new contact") on tablets and small laptops.
 */
export function SendMusicCard({ recent, host }: { recent: { handle: string; name: string }[]; host: string }) {
  return (
    <section aria-label="Send music" className="flex min-w-0 flex-col gap-3">
      <h2 className="eyebrow">Send music</h2>
      <form action="/dashboard/send" className="flex items-center gap-2 rounded-lg border border-line bg-ink-3 px-3 py-2.5 w-full min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/search.svg" alt="" className="size-4 shrink-0" />
        <label htmlFor="send-to-q" className="sr-only">
          Their link name
        </label>
        <span className="min-w-0 max-w-[65%] shrink truncate text-base text-faint md:text-xs">{host}/</span>
        <input
          id="send-to-q"
          name="to"
          placeholder="their-link"
          autoComplete="off"
          autoCapitalize="none"
          className="-ml-2 min-w-[5rem] flex-1 bg-transparent text-base text-lime outline-none placeholder:text-faint md:text-xs"
          style={{ outline: "none" }}
        />
      </form>
      {recent.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2.5">
          <p className="eyebrow">Recent contacts</p>
          <ul className="flex gap-3 overflow-x-auto">
            {recent.map((r) => (
              <li key={r.handle}>
                <Link href={`/dashboard/send?to=${r.handle}`} className="flex w-[72px] flex-col items-center gap-1.5">
                  <span className="grid size-11 place-items-center rounded-full border border-line bg-ink-2 text-[11px] font-bold text-bone">
                    {r.name.trim()[0]?.toUpperCase()}
                  </span>
                  <span className="w-full truncate text-center text-[11px] text-bone">{r.name.split(/\s+/)[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href="/dashboard/send" className="w-fit text-xs font-bold text-bone hover:text-lime">
        Send to new contact
      </Link>
    </section>
  );
}
