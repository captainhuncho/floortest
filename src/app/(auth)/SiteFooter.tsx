import Link from "next/link";
import { Logo } from "@/components/Logo";
import { siteCopy } from "@/lib/content";
import { footerGroups } from "@/lib/site";

/**
 * The site's footer on sign-in and sign-up (owner, 31 Oct: they're pages of the platform, so they end like the home
 * page): the same groups and links from footerGroups(), the same lines from the home page's copy, in the desk's look.
 * The home page's newsletter box is left out here: a second email field under a sign-in form is easy to type into by
 * mistake (and would share the "Email" label the sign-in tests look for).
 */
export async function SiteFooter() {
  const c = await siteCopy("home");
  const groups = footerGroups();
  const link = (l: { label: string; href: string; external: boolean }) =>
    l.external ? (
      <a href={l.href} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center hover:text-bone">
        {l.label}
      </a>
    ) : (
      <Link href={l.href} className="inline-flex min-h-10 items-center hover:text-bone">
        {l.label}
      </Link>
    );
  return (
    <footer className="mx-auto w-full max-w-5xl px-1 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10 text-[12.5px] text-mute">
      <div className="flex flex-col gap-8 border-t border-line pt-8 lg:flex-row lg:gap-12">
        <div className="lg:w-[38%]">
          <Logo small />
          <p className="mt-2 max-w-xs">{c.footer_line}</p>
        </div>
        <nav aria-label="Footer" className="grid flex-1 grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
          {groups.map((g) => (
            <div key={g.title} className={g.title === "Legal" ? "col-span-2 sm:col-span-1" : ""}>
              <h2 className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-bone">{g.title}</h2>
              {/* Legal is the long list: two columns on phones so it doesn't run down the screen. */}
              <ul className={`mt-2 grid ${g.title === "Legal" ? "grid-cols-2 gap-x-6 sm:grid-cols-1" : ""}`}>
                {g.links.map((l) => (
                  <li key={l.label} className="leading-tight">
                    {link(l)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <p className="mt-8 border-t border-line pt-5 text-[11px] text-dim">
        © {new Date().getFullYear()} FloorTest Labs. {c.footer_note}
      </p>
    </footer>
  );
}
