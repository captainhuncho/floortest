import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

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
