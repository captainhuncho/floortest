# Retired

Features that were built, then replaced, and what was removed with them. Kept so nobody rebuilds them by accident and so old data questions have an answer. The data is gone: these tables were dropped by migration `0085_drop_retired` (shipped after 11 Oct 2026).

## 1 Oct colleague sharing (per-track share links)

**What it was:** a receiver shared one track with a colleague who had a FloorTest account, through a private `/share/<token>` link that lasted 7 days. Downloads were allowed only if the receiver was on a paid plan when the track was sent. A receiver could also ask the artist, per track, for permission ("Request to share"); the artist answered Allow or Decline on their receipt, with a 2-minute window to cancel. It sat behind the `sharing` switch and was never switched on for users.

**Replaced by:** collection share links (`docs/01-product.md`, Collection share links): named, email-verified listeners on a whole collection, with expiry, reset and revoke, and the artist's consent given by the send-form wording (`tracks.share_terms`). Retired 11 Oct 2026; tables dropped after.

**Removed:**

| Table / column | Held |
|---|---|
| `track_shares` | one row per share link: track, fingerprint of the link (`token_hash`), created, expires, revoked, play and download counts |
| `share_access` | each play or download through a share link: which link, which account, when |
| `share_requests` | each "Request to share": track, the receiver's note, whether downloads were included, pending / allowed / declined / cancelled, when |
| `tracks.share_download` | whether colleagues could download that track (fixed at send time by the receiver's plan) |
| `plans.share_downloads` | whether a plan let colleagues download shared tracks |

Pages and routes removed with it: `/share/[token]`, `/api/share/[token]/audio`, `/download`, `/join`; the review panel's share box; "Request to share" on contacts; the artist's Allow / Decline card on receipts; the jobs that finalised consents.

## Review Together guests (per-collection teammates)

**What it was:** on the Team plan, up to 10 FloorTest accounts per collection listened to tracks sent after they joined, voted keep or pass with a note, and (if the owner turned on "Teammates can Keep / Not for me") made the call. Live 11 Oct 2026 for a few hours.

**Replaced by:** account teams (`docs/01-product.md`, Account teams): people join the whole account with a role (Owner, A&R / Admin, Member), and Review Together's comments and shared shortlist work for everyone on the team. Retired 11 Oct 2026; tables dropped after.

**Removed:**

| Table / column | Held |
|---|---|
| `collection_members` | which accounts were guests on which collection, and since when |
| `track_votes` | each guest's keep / pass vote and note on a track |
| `collections.team_can_decide` | whether guests could make the Keep / Not for me call in that collection |
| `feature_switches` row `shared` | the plan switch for shared collections |

Kept and still in use: `track_comments` and `track_shortlist` (team comments and the shared shortlist).
