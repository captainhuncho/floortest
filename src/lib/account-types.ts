/**
 * Account types: who a desk is for, asked at sign-up and changeable in Settings. On a team desk the type belongs to the
 * account, so every seat sees the same tools. Types never lock anything: each switches its own tools on by default, and
 * anyone can turn a tool on or off in Settings (stored as overrides in users.tools). Price and limits never depend on type.
 */
export const ACCOUNT_TYPES = {
  dj: "DJ",
  producer_dj: "Producer / DJ",
  ar: "A&R",
  label_radio: "Label / Radio",
  artist: "Artist",
  curator: "Curator",
  music_pro: "Music professional",
} as const;
export type AccountType = keyof typeof ACCOUNT_TYPES;

export const isAccountType = (v: unknown): v is AccountType => typeof v === "string" && Object.hasOwn(ACCOUNT_TYPES, v);

/** Tools only some desks need. `for` is the types that get it by default. */
export const TOOLS = {
  played_out: {
    label: "Played out",
    hint: "Tell senders when a track got played: the Monday question, the pick page and Played it out on Prepare.",
    for: ["dj", "producer_dj", "curator"] as readonly AccountType[],
  },
} as const;
export type Tool = keyof typeof TOOLS;
export const TOOL_IDS = Object.keys(TOOLS) as Tool[];

export const toolDefault = (kind: AccountType | null | undefined, tool: Tool) => !!kind && TOOLS[tool].for.includes(kind);

/** users.tools: JSON of overrides, e.g. {"played_out":false}. Anything unreadable counts as no overrides. */
export function readTools(raw: string | null | undefined): Partial<Record<Tool, boolean>> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(TOOL_IDS.filter((t) => typeof o[t] === "boolean").map((t) => [t, o[t] as boolean]));
  } catch {
    return {};
  }
}

/** Overrides to store: only the tools whose choice differs from the type's default; null when there are none. */
export function toolOverrides(kind: AccountType | null, chosen: Partial<Record<Tool, boolean>>): string | null {
  const o = Object.fromEntries(TOOL_IDS.filter((t) => t in chosen && chosen[t] !== toolDefault(kind, t)).map((t) => [t, chosen[t]]));
  return Object.keys(o).length ? JSON.stringify(o) : null;
}

export function hasTool(user: { kind: AccountType | null; tools?: string | null }, tool: Tool) {
  return readTools(user.tools)[tool] ?? toolDefault(user.kind, tool);
}
