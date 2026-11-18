/**
 * What the Settings page (/dashboard/settings) offers each role. On your own desk you're the owner; on a team's desk
 * you're an A&R / Admin or a Member. This only decides what is shown: every page and action behind a row keeps its own
 * server check (requireRole, requireOwnAccount, canMarkPlayedOut), so a hidden row can't be reached by its address.
 */
export type DeskRole = "owner" | "admin" | "member";

export type SettingsFacts = {
  role: DeskRole;
  /** Teams are switched on for this desk. */
  teams: boolean;
  /** How many desks the person can work on: their own plus each team's. */
  desks: number;
  /** The referrals switch is on for this desk. */
  referrals: boolean;
  /** The desk has the Played out tool and this role may mark tracks (canMarkPlayedOut). */
  playedOut: boolean;
};

export function settingsRows(f: SettingsFacts) {
  const owner = f.role === "owner";
  const manages = f.role !== "member";
  return {
    // Your desk
    contacts: true,
    // Owner and A&R / Admin only (owner, 16 Nov), as the Analytics page itself requires.
    analytics: manages,
    playedOut: manages && f.playedOut,
    // Your link and look (Theme is everyone's: it's a cookie on this browser)
    pause: manages,
    // Settings
    receiving: manages,
    team: manages && f.teams,
    // Your own login: only on your own desk, as the pages themselves require.
    notifications: owner,
    security: owner,
    switchDesk: f.desks > 1,
    // Plan and Help
    plan: owner,
    inviteDj: owner && f.referrals,
    // You row and the ••• menu
    editProfile: manages,
    signOutAllMyDevices: owner,
    deleteAccount: owner,
  };
}

export type SettingsRows = ReturnType<typeof settingsRows>;
