import Link from "next/link";

/** Figma "Send Music Card": add their link name after your host (or paste a whole link), or tap someone you've sent to before. */
export function SendMusicCard({ recent, host }: { recent: { handle: string; name: string }[]; host: string }) {
  return (
    <section aria-label="Send music" className="flex flex-col gap-3 rounded-2xl border border-line bg-ink-3 p-4 md:flex-row md:items-center md:gap-5 md:py-3">
      <h2 className="text-[10px] font-bold uppercase tracking-[1px] text-mute md:shrink-0">Send music</h2>
      <form action="/dashboard/send" className="flex items-center gap-2 rounded-xl border border-line bg-ink p-3 md:w-[380px] md:shrink-0 md:py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/search.svg" alt="" className="size-4 shrink-0" />
        <label htmlFor="send-to-q" className="sr-only">
          Their link name
        </label>
        <span className="min-w-0 max-w-[65%] shrink truncate text-[11px] text-faint">{host}/</span>
        <input
          id="send-to-q"
          name="to"
          placeholder="their-link"
          autoComplete="off"
          autoCapitalize="none"
          className="-ml-2 min-w-[5rem] flex-1 bg-transparent text-[11px] text-lime outline-none placeholder:text-faint"
          style={{ outline: "none" }}
        />
      </form>
      {recent.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2.5 md:flex-row md:items-center md:gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[1px] text-faint">Recent contacts</p>
          <ul className="flex gap-3 overflow-x-auto">
            {recent.map((r) => (
              <li key={r.handle}>
                <Link href={`/dashboard/send?to=${r.handle}`} className="flex w-[72px] flex-col items-center gap-1.5">
                  <span className="grid size-11 place-items-center rounded-full border border-line bg-ink-2 text-[10px] font-bold text-bone">
                    {r.name.trim()[0]?.toUpperCase()}
                  </span>
                  <span className="w-full truncate text-center text-[10px] text-bone">{r.name.split(/\s+/)[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href="/dashboard/send" className="w-fit text-[11px] font-bold text-bone hover:text-lime md:ml-auto md:shrink-0">
        Send to new contact
      </Link>
    </section>
  );
}
