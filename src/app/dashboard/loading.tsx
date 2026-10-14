/** Shown while a dashboard page's data loads. Fades in only after 150ms (.skeleton-in), so a quick navigation shows nothing. */
export default function Loading() {
  return (
    <div className="skeleton-in space-y-4 px-4 py-6 sm:px-8" role="status" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-md bg-ink-3" />
      <div className="h-4 w-72 animate-pulse rounded-md bg-ink-3" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-ink-2" />
        ))}
      </div>
    </div>
  );
}
