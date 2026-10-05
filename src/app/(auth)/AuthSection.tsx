"use client";

import { usePathname } from "next/navigation";

const LABELS: [string, string][] = [
  ["/signup", "Sign up"],
  ["/signed-out", "Signed out"],
  ["/forgot", "Reset password"],
  ["/reset", "Reset password"],
  ["/login", "Sign in"],
];

/** The small label top-right of the desktop sign-in screens. */
export function AuthSection() {
  const path = usePathname();
  const label = LABELS.find(([p]) => path.startsWith(p))?.[1] ?? "";
  return <p className="text-[10px] font-medium uppercase leading-[14px] tracking-[0.8px] text-dim">{label}</p>;
}
