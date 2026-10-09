import "server-only";
import { cache } from "react";
import { cookies, draftMode } from "next/headers";
import { PREVIEW_COOKIE, previewer } from "./draft-preview";
import { q } from "./db";
import { opsSessionLive } from "./ops";
import { can, opsAccessFor } from "./ops-access";

/**
 * Who may edit the public site on the page itself: someone previewing drafts from ops (signed preview cookie bound to
 * their ops session), whose exact ops session is still live and whose role includes Site content. Everyone else gets null and sees the normal page.
 */
export const siteEditor = cache(async (): Promise<{ adminId: number } | null> => {
  if (!(await draftMode()).isEnabled) return null;
  const p = previewer((await cookies()).get(PREVIEW_COOKIE)?.value);
  if (!p || !(await opsSessionLive(p.session, p.adminId))) return null;
  const id = p.adminId;
  const u = await q.get<{ id: number; email: string }>("SELECT id, email FROM users WHERE id = ?", id);
  const access = u ? await opsAccessFor(u) : null;
  return access && can(access, "content") ? { adminId: id } : null;
});
