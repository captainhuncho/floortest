import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { previewPass } from "@/lib/draft-preview";
import { APP_URL } from "@/lib/mail";
import { currentOpsSessionHash } from "@/lib/ops";

/**
 * Admin → Site content → Preview. Drafts show on floortest.app, a different host from ops, so this hands over a
 * 60-second signed pass (see /api/draft-preview). `?off` ends the preview there.
 */
export async function GET(req: Request) {
  const me = await requireAdmin("content");
  const url = new URL(req.url);
  if (url.searchParams.has("off")) {
    (await draftMode()).disable();
    redirect(`${APP_URL}/api/draft-preview?off`);
  }
  const page = url.searchParams.get("page") ?? "";
  const session = await currentOpsSessionHash();
  if (!session) redirect("/ops-login");
  redirect(`${APP_URL}/api/draft-preview?t=${encodeURIComponent(previewPass({ adminId: me.id, session }))}&page=${encodeURIComponent(page)}`);
}
