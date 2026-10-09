import "server-only";
import { cache } from "react";
import { cookies, draftMode } from "next/headers";
import { PREVIEW_COOKIE, previewer } from "./draft-preview";
import { q } from "./db";
import { hasLiveOpsSession } from "./ops";
import { can, opsAccessFor } from "./ops-access";

/**
 * Who may edit the public site on the page itself: someone previewing drafts from ops (signed preview cookie), still
 * signed in to ops, whose role includes Site content. Everyone else gets null and sees the normal page.
 */
export const siteEditor = cache(async (): Promise<{ adminId: number } | null> => {
  if (!(await draftMode()).isEnabled) return null;
  const id = previewer((await cookies()).get(PREVIEW_COOKIE)?.value);
  if (!id || !(await hasLiveOpsSession(id))) return null;
  const u = await q.get<{ id: number; email: string }>("SELECT id, email FROM users WHERE id = ?", id);
  const access = u ? await opsAccessFor(u) : null;
  return access && can(access, "content") ? { adminId: id } : null;
});
