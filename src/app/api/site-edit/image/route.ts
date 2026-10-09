import { NextResponse } from "next/server";
import { siteEditor } from "@/lib/site-editor";
import { uploadSiteImage } from "@/lib/site-image-upload";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** Editing on the page: upload a replacement image. The key goes into the draft when the editor saves. */
export async function POST(req: Request) {
  const ed = await siteEditor();
  if (!ed) return NextResponse.json({ error: "Your editing session ended. Open it again from ops." }, { status: 403 });
  if (!(await allow("site_edit_image", String(ed.adminId), 30, 3_600_000))) return NextResponse.json({ error: "Too many uploads in an hour. Wait a little and try again." }, { status: 429 });
  return uploadSiteImage(req);
}
