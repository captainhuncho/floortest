import "server-only";
import { NextResponse } from "next/server";

/** Small helpers shared by the /api/v1 routes (the mobile app's API). Errors are always `{ error }` with a status. */
export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);
export const unauthorized = () => fail("Sign in again.", 401);
export async function body(req: Request): Promise<Record<string, unknown>> {
  return ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
}
