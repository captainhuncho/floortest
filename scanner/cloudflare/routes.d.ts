/** The answer to refuse this request with, or null to let it through (routes.js). */
export function refusal(route: string, request: Request, env: { SCAN_SECRET?: string }): Response | null;
