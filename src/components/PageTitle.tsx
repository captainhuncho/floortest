import type { ReactNode } from "react";

/**
 * A dashboard page's one <h1>: 28px bold, tight (`page-title`). `display` is for the Floor greeting only (32px from sm
 * up). An optional line under it in mute. Pages that need the title inside their own row can use the `page-title`
 * class on the <h1> directly.
 */
export function PageTitle({
  children,
  sub,
  id,
  display,
  className = "",
}: {
  children: ReactNode;
  sub?: ReactNode;
  id?: string;
  display?: boolean;
  className?: string;
}) {
  const h1 = (
    <h1 id={id} className={`${display ? "page-title-display" : "page-title"} ${sub ? "" : className}`}>
      {children}
    </h1>
  );
  if (!sub) return h1;
  return (
    <div className={className}>
      {h1}
      <p className="mt-1.5 text-sm text-mute">{sub}</p>
    </div>
  );
}
