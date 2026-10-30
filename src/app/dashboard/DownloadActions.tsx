import { ExportButton } from "./ExportButton";
import { GHOST, GHOST_TALL, LIME, LIME_SM } from "./kitButtons";

/**
 * The same download choices wherever tracks can be downloaded (Prepare for set, a collection page, collection cards):
 * the main download (a new named folder with a playlist, Rekordbox XML optional), named for what you get
 * ("Download collection" or "Download kept"), and Files only (just the originals).
 * `extra` adds a page's own action in the same style (Prepare's Clear kept).
 */
export function DownloadActions({
  collectionId = null,
  count,
  crateName,
  size = "md",
  extra,
}: {
  collectionId?: number | null;
  count: number;
  crateName?: string;
  size?: "md" | "sm";
  extra?: React.ReactNode;
}) {
  // The kit's buttons. Phones fit three across in a grid, so the regular size trims its side padding there.
  const box = size === "md" ? "px-2! md:px-4!" : "";
  const filesHref = `/api/export?files=1${collectionId ? `&collection=${collectionId}&all=1` : ""}`;
  const files = `${size === "md" ? GHOST_TALL : GHOST} w-full md:w-auto ${box}`;
  return (
    <div className={size === "md" ? "grid grid-cols-3 items-start gap-2 md:flex md:shrink-0 md:justify-end" : "flex flex-wrap items-center gap-2"}>
      <ExportButton
        collectionId={collectionId}
        whole={!!collectionId}
        crateName={crateName}
        count={count}
        label={collectionId ? "Download collection" : "Download kept"}
        align="start"
        showCount={false}
        buttonClassName={`${size === "md" ? LIME : LIME_SM} w-full ${box}`}
      />
      {count > 0 ? (
        <a href={filesHref} className={files} title="The original audio files, no playlist or XML">
          Files only
        </a>
      ) : (
        <span className={`pointer-events-none opacity-40 ${files}`}>Files only</span>
      )}
      {extra}
    </div>
  );
}
