import "server-only";
import { cookies } from "next/headers";

export const THEMES = ["night", "day", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "ft_theme";

/** The viewer's choice for the signed-in app. Night unless they pick otherwise. Stored in a cookie so pages render in it straight away. */
export async function currentTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return (THEMES as readonly string[]).includes(v ?? "") ? (v as Theme) : "night";
}

export const themeClass = (t: Theme) => `theme-root theme-${t}`;
