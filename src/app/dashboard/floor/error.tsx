"use client";

import { ErrorScreen, type ErrorProps } from "../../_ui/ErrorScreen";

/** The Floor failed to load: the menu, the player and the top bar stay, and Try again fetches it again in place. */
export default function FloorError(props: ErrorProps) {
  return (
    <ErrorScreen
      {...props}
      page={false}
      home={null}
      title="Your Floor didn't load"
      body={<p>Check your connection, then try again. Your tracks are safe.</p>}
    />
  );
}
