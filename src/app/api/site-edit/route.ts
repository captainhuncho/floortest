import { NextResponse } from "next/server";
import { SITE_PAGES, type SitePage } from "@/lib/content";
import { writeContent } from "@/lib/content-write";
import { siteEditor } from "@/lib/site-editor";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Editing on the page (floortest.app, while previewing from ops): saves the changed fields into the draft, and
 * publishes when asked. Same cleaning, versions and log as Admin → Site content.
 */
export async function POST(req: Request) {
  const ed = await siteEditor();
  if (!ed) return NextResponse.json({ error: "Your editing session ended. Open it again from ops." }, { status: 403 });
  if (!(await allow("site_edit", String(ed.adminId), 120, 3_600_000))) return NextResponse.json({ error: "Too many saves in an hour. Wait a little and try again." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { page?: string; values?: Record<string, unknown>; publish?: boolean } | null;
  const page = body?.page as SitePage;
  if (!body || !Object.hasOwn(SITE_PAGES, page) || !body.values || typeof body.values !== "object") return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const known = Object.fromEntries(Object.entries(body.values).filter(([k]) => Object.hasOwn(SITE_PAGES[page].fields, k)));
  await writeContent(page, known, ed.adminId, !!body.publish, true);
  return NextResponse.json({ ok: true });
}
