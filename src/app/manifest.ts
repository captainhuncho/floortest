import type { MetadataRoute } from "next";

/** "Add to Home Screen" on Android uses these: the same crest-on-ink icon as the iPhone and Android apps (owner, 29 Oct). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FloorTest",
    short_name: "FloorTest",
    description: "The receiving desk for new music.",
    start_url: "/dashboard/floor",
    display: "browser",
    background_color: "#10110f",
    theme_color: "#10110f",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
