import { collectionsFor } from "@/lib/core";
import { q, likeContains, type Track, type User } from "@/lib/db";
import { MIX_STATUS, RELEASE_STATUS } from "@/lib/plans";
import { ViewToggle } from "../ViewToggle";
import { FilterMenu, type Option } from "./FilterMenu";
import { ListRows, type ListRow } from "./ListRows";

type Search = { c?: string; s?: string; q?: string; type?: string; sender?: string; genre?: string; bpm?: string; verified?: string };

// DJ-friendly tempo bands. Tracks without a detected BPM only show under "Any tempo".
const BPM = [
  ["lt110", "Under 110", 0, 110],
  ["110-120", "110–120", 110, 120],
  ["120-125", "120–125", 120, 125],
  ["125-130", "125–130", 125, 130],
  ["130-140", "130–140", 130, 140],
  ["140+", "140 and up", 140, 999],
] as const;

const STATUS = [
  ["all", "All", "1 = 1"],
  ["review", "Needs review", "t.decision IS NULL"],
  ["kept", "Kept", "t.decision = 'kept'"],
  ["passed", "Could be better", "t.decision = 'passed'"],
] as const;

const TYPE_SHORT: Record<string, string> = { unsigned: "Demo", signed: "Signed", released: "Released" };
const MIX_SHORT: Record<string, string> = { raw: "Work in progress", mixed: "Unmastered", mastered: "Mastered" };

/** Dense, scan-first Submissions: every track on one screen, decisions inline. */
export async function SubmissionsList({ user, sp }: { user: User; sp: Search }) {
  const status = STATUS.find(([k]) => k === sp.s) ?? STATUS[0];
  const collections = await collectionsFor(user.id);
  const collection = sp.c ? collections.find((c) => String(c.id) === sp.c) : undefined;
  const type = sp.type && sp.type in RELEASE_STATUS ? sp.type : undefined;
  const senderId = sp.sender ? Number(sp.sender) : undefined;
  const genre = sp.genre ? sp.genre.slice(0, 40) : undefined;
  const search = (sp.q || "").trim().slice(0, 100);
  const bpm = BPM.find(([k]) => k === sp.bpm);
  const verifiedOnly = sp.verified === "1";

  const where = ["t.user_id = ?", "t.deleted_at IS NULL", status[2]];
  const args: (string | number)[] = [user.id];
  if (collection) (where.push("t.collection_id = ?"), args.push(collection.id));
  if (type) (where.push("t.release_status = ?"), args.push(type));
  if (senderId) (where.push("t.sender_id = ?"), args.push(senderId));
  if (genre) (where.push("t.genre = ?"), args.push(genre));
  if (bpm) (where.push("t.bpm >= ? AND t.bpm < ?"), args.push(bpm[2], bpm[3]));
  if (verifiedOnly) where.push("s.verified_at IS NOT NULL");
  if (search) {
    where.push("(t.title ILIKE ? OR t.artist ILIKE ? OR s.name ILIKE ? OR t.genre ILIKE ?)");
    args.push(...Array(4).fill(likeContains(search)));
  }

  const tracks = (await q.all<Track & { sender_name: string; sender_email: string; sender_verified: number | null; collection_name: string | null }>(`SELECT t.*, s.name AS sender_name, s.email AS sender_email, s.verified_at AS sender_verified, c.name AS collection_name
       FROM tracks t JOIN senders s ON s.id = t.sender_id LEFT JOIN collections c ON c.id = t.collection_id
       WHERE ${where.join(" AND ")} ORDER BY t.created_at DESC LIMIT 500`, ...args));

  const senders = (await q.all<{ id: number; name: string; n: number }>(`SELECT s.id, s.name, COUNT(t.id) AS n FROM senders s JOIN tracks t ON t.sender_id = s.id AND t.deleted_at IS NULL
       WHERE s.user_id = ? GROUP BY s.id ORDER BY lower(s.name)`, user.id));
  const genres = (await q.all<{ genre: string; n: number }>(`SELECT genre, COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND genre != ''
       GROUP BY genre ORDER BY n DESC, lower(genre)`, user.id));

  const href = (patch: Partial<Search>) => {
    const p = new URLSearchParams({ view: "list" });
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v && k !== "view" && k !== "t" && k !== "welcome") p.set(k, v);
    return `/dashboard?${p}`;
  };

  const rows: ListRow[] = tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    sender: t.sender_name,
    senderId: t.sender_id,
    senderEmail: t.sender_email,
    senderVerified: !!t.sender_verified,
    meta: [
      t.sender_name !== t.artist ? `via ${t.sender_name}` : null,
      TYPE_SHORT[t.release_status] ?? "Demo",
      t.genre || null,
      MIX_SHORT[t.mix_status],
      t.bpm ? `${Math.round(t.bpm)} BPM` : null,
      !collection ? t.collection_name : null,
    ].filter(Boolean) as string[],
    mixLabel: MIX_STATUS[t.mix_status as keyof typeof MIX_STATUS] ?? null,
    duplicateOf: t.duplicate_of,
    message: t.message,
    duration: t.duration,
    peaks: t.peaks ? JSON.parse(t.peaks) : null,
    decision: t.decision,
    played: !!t.played_at,
    downloaded: !!t.downloaded_at,
    replied: !!t.replied_at,
    createdAt: t.created_at,
  }));


  const menus: { label: string; options: Option[] }[] = [
    { label: "Status", options: STATUS.map(([k, l]) => ({ label: l, href: href({ s: k === "all" ? undefined : k }), active: status[0] === k })) },
    {
      label: "Collection",
      options: [
        { label: "All collections", href: href({ c: undefined }), active: !collection },
        ...collections.map((c) => ({ label: c.name, href: href({ c: String(c.id) }), active: c.id === collection?.id, count: c.count })),
      ],
    },
    {
      label: "Type",
      options: [
        { label: "Any type", href: href({ type: undefined }), active: !type },
        ...Object.entries(RELEASE_STATUS).map(([k, l]) => ({ label: l, href: href({ type: k }), active: type === k })),
      ],
    },
    {
      label: "Genre",
      options: [
        { label: "Any genre", href: href({ genre: undefined }), active: !genre },
        ...genres.map((g) => ({ label: g.genre, href: href({ genre: g.genre }), active: g.genre === genre, count: g.n })),
      ],
    },
    {
      label: "BPM",
      options: [
        { label: "Any tempo", href: href({ bpm: undefined }), active: !bpm },
        ...BPM.map(([k, l]) => ({ label: l, href: href({ bpm: k }), active: bpm?.[0] === k })),
      ],
    },
    {
      label: "Sender",
      options: [
        { label: "Everyone", href: href({ sender: undefined, verified: undefined }), active: !senderId && !verifiedOnly },
        { label: "Verified senders only", href: href({ sender: undefined, verified: "1" }), active: verifiedOnly },
        ...senders.map((s) => ({ label: s.name, href: href({ sender: String(s.id) }), active: s.id === senderId, count: s.n })),
      ],
    },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
      </header>

      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-line bg-ink-2/60 px-2 py-1.5 sm:px-4">
        {menus.map((m) => (
          <FilterMenu key={m.label} label={m.label} options={m.options} />
        ))}
        <form action="/dashboard" role="search" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="view" value="list" />
          {Object.entries(sp).map(([k, v]) =>
            v && ["c", "s", "type", "sender", "genre"].includes(k) ? <input key={k} type="hidden" name={k} value={v} /> : null,
          )}
          <label htmlFor="list-q" className="sr-only">
            Search
          </label>
          <input id="list-q" name="q" defaultValue={search} placeholder="Search" className="input w-44 py-1.5" />
        </form>
        <ViewToggle view="list" />
      </div>

      {rows.length === 0 ? (
        <p className="px-6 py-20 text-center text-mute">{search || sp.s || sp.c || sp.type || sp.sender || sp.genre ? "Nothing matches these filters." : "No tracks yet. Share your link to start receiving."}</p>
      ) : (
        <ListRows rows={rows} />
      )}
    </div>
  );
}
