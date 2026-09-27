import { NextResponse } from "next/server";
import { VIEW_AS_COOKIE, viewingAs } from "@/lib/auth";

/** Leaves view-as and goes back to that account in the admin area. */
export async function GET(req: Request) {
  const view = await viewingAs();
  const res = NextResponse.redirect(new URL(view ? `/admin/accounts/${view.userId}` : "/admin", req.url));
  res.cookies.set(VIEW_AS_COOKIE, "", { path: "/dashboard", maxAge: 0 });
  return res;
}
