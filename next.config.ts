import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

// Audio, covers and uploads go straight to the storage bucket via signed URLs.
const storage = process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).host : "";
const store = storage ? `https://*.${storage} https://${storage}` : "";
// Production only: dev needs eval for fast refresh. Next's inline bootstrap scripts need 'unsafe-inline'.
if (process.env.NODE_ENV === "production")
  securityHeaders.push({
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${store}`,
      `media-src 'self' blob: ${store}`,
      `connect-src 'self' ${store}`,
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  });

const nextConfig: NextConfig = {
  // Native/WASM database drivers load at runtime rather than being bundled.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      // Renamed pages.
      { source: "/dashboard/conversations", destination: "/dashboard/contacts", permanent: true },
      { source: "/dashboard/conversations/:id", destination: "/dashboard/contacts/:id", permanent: true },
      { source: "/dashboard/home", destination: "/dashboard/floor", permanent: true },
    ];
  },
};

export default nextConfig;
