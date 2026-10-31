import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyUploadToken, writeLocalUpload } from "@/lib/storage";

export const runtime = "nodejs";

/** Local-storage stand-in for a presigned S3 PUT. Only active with STORAGE_DRIVER=local. */
export async function PUT(req: Request) {
  if (env.storage.driver !== "local") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = verifyUploadToken(new URL(req.url).searchParams.get("token") ?? "");
  if (!auth) return NextResponse.json({ error: "This upload link expired. Start the upload again." }, { status: 403 });
  if (!req.body) return NextResponse.json({ error: "Nothing arrived. Choose the file again." }, { status: 400 });
  try {
    await writeLocalUpload(auth.key, req.body, auth.size);
    return new Response(null, { status: 200 });
  } catch {
    return NextResponse.json({ error: "That file is too large to upload." }, { status: 413 });
  }
}
