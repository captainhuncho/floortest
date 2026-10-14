/**
 * The Queue while it loads, in the page's own shape (review/page.tsx): title, status tabs, search and three rows; from
 * xl up the review column beside them, so the two-column page doesn't shift when the content arrives. Fades in only
 * after 150ms (.skeleton-in), so a quick navigation shows nothing.
 */
export default function Loading() {
  const bar = "animate-pulse rounded-md bg-ink-3";
  return (
    <div className="skeleton-in grid min-h-full xl:grid-cols-[minmax(0,1fr)_minmax(400px,460px)]" role="status" aria-busy="true" aria-label="Loading">
      <section className="page-gutter min-w-0 py-6">
        <div className={`h-[31px] w-32 ${bar}`} />
        <div className={`mt-2 h-4 w-56 ${bar}`} />
        <div className="mt-6 flex gap-4 overflow-hidden shadow-[inset_0_-1px_0_var(--color-line)]">
          {["w-24", "w-14", "w-24", "w-10"].map((w, i) => (
            <div key={i} className="shrink-0 py-3">
              <div className={`h-4 ${w} ${bar}`} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <div className={`h-10 min-w-48 flex-1 sm:max-w-72 ${bar}`} />
        </div>
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-card bg-ink-2" />
          ))}
        </div>
      </section>
      <aside className="hidden border-l border-line bg-ink-2/60 p-6 xl:sticky xl:top-[68px] xl:block xl:h-[calc(100dvh-68px)] xl:self-start">
        <div className={`h-7 w-3/4 ${bar}`} />
        <div className={`mt-2 h-4 w-1/2 ${bar}`} />
        <div className="mt-6 flex items-center gap-4">
          <div className="size-12 shrink-0 animate-pulse rounded-full bg-ink-3" />
          <div className={`h-[52px] flex-1 ${bar}`} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <div className={`h-11 ${bar}`} />
          <div className={`h-11 ${bar}`} />
        </div>
      </aside>
    </div>
  );
}
