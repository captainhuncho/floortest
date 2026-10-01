"use client";

import { useEffect, useState } from "react";

const KEY = "floortest-source";

/** "utm_source / utm_medium / utm_campaign", or the referring site, from the first page of the visit. */
function firstTouch() {
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved !== null) return saved;
    const p = new URLSearchParams(location.search);
    const utm = ["utm_source", "utm_medium", "utm_campaign"].map((k) => (p.get(k) || "").trim().slice(0, 60)).filter(Boolean).join(" / ");
    let ref = "";
    try {
      const host = document.referrer ? new URL(document.referrer).hostname : "";
      if (host && host !== location.hostname) ref = `ref: ${host}`;
    } catch {}
    const v = (utm || ref).slice(0, 200);
    sessionStorage.setItem(KEY, v);
    return v;
  } catch {
    return "";
  }
}

/** A hidden "source" field. Call RememberSource on landing pages so the first touch survives navigation. */
export function SourceField() {
  const [v, setV] = useState("");
  useEffect(() => setV(firstTouch()), []);
  return <input type="hidden" name="source" value={v} />;
}

export function RememberSource() {
  useEffect(() => void firstTouch(), []);
  return null;
}
