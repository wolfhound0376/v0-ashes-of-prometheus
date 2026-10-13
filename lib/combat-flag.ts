// The combat flag: Malachar's call that initiative is rolled, for every screen at the table.
//
// Sam, 2026-10-12: "Malachar as the DM narrator needs to know when combat has initiated based on
// DND rules and that should start the combat screen if appropriate." The rule is the SRD's (Combat
// Step by Step): the moment a creature attacks, or a hostile act is declared, combat begins. Malachar
// emits [COMBAT_START: Name, Name] naming the hostile creatures; the chat route writes this flag with
// the roster; the painted map sees it on its next poll and opens the fight with exactly those
// creatures. [COMBAT_END] clears it. Rides world_flags (key "combat") — no migration.

import type { SupabaseClient } from "@supabase/supabase-js"
import { slugOf } from "@/lib/stage-roster"

export const COMBAT_FLAG = "combat"
const CAMPAIGN = "ashes-of-prometheus"

export type CombatFoe = { name: string; slug: string; aliases: string[]; hp: number | null; hpMax: number | null }
export type CombatFlag = { status: "active"; foes: CombatFoe[]; area: string | null; startedAt: string; startedBy: string | null; label: string }

export async function startCombatFlag(db: SupabaseClient | null, args: { foes: Omit<CombatFoe, "slug">[]; area: string | null; startedBy: string | null; label?: string }) {
  if (!db || !args.foes.length) return
  try {
    const value: CombatFlag = {
      status: "active",
      foes: args.foes.map((f) => ({ ...f, slug: slugOf(f.name), aliases: (f.aliases ?? []).map(slugOf) })),
      area: args.area,
      startedAt: new Date().toISOString(),
      startedBy: args.startedBy,
      label: args.label ?? "Malachar calls for initiative.",
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
