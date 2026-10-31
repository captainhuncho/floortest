/**
 * The centred head of the plans and pricing pages: a short line on where pricing stands (free in the beta, or plans
 * and prices), the title, one line under it, then the Monthly / Yearly switch when there is one.
 */
export function PlansIntro({
  billing,
  title,
  sub,
  kicker,
  children,
}: {
  billing: boolean;
  title: React.ReactNode;
  sub: React.ReactNode;
  /** Replaces the default line (the pricing page keeps it short, since its own intro explains the beta). */
  kicker?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col items-center gap-3 pt-2 text-center sm:pt-4">
      <p className="flex items-center gap-2 text-[12px] font-medium text-mute">
        {!billing && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--color-lime)" />}
        {kicker ?? (billing ? "Plans and prices" : "Free during the beta. Paid plans start after it ends.")}
      </p>
      <h1 className="page-title max-w-[22ch]">{title}</h1>
      <p className="max-w-[60ch] text-[14px] leading-6 text-mute">{sub}</p>
      {children && <div className="mt-2 flex flex-col items-center gap-2 sm:flex-row sm:gap-3">{children}</div>}
    </header>
  );
}
