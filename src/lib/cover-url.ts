/** The URL of a project's or folder's cover (/api/folder-art), or null when it has none. ?v= lets it be cached hard. */
export const coverUrl = (type: "project" | "folder", id: number, key: string | null | undefined) =>
  key ? `/api/folder-art/${type}/${id}?v=${encodeURIComponent(key)}` : null;
