"use client";

import { useState } from "react";
import { DEFAULT_GENRES, MAX_GENRE_LENGTH } from "@/lib/plans";

/** Chips editor for a collection's genre list. Empty means senders see the standard list. */
export function GenresField({ initial }: { initial: string[] }) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState("");
  const add = (g: string) => {
    const clean = g.replace(/\s+/g, " ").trim().slice(0, MAX_GENRE_LENGTH);
    if (clean && !list.some((x) => x.toLowerCase() === clean.toLowerCase()) && list.length < 30) setList([...list, clean]);
  };
  const suggestions = DEFAULT_GENRES.filter((g) => !list.includes(g));

  return (
    <div className="space-y-3">
      <input type="hidden" name="genres" value={JSON.stringify(list)} />
      <div className="flex flex-wrap gap-2" aria-label="Genres senders can pick">
        {list.length === 0 && <span className="text-sm text-mute">None set: senders pick from the standard list.</span>}
        {list.map((g) => (
          <span key={g} className="inline-flex items-center gap-1.5 rounded-full border border-lime/50 bg-lime/10 py-1 pl-3 pr-1.5 text-sm text-lime">
            {g}
            <button type="button" onClick={() => setList(list.filter((x) => x !== g))} aria-label={`Remove ${g}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-lime/20">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="genre-draft">
          Add a genre
        </label>
        <input
          id="genre-draft"
          value={draft}
          maxLength={MAX_GENRE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
              setDraft("");
            }
          }}
          placeholder="Type a genre and press Enter"
          className="input"
        />
        <button type="button" className="btn-ghost btn-sm" onClick={() => (add(draft), setDraft(""))}>
          Add
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="py-1 text-sm text-mute">Quick add:</span>
          {suggestions.map((g) => (
            <button key={g} type="button" onClick={() => add(g)} className="rounded-full border border-line px-2.5 py-1 text-sm text-mute hover:border-mute hover:text-bone">
              + {g}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
