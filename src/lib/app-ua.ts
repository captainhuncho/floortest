/** The marker the iPhone and Android apps add to their web view's user agent (mobile/capacitor.config.ts). No Next imports, so tests can use it. */
export const APP_UA_MARK = "FloorTestApp";

/** Whether a user agent is the FloorTest app's web view rather than a browser. */
export const isAppUserAgent = (ua: string) => new RegExp(`\\b${APP_UA_MARK}\\b`).test(ua);
