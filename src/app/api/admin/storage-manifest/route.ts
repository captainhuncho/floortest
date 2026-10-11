import { logAdmin, requireAdminAction } from "@/lib/admin";
import { expectedFiles } from "@/lib/storage-audit";

export const runtime = "nodejs";

/** Ops → Storage → Download file list: every file the database expects in storage, with sizes, as the move's "before" record. */
export async function GET() {
  const a = await requireAdminAction("storage");
  const files = await expectedFiles();
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Kind", "Key", "Size (bytes)"], ...files.map((f) => [f.kind, f.key, f.size ?? ""])].map((l) => l.map(cell).join(","));
  await logAdmin(a.id, "downloaded storage file list", "", `${files.length} files`);
  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="floortest-storage-files-${new Date().toISOString().slice(0, 16).replace(":", "")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
