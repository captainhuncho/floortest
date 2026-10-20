"use client";

import { useSyncExternalStore } from "react";
import { type Consent, onConsentChange, readConsent } from "@/lib/consent";

const subscribe = (onChange: () => void) => onConsentChange(onChange);
const serverSnapshot = () => "pending" as const;

/** The banner choice; "pending" during server render, so nothing optional runs before the browser reads the cookie. */
export function useConsent(): Consent | "pending" {
  return useSyncExternalStore(subscribe, readConsent, serverSnapshot);
}
