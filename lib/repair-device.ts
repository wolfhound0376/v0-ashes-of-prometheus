// REPAIR THIS DEVICE — the button in Settings (components/settings-sheet.tsx).
//
// Sam, 2026-11-23, on "cache memory": when one browser at the table is acting strangely, the cure has been "clear
// your cache", which also throws away who you are. Repair does the useful half: it forgets everything this browser
// has remembered about the game EXCEPT the things that are yours — your hero and its key, the DM key, your settings
// and any hero you are building in the Forge — then reloads clean. Nothing in the world is lost: the world lives on
// the server, and the player pass (lib/player-pass.ts) holds your hero there too.
// Research of record: project doc claude/Tables_Invites_Saves_Research_2026-11-23.md, section E.3.

/** Kept by Repair. Everything else in this site's storage is forgotten. */
export const REPAIR_KEEPS: readonly string[] = [
  // who you are (lib/player-pass.ts) — and the mirror, so the pass does not read the clear as "forget my hero"
  "aop_character_id", "aop_claim_token", "aop_access_role", "aop_pass_mirror",
  // the DM key (lib/dm-key.ts)
  "aop_forge_key",
  // your choices (lib/settings.ts, lib/audio-prefs.ts)
  "aop_settings_v1", "aop_music_off",
  // heroes being built in the Forge — your work, never ours to throw away
  "aop_forge2014_v1", "aop_forge_draft_v1",
  // films already seen on this device (lib/cinematic-replay.ts), so nothing replays
  "aop-cinematics-played",
]

/** The localStorage keys Repair forgets, given every key there now. */
export function keysToForget(all: readonly string[]): string[] {
  const keep = new Set(REPAIR_KEEPS)
  return all.filter((k) => !keep.has(k))
}

/** Where to go after a repair: the same page, with a stamp so nothing on the way can answer from an old copy. */
export function repairedUrl(href: string, now: number): string {
  try {
    const u = new URL(href)
    u.searchParams.set("repaired", String(now))
    return u.toString()
  } catch {
    return href
  }
}

/**
 * Do it, in the browser. Forgets the storage, empties any offline caches and service workers this site ever left
 * behind (it has none today — belt and braces for an old one), then reloads clean. Returns how many keys went.
 */
export async function repairThisDevice(w: Window = window): Promise<number> {
  let gone = 0
  try {
    const all: string[] = []
    for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); if (k) all.push(k) }
    for (const k of keysToForget(all)) { w.localStorage.removeItem(k); gone++ }
  } catch { /* storage blocked: nothing to forget */ }
  try { w.sessionStorage.clear() } catch { /* same */ }
  try {
    if ("caches" in w) for (const name of await w.caches.keys()) await w.caches.delete(name)
  } catch { /* no Cache Storage */ }
  try {
    const regs = await w.navigator.serviceWorker?.getRegistrations?.()
    for (const r of regs ?? []) await r.unregister()
  } catch { /* no service workers */ }
  w.location.replace(repairedUrl(w.location.href, Date.now()))
  return gone
}
