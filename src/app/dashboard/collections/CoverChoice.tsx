"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

/**
 * "Change cover" and "Remove cover" for a project or a folder (owner, 19 Nov). The file input stays on the page outside
 * the ··· menu, so choosing it from the menu opens the picker inside the same tap (iOS Safari opens one only from a tap).
 * The image is checked and resized on the server (src/app/api/folder-art).
 */
export function useCoverChoice(kind: "project" | "folder", id: number, name: string) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function send(file: File | null) {
    setBusy(true);
    try {
      const body = file ? new FormData() : undefined;
      if (file) body!.append("file", file);
      const r = await fetch(`/api/folder-art/${kind}/${id}`, { method: file ? "POST" : "DELETE", body });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) return toast.show({ message: d.error || "The cover didn't change. Try again.", tone: "error" });
      toast.show({ message: file ? `New cover for ${name}` : `Cover removed from ${name}` });
      router.refresh();
    } catch {
      toast.show({ message: "The cover didn't change. Check your connection and try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const picker = (
    <input
      ref={input}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      hidden
      aria-label={`Choose a cover for ${name}`}
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) send(f);
      }}
    />
  );
  return { picker, busy, choose: () => input.current?.click(), remove: () => send(null) };
}
