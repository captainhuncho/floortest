import { NextResponse } from "next/server";
import { siteEditor } from "@/lib/site-editor";
import { uploadSiteImage } from "@/lib/site-image-upload";

export const runtime = "nodejs";

/** Editing on the page: upload a replacement image. The key goes into the draft when the editor saves. */
export async function POST(req: Request) {
  if (!(await siteEditor())) return NextResponse.json({ error: "Your editing session ended. Open it again from ops." }, { status: 403 });
  return uploadSiteImage(req);
}
