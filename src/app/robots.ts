import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Receiver links and the landing page are public; everything personal stays out of search. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/api/", "/t/", "/v/", "/reset/", "/login", "/signup", "/forgot"] },
    host: env.appUrl,
  };
}
