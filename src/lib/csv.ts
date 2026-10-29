/**
 * One quoted CSV cell. A cell a spreadsheet could run as a formula (starting with = + - @ |, a tab or line break, or
 * any of those after leading spaces) gets a leading apostrophe, so it opens as plain text.
 */
export const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return `"${(/^\s*[=+\-@|]/.test(s) || /^[\t\r\n]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};
