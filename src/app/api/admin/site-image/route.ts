import { requireAdminAction } from "@/lib/admin";
import { uploadSiteImage } from "@/lib/site-image-upload";

export const runtime = "nodejs";

/** Admin → Site content: upload an image for a page. Returns its storage key; the editor saves it into the draft. */
export async function POST(req: Request) {
  await requireAdminAction("content");
  return uploadSiteImage(req);
}
