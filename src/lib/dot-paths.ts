/**
 * Hidden files never leave the server (owner, 2 Nov): any address with a part that starts with "." (/.env, /.git/config,
 * /.htaccess, /icons/.DS_Store, /.npmrc, or the same with %2E for the dot) answers "not found", whatever is on disk, so a
 * dotfile that lands in public/ by mistake still can't be downloaded. The one exception is /.well-known/, the standard
 * public folder (security.txt), and even there a hidden file below it stays hidden.
 */
const PUBLIC_DOT_FOLDER = ".well-known";

export function isHiddenPath(pathname: string): boolean {
  // Decoded twice before splitting, on "\" too, so %2E, %252E and an encoded separator (a%2F.env) can't hide a dot.
  const parts = decode(decode(pathname)).split(/[/\\]/);
  return parts.some((part, i) => part.startsWith(".") && !(i === 1 && part === PUBLIC_DOT_FOLDER));
}

/** The path as the file system would see it; a malformed escape is checked as written. */
function decode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
