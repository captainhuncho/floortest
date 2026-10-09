import "server-only";
import { revalidatePath } from "next/cache";
import { logAdmin } from "./admin";
import { contentRow, orderString, sectionOrder, SITE_PAGES, type Field, type SitePage } from "./content";
import { now, q } from "./db";

const IMAGE_KEY = /^site\/[a-f0-9]{18}\.(jpg|png|webp)$/;

/** One field, cleaned the same way wherever it was edited (the ops form or on the page). */
function clean(page: SitePage, key: string, fld: Field, raw: unknown) {
  let v = String(raw ?? "").replace(/\r\n/g, "\n").trim().slice(0, 4000);
  if (fld.kind === "image") return v && IMAGE_KEY.test(v) ? v : "";
  if (page === "home" && key === "sections") return orderString(sectionOrder(v || fld.start));
  if (!v) v = fld.start;
  return v;
}

/**
 * Saves a page's wording as a draft, and publishes it when asked (keeping a version to roll back to).
 * `merge` keeps fields that weren't sent (the on-page editor sends only what changed).
 */
export async function writeContent(page: SitePage, incoming: Record<string, unknown>, adminId: number, publish: boolean, merge: boolean) {
  const fields = SITE_PAGES[page].fields as Record<string, Field>;
  const row = merge ? await contentRow(page) : undefined;
  let base: Record<string, string> = {};
  try {
    base = JSON.parse(row?.draft || row?.published || "{}");
  } catch {}
  const values: Record<string, string> = {};
  for (const [k, fld] of Object.entries(fields)) {
    const has = Object.hasOwn(incoming, k);
    values[k] = has || !merge ? clean(page, k, fld, incoming[k]) : typeof base[k] === "string" ? base[k] : fld.start;
  }
  const body = JSON.stringify(values);
  const t = now();
  await q.run(
    `INSERT INTO site_content (page, draft, published, admin_id, updated_at, published_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT (page) DO UPDATE SET draft = excluded.draft, admin_id = excluded.admin_id, updated_at = excluded.updated_at${publish ? ", published = excluded.published, published_at = excluded.published_at" : ""}`,
    page, body, publish ? body : "{}", adminId, t, publish ? t : null,
  );
  if (!publish) await logAdmin(adminId, "saved site content draft", SITE_PAGES[page].label);
  if (publish) {
    await q.run("INSERT INTO site_content_versions (page, body, admin_id, created_at) VALUES (?,?,?,?)", page, body, adminId, t);
    await logAdmin(adminId, "published site content", SITE_PAGES[page].label);
    revalidatePath("/", "layout");
  }
}
