// The combat flag: Malachar's call that initiative is rolled, for every screen at the table.
//
// Sam, 2026-10-12: "Malachar as the DM narrator needs to know when combat has initiated based on
// DND rules and that should start the combat screen if appropriate." The rule is the SRD's (Combat
// Step by Step): the moment a creature attacks, or a hostile act is declared, combat begins. Malachar
// emits [COMBAT_START: Name, Name] naming the hostile creatures; the chat route writes this flag with
// the roster; the painted map sees it on its next poll and opens the fight with exactly those
// creatures. [COMBAT_END] clears it. Rides world_flags (key "combat") — no migration.

import type { SupabaseClient } from "@supabase/supabase-js"
import { slugOf, type StageEvent } from "@/lib/stage-roster"

export const COMBAT_FLAG = "combat"
const CAMPAIGN = "ashes-of-prometheus"

export type CombatFoe = { name: string; slug: string; aliases: string[]; hp: number | null; hpMax: number | null }
export type CombatFlag = { status: "active"; foes: CombatFoe[]; area: string | null; startedAt: string; startedBy: string | null; label: string; opener?: string | null }

export async function startCombatFlag(db: SupabaseClient | null, args: { foes: Omit<CombatFoe, "slug">[]; area: string | null; startedBy: string | null; label?: string; opener?: string | null }) {
  if (!db || !args.foes.length) return
  try {
    const value: CombatFlag = {
      status: "active",
      foes: args.foes.map((f) => ({ ...f, slug: slugOf(f.name), aliases: (f.aliases ?? []).map(slugOf) })),
      area: args.area,
      startedAt: new Date().toISOString(),
      startedBy: args.startedBy,
      label: args.label ?? "Malachar calls for initiative.",
      // the screen that asked for the fight (a guard spotting its hero): it opens the fight with no wait; the rest show it
      ...(args.opener ? { opener: args.opener } : {}),
    }
    const { error } = await db.from("world_flags").upsert(
      { campaign_id: CAMPAIGN, key: COMBAT_FLAG, value, set_by: "malachar", note: `fight: ${value.foes.map((f) => f.name).join(", ")}` },
      { onConflict: "campaign_id,key" },
    )
    if (error) console.error("[combat-flag] write failed:", error.message)
    else console.log("[combat-flag] combat begins:", value.foes.map((f) => f.name).join(", "))
  } catch (err) {
    console.error("[combat-flag] start failed:", err)
  }
}

export async function endCombatFlag(db: SupabaseClient | null) {
  if (!db) return
  try {
    const { error } = await db.from("world_flags").delete().eq("campaign_id", CAMPAIGN).eq("key", COMBAT_FLAG)
    if (error) console.error("[combat-flag] clear failed:", error.message)
    else console.log("[combat-flag] combat ends")
  } catch (err) {
    console.error("[combat-flag] end failed:", err)
  }
}

/** The fight on the flag now, or null. Best-effort: a failed read is "no fight", the turn goes on. */
export async function readCombatFlag(db: SupabaseClient | null): Promise<CombatFlag | null> {
  if (!db) return null
  try {
    const { data } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", COMBAT_FLAG).maybeSingle()
    const v = (data?.value ?? null) as CombatFlag | null
    return v && v.status === "active" ? v : null
  } catch {
    return null
  }
}

// THE MAP'S FIGHT IS THE MAP'S (found live 2026-11-23, run 95b1aa1b, Sam: "During our first fight at the watch/guard
// tower we started combat and then the drow disappeared"). A guard on the Guard Tower spotted Fifi; the map raised the
// flag through /api/walk-spotted (flag.opener = the screen that saw it) and opened the fight; the beat went to Malachar
// as a direction. His reply narrated "The body is already cooling." and carried [NPC_LEAVE: Drow Guard] (hp 22, not
// dead) and [COMBAT_END]. The leave wrote the roster's `gone` for drow-guard — every drow guard on the map matches it —
// and the COMBAT_END took the flag down, which ends a fight the map opened from the flag. Fourteen seconds in, one punch
// thrown, the three guards were gone and the fight was over with no victory.
// A fight the map opened is fought on the map: it ends there (a win, a flight, a fall, a surrender), and the narration of
// it cannot end it or walk its foes off. Malachar's own calls to initiative (no opener) are untouched.

/** True when the fight on the flag is one the map opened itself (a guard's spotting), not Malachar's [COMBAT_START:]. */
export function mapOwnsFight(flag: CombatFlag | null | undefined): boolean {
  return !!(flag && flag.status === "active" && flag.opener)
}

/** Does this name (any spelling of it) belong to one of the fight's foes? "Drow Guard" is the flag's "Drow guard". */
export function isFightFoe(flag: CombatFlag, name: string): boolean {
  const s = slugOf(name)
  if (!s) return false
  return (flag.foes ?? []).some((f) => {
    const names = [f.slug, ...(f.aliases ?? [])].filter(Boolean)
    return names.some((n) => n === s || n.startsWith(s + "-") || s.startsWith(n + "-"))
  })
}

/**
 * The stage events a turn may apply while a map-opened fight is on: a foe of that fight may die in the narration
 * (a leave with `dead`), but a living one is not taken off the stage — the map is fighting it. Everything else passes.
 * Returns the events kept and the names held back (for the log).
 */
export function holdFightFoes(flag: CombatFlag | null | undefined, events: StageEvent[]): { events: StageEvent[]; held: string[] } {
  if (!mapOwnsFight(flag)) return { events, held: [] }
  const held: string[] = []
  const kept = events.filter((e) => {
    if (e.kind !== "leave" || e.dead || !isFightFoe(flag!, e.name)) return true
    held.push(e.name)
    return false
  })
  return { events: kept, held }
}
