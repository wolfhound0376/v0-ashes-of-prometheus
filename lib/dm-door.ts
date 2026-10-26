// THE DM DOOR — the one way a table opens.
//
// Sam, 2026-10-25: "The DM entrance for the intro screen is the ONLY way to open up a table that
// permits players joining the staging area."
//
// So, on the client, Behind the Screen (/dm) only lets you in when you arrived by the small
// "Dungeon Master" link on the title screen (/intro). That link stamps this tab; /dm checks the
// stamp and sends anyone who typed the URL, followed an old bookmark or came from Play Saved Game
// back to the title screen. The stamp lives in sessionStorage, so it belongs to this one tab and
// is gone when the tab closes.
//
// The SERVER half is in app/api/table/route.ts: `open` accepts only the httpOnly DM session
// cookie, which only /dm's own code field mints (POST /api/dm/login). The older x-dm-key header
// the dashboard tools still send can start, end and seat — it cannot open.

export const DM_DOOR_KEY = "aop_dm_door"

/** The title screen's Dungeon Master link calls this just before it navigates to /dm. */
export function markDmDoor(): void {
  try { window.sessionStorage.setItem(DM_DOOR_KEY, "1") } catch { /* storage blocked */ }
}

/** True when this tab came to /dm through the title screen's Dungeon Master link. */
export function cameThroughDmDoor(): boolean {
  try { return window.sessionStorage.getItem(DM_DOOR_KEY) === "1" } catch { return false }
}

/** Locking the screen behind you: the next visit has to come through the door again. */
export function leaveDmDoor(): void {
  try { window.sessionStorage.removeItem(DM_DOOR_KEY) } catch { /* storage blocked */ }
}
