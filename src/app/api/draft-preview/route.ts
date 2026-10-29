import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { isProd } from "@/lib/env";
import { PREVIEW_COOKIE, PREVIEW_MS, previewCookie, redeemPass } from "@/lib/draft-preview";
import { opsSessionLive } from "@/lib/ops";
import { SITE_PAGES, type SitePage } from "@/lib/content";
import { OPS_URL } from "@/lib/ops";

export const runtime = "nodejs";

/**
 * floortest.app end of a draft preview from ops. `?t=<pass>&page=` checks the 60-second pass from ops (once only, and
 * that its holder is still signed in to ops), turns on draft mode and opens the page. `?off` ends the preview.
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
  const holder = await redeemPass(url.searchParams.get("t"));
  if (!holder || !(await opsSessionLive(holder.session, holder.adminId))) return new Response("This preview link has expired. Open it again from ops.", { status: 403 });
  dm.enable();
  jar.set(PREVIEW_COOKIE, previewCookie(holder), { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: PREVIEW_MS / 1000 });
  const page = url.searchParams.get("page") as SitePage;
  redirect(SITE_PAGES[page]?.path ?? "/");
}
