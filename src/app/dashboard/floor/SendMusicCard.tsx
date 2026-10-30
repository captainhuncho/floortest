import Link from "next/link";

/**
 * Send music, as part of the Floor's link panel (owner, 30 Oct: it felt out of place as loose bubbles under the desk
 * panel). Type their link name after your host (or paste a whole link) and press Go, or pick someone you've sent to
 * before: they're rows like the desk's links above, with "Send to someone new" last. Stacked at every width.
 */
export function SendMusicCard({ recent, host }: { recent: { handle: string; name: string }[]; host: string }) {
  return (
    <section aria-labelledby="send-h" className="border-t border-line first:border-t-0">
      <div className="flex flex-col gap-2.5 px-4 py-4">
        <h2 id="send-h" className="eyebrow">Send music</h2>
        <form action="/dashboard/send" className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-line bg-ink p-1 pl-3">
          <label htmlFor="send-to-q" className="sr-only">
            Their link name
          </label>
          <span className="min-w-0 max-w-[60%] shrink truncate text-base text-faint md:text-xs">{host}/</span>
          <input
            id="send-to-q"
            name="to"
            placeholder="their-link"
            autoComplete="off"
            autoCapitalize="none"
            required
            className="-ml-2 min-w-[4rem] flex-1 bg-transparent text-base text-bone outline-none placeholder:text-faint md:text-xs"
            style={{ outline: "none" }}
          />
          <button type="submit" className="btn-ghost btn-sm shrink-0">
            Go
          </button>
        </form>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {recent.map((r) => (
          <li key={r.handle}>
            <Link href={`/dashboard/send?to=${r.handle}`} className="group flex min-h-11 items-center gap-2 px-4 py-2.5 text-[13px] text-mute hover:text-bone">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-bold text-bone">{r.name}</span> <span className="text-faint">{host}/{r.handle}</span>
              </span>
              <span aria-hidden className="text-faint transition-transform duration-150 ease-out group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/dashboard/send" className="group flex min-h-11 items-center gap-2 px-4 py-2.5 text-[13px] text-mute hover:text-bone">
            <span className="min-w-0 flex-1">Send to someone new</span>
            <span aria-hidden className="text-faint transition-transform duration-150 ease-out group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
