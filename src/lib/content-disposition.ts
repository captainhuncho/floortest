/**
 * The Content-Disposition for a download (Safety, 4 Nov): one helper, so a sender's file name can't break the header.
 * The plain `filename` keeps printable ASCII only, without `\` or `"`; `filename*` carries the real name, with `'()*`
 * percent-encoded too (encodeURIComponent leaves them, and RFC 5987 doesn't allow them unencoded).
 */
export function attachment(name: string) {
  const plain = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${plain}"; filename*=UTF-8''${encoded}`;
}
