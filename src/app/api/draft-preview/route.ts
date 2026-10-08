import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { isProd } from "@/lib/env";
import { passHolder, PREVIEW_COOKIE, PREVIEW_MS, previewCookie } from "@/lib/draft-preview";
import { hasLiveOpsSession } from "@/lib/ops";
import { SITE_PAGES, type SitePage } from "@/lib/content";
import { OPS_URL } from "@/lib/ops";

export const runtime = "nodejs";

/**
 * floortest.app end of a draft preview from ops. `?t=<pass>&page=` checks the 60-second pass from ops (and that its
 * holder is still signed in to ops), turns on draft mode and opens the page. `?off` ends the preview.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const dm = await draftMode();
  const jar = await cookies();
  if (url.searchParams.has("off")) {
    dm.disable();
    jar.delete(PREVIEW_COOKIE);
    redirect(`${OPS_URL}/admin/content`);
  }
  const adminId = passHolder(url.searchParams.get("t"));
  if (!adminId || !(await hasLiveOpsSession(adminId))) return new Response("This preview link has expired. Open it again from ops.", { status: 403 });
  dm.enable();
  jar.set(PREVIEW_COOKIE, previewCookie(adminId), { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: PREVIEW_MS / 1000 });
  const page = url.searchParams.get("page") as SitePage;
  redirect(SITE_PAGES[page]?.path ?? "/");
}
