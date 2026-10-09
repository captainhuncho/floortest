import { ExportButton } from "./ExportButton";

/**
 * The same download choices wherever tracks can be downloaded (Prepare for set, a collection page, collection cards):
 * Download crate (a new named folder with a playlist, Rekordbox XML optional) and Files only (just the originals).
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
  const box = size === "md" ? "rounded-lg px-2 py-2.5 text-xs md:px-4" : "rounded-md px-3 py-1.5 text-[11px]";
  const filesHref = `/api/export?files=1${collectionId ? `&collection=${collectionId}&all=1` : ""}`;
  const files = `block whitespace-nowrap border border-line bg-ink-3 text-center font-bold text-bone hover:bg-ink-4 md:shrink-0 ${box}`;
  return (
    <div className={size === "md" ? "grid grid-cols-3 items-start gap-2 md:flex md:shrink-0 md:justify-end" : "flex flex-wrap items-center gap-2"}>
      <ExportButton
        collectionId={collectionId}
        whole={!!collectionId}
        crateName={crateName}
        count={count}
        label="Download crate"
        align="start"
        showCount={false}
        buttonClassName={`btn-lime w-full whitespace-nowrap font-bold disabled:opacity-40 ${box}`}
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
