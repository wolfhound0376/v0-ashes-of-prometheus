// THE HOST — the player who started the campaign runs its table, and plays.
//
// Sam, 2026-11-10: "Maybe the 'DM' can be changed to host the game. Same function more or less but the
// host can play. The host (for the time being) can use DM credentials (IN the game) to address issues."
// "Whomever started the campaign is the host. Only people with keys can start a campaign." ("Key means
// the DM code.")
//
// So:
//   * Starting a campaign (New Game) still needs the DM code. Whoever does it names the hero they will
//     play; that hero is the HOST for the life of the campaign (world flag `host`, wiped with every other
//     flag by a reset and written again by the New Game that caused it).
//   * The host's browser is an ordinary player's browser — it holds that hero's claim, nothing else. With
//     that claim alone the host may open the table, open and shut seats, start, step players out, and end
//     the session. No code on game night.
//   * The reset itself (`new`), naming a host (`host`) and the sandbox stay behind the DM code.
//   * DM tools on the map are NOT part of this: until the in-game lock ships, the map's DM tools still
//     need a browser signed in as the DM (the old DM-only way of running the table still works).
//
// Design of record: project doc claude/One_Door_Entry_Flow_2026-11-10.md. Pure: no Supabase, no window.

export const HOST_KEY = "host"

export type Host = { id: string; name: string; at: string }

/** Read the `host` world flag's value; anything malformed is "no host". */
export function readHostValue(value: unknown): Host | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (typeof v.id !== "string" || !v.id) return null
  return { id: v.id, name: typeof v.name === "string" ? v.name : "", at: typeof v.at === "string" ? v.at : "" }
}

/** What the host may do with their hero's claim alone. Everything the DM can do at the table except the reset. */
export const HOST_ACTIONS: ReadonlySet<string> = new Set(["open", "start", "unstart", "remove", "companion", "end", "invite", "uninvite", "excuse", "readmit"])
/** Only the DM code's own door cookie: the reset, and naming who hosts. */
export const KEY_ONLY_ACTIONS: ReadonlySet<string> = new Set(["new", "host"])
/** DM actions that, for the DM, need the door cookie rather than the older header (lib/dm-door.ts). */
export const DOOR_ACTIONS: ReadonlySet<string> = new Set(["open", "new", "host"])

export type Actor = "dm" | "host"

/**
 * Who, if anyone, may run this table action. `dm` = signed in as DM by cookie or header; `dmCookie` = by the
 * door's own cookie; `host` = presented the host hero's valid claim. Returns the actor, or the reason refused.
 */
export function actorFor(action: string, who: { dm: boolean; dmCookie: boolean; host: boolean }): { actor: Actor } | { refused: string } {
  if (KEY_ONLY_ACTIONS.has(action)) {
    if (who.dmCookie) return { actor: "dm" }
    return { refused: "Starting a campaign needs the Dungeon Master's code. Come in through Host a Game on the title screen." }
  }
  if (who.dm) {
    if (DOOR_ACTIONS.has(action) && !who.dmCookie) {
      // The header alone cannot open a table — but a DM who is also the host still can, as the host.
      if (who.host && HOST_ACTIONS.has(action)) return { actor: "host" }
      return { refused: "The table opens only from Host a Game on the title screen." }
    }
    return { actor: "dm" }
  }
  if (who.host && HOST_ACTIONS.has(action)) return { actor: "host" }
  return { refused: "Only the host can do that." }
}
