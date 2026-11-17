"use client";

import { usePathname } from "next/navigation";

/**
 * Settings' two layouts. The Settings page itself (/dashboard/settings) takes the full column; each page it opens
 * keeps the rail beside it on laptops.
 */
export function SettingsShell({ nav, children }: { nav: React.ReactNode; children: React.ReactNode }) {
  const index = usePathname() === "/dashboard/settings";
  return (
    <div className="page-gutter py-4 sm:py-7">
      {index ? (
        <div className="mx-auto w-full max-w-[1000px] pb-10">{children}</div>
      ) : (
        <div className="mx-auto w-full max-w-[1000px] md:grid md:grid-cols-[208px_minmax(0,1fr)] md:items-start md:gap-8 lg:gap-10">
          {nav}
          <div className="flex min-w-0 flex-col gap-4 pb-10 sm:gap-5">{children}</div>
        </div>
      )}
    </div>
  );
}
