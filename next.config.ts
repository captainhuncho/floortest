import type { NextConfig } from "next";
import { contentSecurityPolicy, PROXY_SKIPS } from "./src/lib/csp";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

// The Content-Security-Policy (src/lib/csp.ts). Pages get it from src/proxy.ts with a fresh nonce per request, so no
// script runs inline without it (audit 27 Oct; before, script-src had 'unsafe-inline'). The paths the proxy skips (static
// files) get the same policy without a nonce here, so every response still refuses framing (owner's "No clickjacking"
// rule, 23 Oct; tests/framing-headers.test.ts, e2e/framing.spec.ts). Development adds 'unsafe-eval' for React's overlays.
const staticCsp = { key: "Content-Security-Policy", value: contentSecurityPolicy({ dev: process.env.NODE_ENV !== "production" }) };

const nextConfig: NextConfig = {
  // Native/WASM database drivers load at runtime rather than being bundled.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // PGlite (the in-process database) is only for local development; on Vercel DATABASE_URL is always set,
  // so it's left out of the deployed functions. Each deployment stores a copy of them, so this saves ~25 MB apiece.
  outputFileTracingExcludes: process.env.VERCEL ? { "*": ["node_modules/@electric-sql/pglite/**"] } : {},
  poweredByHeader: false,
  // The Turnstile site key is public by design; this lets it be stored as TURNSTILE_SITE_KEY in Vercel.
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: `/:path(${PROXY_SKIPS}.*)`, headers: [staticCsp] },
    ];
  },
  async redirects() {
    return [
      // The old Vercel address sends people to the real domain (API routes stay put for cron jobs).
      ...(process.env.APP_URL && !process.env.APP_URL.includes("vercel.app")
        ? [
            {
              source: "/:path((?!api/).*)",
              has: [{ type: "host" as const, value: "floortest.vercel.app" }],
              destination: `${process.env.APP_URL}/:path`,
              permanent: true,
            },
          ]
        : []),
      // Renamed pages. Old addresses keep working (they're in emails already sent).
      { source: "/dashboard", destination: "/dashboard/review", permanent: true },
      { source: "/dashboard/set", destination: "/dashboard/prepare", permanent: true },
      { source: "/t/:token", destination: "/receipt/:token", permanent: true },
      { source: "/s/:token", destination: "/share/:token", permanent: true },
      { source: "/v/:token", destination: "/confirm-sender/:token", permanent: true },
      { source: "/dashboard/conversations", destination: "/dashboard/contacts", permanent: true },
      { source: "/dashboard/conversations/:id", destination: "/dashboard/contacts/:id", permanent: true },
      { source: "/dashboard/home", destination: "/dashboard/floor", permanent: true },
      // Preserve links shared from the pre-beta prototype. Authenticated destinations
      // still pass through the normal session checks, so these aliases do not bypass access control.
      { source: "/dj", destination: "/dashboard/floor", permanent: true },
      { source: "/sender", destination: "/sent", permanent: true },
      { source: "/mobile", destination: "/dashboard/floor", permanent: true },
      { source: "/activity", destination: "/dashboard/activity", permanent: true },
      { source: "/collections", destination: "/dashboard/collections", permanent: true },
      { source: "/operations", destination: "/admin", permanent: true },
    ];
  },
};

export default nextConfig;
