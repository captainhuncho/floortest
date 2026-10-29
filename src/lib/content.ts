import "server-only";
import { cache } from "react";
import { cookies, draftMode } from "next/headers";
import { PREVIEW_COOKIE, previewer } from "./draft-preview";
import { opsSessionLive } from "./ops";
import { currentUser } from "./auth";
import { isAdminEmail } from "./admin";
import { q } from "./db";
import { SITE_PAGES, type Copy, type Field, type SitePage, type Values } from "./content-fields";

/** Pages read their wording here: the field definitions live in content-fields.ts, the request-aware reading below. */
export * from "./content-fields";

const parse = (s: string | null | undefined): Values => {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};

export const contentRow = (page: SitePage) =>
  q.get<{ draft: string; published: string; updated_at: number; published_at: number | null }>("SELECT draft, published, updated_at, published_at FROM site_content WHERE page = ?", page);

/** Admins previewing (Admin → Site content → Preview) see drafts; everyone else sees what's published. */
const previewing = cache(async () => {
  if (!(await draftMode()).isEnabled) return false;
  // Opened from ops with a signed pass, and that person is still signed in to ops.
  const p = previewer((await cookies()).get(PREVIEW_COOKIE)?.value);
  if (p && (await opsSessionLive(p.session, p.adminId))) return true;
  const u = await currentUser();
  return !!u && isAdminEmail(u.email);
});

/** A page's wording: the published (or, when previewing, draft) value for each field, else the field's starting text. */
export const siteCopy = cache(async <P extends SitePage>(page: P): Promise<Copy<P>> => {
  const row = await contentRow(page);
  const saved = parse((await previewing()) ? row?.draft : row?.published);
  const fields = SITE_PAGES[page].fields as Record<string, Field>;
  return Object.fromEntries(Object.entries(fields).map(([k, fld]) => [k, typeof saved[k] === "string" ? saved[k] : fld.start])) as Copy<P>;
});

