import Link from "next/link";

/** Figma "Send Music Card": type a name or paste a link, or tap someone you've sent to before. */
export function SendMusicCard({ recent }: { recent: { handle: string; name: string }[] }) {
  return (
    <section aria-label="Send music" className="flex flex-col gap-3 rounded-2xl border border-[#2c2e29] bg-[#1e1f1b] p-4">
      <h2 className="text-[10px] font-bold uppercase tracking-[1px] text-[#a3a69b]">Send music</h2>
      <form action="/dashboard/send" className="flex items-center gap-2 rounded-xl border border-[#2c2e29] bg-[#10110f] p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/search.svg" alt="" className="size-4 shrink-0" />
        <label htmlFor="send-to-q" className="sr-only">
          Search by name or paste a link
        </label>
        <input
          id="send-to-q"
          name="to"
          placeholder="Search by name or paste a link"
          autoComplete="off"
          autoCapitalize="none"
          className="min-w-0 flex-1 bg-transparent text-[11px] text-[#f1f1eb] outline-none placeholder:text-[#6b6e65]"
        />
      </form>
      {recent.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[1px] text-[#6b6e65]">Recent contacts</p>
          <ul className="flex gap-3 overflow-x-auto">
            {recent.map((r) => (
              <li key={r.handle}>
                <Link href={`/dashboard/send?to=${r.handle}`} className="flex w-[72px] flex-col items-center gap-1.5">
                  <span className="grid size-11 place-items-center rounded-full border border-[#2c2e29] bg-[#1a1c18] text-[10px] font-bold text-white">
                    {r.name.trim()[0]?.toUpperCase()}
                  </span>
                  <span className="w-full truncate text-center text-[10px] text-[#f1f1eb]">{r.name.split(/\s+/)[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href="/dashboard/send" className="w-fit text-[11px] font-bold text-[#f1f1eb] hover:text-lime">
        Send to new contact
      </Link>
    </section>
  );
}
