"use client";

import { ErrorScreen, type ErrorProps } from "../_ui/ErrorScreen";

/** A desk page that fails keeps the menu, the player and the top bar: retry in place, or go back to the Floor. */
export default function DeskError(props: ErrorProps) {
  return <ErrorScreen {...props} page={false} home={{ href: "/dashboard/floor", label: "Back to the Floor" }} />;
}
