"use client";

import { usePathname } from "next/navigation";
import { ErrorScreen, type ErrorProps } from "./_ui/ErrorScreen";

/**
 * Last-resort error screen for every public page (the desk has its own, inside its menu). After an update it reloads
 * once by itself; otherwise retry and a way home. A plain message only: no error text, code or stack.
 */
export default function ErrorPage(props: ErrorProps) {
  // On ops (admin/error.tsx re-exports this page) the admin menu already shows the silver crest and sets its own theme.
  const onOps = !!usePathname()?.startsWith("/admin");
  return <ErrorScreen {...props} ops={onOps} home={onOps ? { href: "/admin", label: "Back to ops" } : undefined} />;
}
