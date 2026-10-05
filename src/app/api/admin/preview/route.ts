import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { SITE_PAGES, type SitePage } from "@/lib/content";

/** Admin → Site content → Preview: turn on draft view for this browser and open the page. `?off` turns it off. */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const dm = await draftMode();
  if (url.searchParams.has("off")) {
    dm.disable();
    redirect("/admin/content");
  }
  dm.enable();
  const page = url.searchParams.get("page") as SitePage;
  redirect(SITE_PAGES[page]?.path ?? "/");
}
