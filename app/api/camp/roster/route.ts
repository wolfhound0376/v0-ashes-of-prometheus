import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { COMPANION_ROWS, campName, campRoster, mouthsAtCamp, type WorldLike } from "@/lib/camp-roster"
import { hitDieFor } from "@/lib/camp"
import { abilityMod, passivePerception, skillBonus, type SheetSlice } from "@/lib/game-context"
import { dressRows } from "@/lib/worn-gear-rows"

// /api/camp/roster — who sits at the fire tonight (Sam, 2026-11-15: "At camp the pixel characters of the available
// NPCs still alive or with you should be there").
//
//   GET → { members: [{slug, name, cls, level, hp, hpMax, con, wis, hd, conditions, pc}], mouths }
//         or { members: null } when there is no walk to read (Camp at the Fire then keeps its built-in company).
//
// The heroes are the walk's living heroes (walk_world.heroes less state.fallen); the companions are the prisoners
// walking with the party (state.company). Their numbers come from their `characters` rows; Stool, who has none, from
// the bestiary's Myconid Sprout. lib/camp-roster.ts holds the rule.

export const dynamic = "force-dynamic"

const CAMPAIGN_ID = "abyss"

type Row = {
  id: string; name: string; class: string | null; level: number | null; hp_current: number | null; hp_max: number | null
  con_score: number | null; wis_score: number | null; conditions: unknown; sheet_hit_dice: string | null; hit_dice_remaining: number | null
  str_score: number | null; dex_score: number | null; int_score: number | null; cha_score: number | null
  proficiency_bonus: number | null; passive_perception: number | null; sheet_skill_proficiencies: Record<string, string> | null; sheet_save_proficiencies: unknown
}

export async function GET() {
  try {
    const db = createAdminClient()
    const { data: run } = await db.from("campaign_runs").select("id").eq("campaign_id", CAMPAIGN_ID).neq("status", "ended")
      .order("run_number", { ascending: false }).limit(1).maybeSingle()
    if (!run?.id) return NextResponse.json({ members: null, why: "no active run" })
    const { data: world } = await db.from("walk_world").select("heroes,state").eq("campaign_run_id", run.id).maybeSingle()
    const roster = campRoster(world as WorldLike | null)
    if (!roster) return NextResponse.json({ members: null, why: "no heroes on the walk" })

    const ids = [
      ...roster.heroes.map((h) => h.cid).filter((x): x is string => !!x),
      ...roster.companions.map((c) => COMPANION_ROWS[c]).filter((x): x is string => !!x),
    ]
    const { data: rows } = ids.length
      ? await db.from("characters").select("id,name,class,level,hp_current,hp_max,con_score,wis_score,conditions,sheet_hit_dice,hit_dice_remaining,str_score,dex_score,int_score,cha_score,proficiency_bonus,passive_perception,sheet_skill_proficiencies,sheet_save_proficiencies").in("id", ids)
      : { data: [] as Row[] }
    // with their gear on (lib/worn-bonus.ts): the camp card's senses and checks read worn bonuses
    const byId = new Map((await dressRows(db, (rows ?? []) as Row[])).map((r) => [r.id, r]))

    const senses = (r: Row) => {
      const sheet = { ...r, level: Math.max(1, Number(r.level) || 1), str_score: Number(r.str_score) || 10, dex_score: Number(r.dex_score) || 10, con_score: Number(r.con_score) || 10, int_score: Number(r.int_score) || 10, wis_score: Number(r.wis_score) || 10, cha_score: Number(r.cha_score) || 10 } as SheetSlice
      const strMod = abilityMod(sheet.str_score), pb = Number(r.proficiency_bonus) || (2 + Math.floor((sheet.level - 1) / 4))
      const saves = Array.isArray(r.sheet_save_proficiencies) ? (r.sheet_save_proficiencies as unknown[]).map((x) => String(x).toLowerCase().slice(0, 3)) : []
      const ath = skillBonus(sheet, "athletics")
      return { pp: passivePerception(sheet), strMod, strSave: strMod + (saves.includes("str") ? pb : 0), ath: ath.mod + ath.prof }
    }
    const member = (slug: string, r: Row | undefined, pc: boolean) => {
      const level = Math.max(1, Number(r?.level) || 1)
      const die = r ? hitDieFor({ class: r.class, sheet_hit_dice: r.sheet_hit_dice }) : null
      return {
        slug, pc, name: campName(slug, r?.name), cls: r?.class ?? null, level,
        hp: Math.max(0, Number(r?.hp_current ?? r?.hp_max) || 0), hpMax: Math.max(1, Number(r?.hp_max) || 1),
        con: Number(r?.con_score) || 10, wis: Number(r?.wis_score) || 10,
        hd: die ? `${level}d${die}` : null, hdLeft: r?.hit_dice_remaining ?? level,
        conditions: Array.isArray(r?.conditions) ? (r!.conditions as unknown[]).filter((c) => typeof c === "string") : [],
        // What the pixel road's traps read (SRD 5.1 Traps: passive Wisdom (Perception) against the trap's DC; the falling
        // net's Strength save and Strength check). The road adds the march pace's penalty itself.
        id: r?.id ?? null, ...(r ? senses(r) : { pp: null, strMod: 0, strSave: 0, ath: 0 }),
      }
    }
    const members = roster.heroes.map((h) => member(h.slug, h.cid ? byId.get(h.cid) : undefined, true))
    for (const c of roster.companions) {
      const id = COMPANION_ROWS[c]
      if (id) { members.push(member(c, byId.get(id), false)); continue }
      // Stool: no characters row. The bestiary's Myconid Sprout (Out of the Abyss) is his block.
      const { data: b } = await db.from("bestiary").select("hp,hp_formula,con,wis").eq("slug", "myconid-sprout").maybeSingle()
      members.push({ slug: c, pc: false, name: campName(c, null), cls: "Myconid sprout", level: 1,
        hp: Number(b?.hp) || 7, hpMax: Number(b?.hp) || 7, con: Number(b?.con) || 10, wis: Number(b?.wis) || 11,
        hd: (b?.hp_formula as string | null)?.match(/^\d+d\d+/)?.[0] ?? null, hdLeft: 2, conditions: [], id: null, pp: null, strMod: 0, strSave: 0, ath: 0 })
    }
    return NextResponse.json({ members, mouths: mouthsAtCamp(roster) }, { headers: { "cache-control": "no-store" } })
  } catch (e) {
    return NextResponse.json({ members: null, why: String(e instanceof Error ? e.message : e) })
  }
}
