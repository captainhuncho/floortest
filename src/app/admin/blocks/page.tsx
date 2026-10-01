import { ConfirmButton } from "../AdminUi";
import { q } from "@/lib/db";
import { addPlatformBlock, removePlatformBlock } from "../actions";

/** Senders blocked across every link, by address or whole domain. Each receiver's own blocks are separate. */
export default async function Blocks() {
  const rows = await q.all<{ id: number; kind: string; value: string; reason: string; created_at: number; admin: string | null }>(
    "SELECT b.*, u.handle AS admin FROM platform_blocks b LEFT JOIN users u ON u.id = b.admin_id ORDER BY b.created_at DESC",
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sender blocks</h1>
        <p className="mt-2 text-mute">Blocked here, an address (or every address at a domain) can&apos;t send to anyone on FloorTest. Tracks already received stay put.</p>
      </div>
      <form action={addPlatformBlock} className="grid gap-3 rounded-md border border-line p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block space-y-1.5">
          <span className="label">Email or domain</span>
          <input name="value" required className="input" placeholder="spam@example.com or example.com" />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Reason</span>
          <input name="reason" className="input" placeholder="Spam to many receivers" maxLength={200} />
        </label>
        <button className="btn-lime btn-sm w-fit">Block everywhere</button>
      </form>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-mute">
            <tr>{["Blocked", "Type", "Reason", "By", "Since", ""].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{r.value}</td>
                <td className="px-4 py-3 text-mute">{r.kind === "domain" ? "Whole domain" : "Address"}</td>
                <td className="px-4 py-3 text-mute">{r.reason || "—"}</td>
                <td className="px-4 py-3 text-mute">{r.admin ? `@${r.admin}` : "—"}</td>
                <td className="px-4 py-3 text-mute">{new Date(r.created_at).toLocaleDateString("en-GB")}</td>
                <td className="px-4 py-3 text-right">
                  <ConfirmButton action={removePlatformBlock.bind(null, r.id)} message={`Let ${r.value} send tracks again?`} className="text-sm text-mute hover:text-bone">
                    Lift
                  </ConfirmButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-mute">No platform-wide blocks.</p>}
      </div>
    </div>
  );
}
