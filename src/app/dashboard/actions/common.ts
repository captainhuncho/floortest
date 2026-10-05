import "server-only";
/** Helpers shared by the dashboard actions (not actions themselves). */
import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";

export const done = () => revalidatePath("/dashboard", "layout");

/** Postgres unique-violation, e.g. two people claiming the same link name at once. */
export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505";

export function ownCollection(userId: number, id: number) {
  if (!Number.isSafeInteger(id)) return Promise.resolve(undefined);
  return q.get<{ id: number; name: string }>("SELECT id, name FROM collections WHERE id = ? AND user_id = ?", id, userId);
}
