"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { LIME } from "../kitButtons";
import { linkShared } from "../link-shared";

/** Getting started's lime button on the "Share your link" step: copies the link and ticks the step off. */
export function StartCopy({ link }: { link: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      linkShared();
      setCopied(true);
      toast.show({ message: "Your link is copied. Paste it anywhere." });
    } catch {
      toast.show({ message: "Couldn't copy. Press and hold the link to copy it." });
    }
  }
  return (
    <button type="button" onClick={copy} className={LIME}>
      {copied ? "Copied" : "Copy your link"}
    </button>
  );
}
