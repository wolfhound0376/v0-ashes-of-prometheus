import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { castList, healAmount, planCast, spendSlot } from "@/lib/walk-cast"
import type { Spellcasting } from "@/lib/spellbook"

// /api/walk-cast — a caster on the painted map casts a memorized spell outside a fight (lib/walk-cast.ts).
//
//   GET  ?characterId=…   the caster's spells as the map offers them: name, level, kind, slots left.
//                         Anyone may read it — it is what is printed on the character sheet.
//   POST {characterId, claimToken?, spell, targetId?}
//                         casts it: spends the slot, heals the target for a healing spell, and tells Malachar.
//                         The caster's own claim (the browser that sat down as them) or the DM key may cast.
//
// The map draws the cast; this is the record. Nothing about the spell is taken from the browser but its name and
// target: the slot, the dice and the caster's modifier are read and rolled here.

export const dynamic = "force-dynamic"

const MOD_OF: Record<string, string> = { str: "str_modifier", dex: "dex_modifier", con: "con_modifier", int: "int_modifier", wis: "wis_modifier", cha: "cha_modifier" }

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("characterId")?.trim()
  if (!id) return NextResponse.json({ error: "characterId required" }, { status: 400 })
  try {
    const { data } = await createAdminClient().from("characters").select("id, name, sheet_spellcasting").eq("id", id).maybeSingle()
    if (!data) return NextResponse.json({ error: "no such character" }, { status: 404 })
    return NextResponse.json({ id: data.id, name: data.name, spells: castList(data.sheet_spellcasting as Spellcasting | null) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const characterId = typeof body.characterId === "string" ? body.characterId : ""
  const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
  const spell = typeof body.spell === "string" ? body.spell.trim().slice(0, 80) : ""
  const targetId = typeof body.targetId === "string" ? body.targetId : ""
  if (!characterId || !spell) return NextResponse.json({ error: "characterId and spell required" }, { status: 400 })

  const db = createAdminClient()
  // who may cast for this character: the browser holding its claim, or the DM
  if (!isDm(req)) {
    const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", characterId).maybeSingle()
    if (!secret || !claimToken || secret.claim_token !== claimToken) return NextResponse.json({ error: "not your character" }, { status: 403 })
  }

  const { data: caster } = await db.from("characters")
    .select("id, name, sheet_spellcasting, str_modifier, dex_modifier, con_modifier, int_modifier, wis_modifier, cha_modifier")
    .eq("id", characterId).maybeSingle()
  if (!caster) return NextResponse.json({ error: "no such character" }, { status: 404 })
  const sc = caster.sheet_spellcasting as (Spellcasting & { ability?: string }) | null

  const plan = planCast(sc, spell)
  if (!plan.ok) return NextResponse.json({ ok: false, why: plan.why }, { status: 200 })

  // spend the slot first: a spell that is cast has been paid for, whatever it then does
  if (plan.level > 0 && sc) {
    const { error } = await db.from("characters").update({ sheet_spellcasting: spendSlot(sc, plan.level) }).eq("id", caster.id)
    if (error) return NextResponse.json({ error: "could not spend the slot" }, { status: 500 })
  }

  let healed: { id: string; name: string; amount: number; hp: number; hpMax: number } | null = null
  if (plan.kind === "heal") {
    const tid = targetId || caster.id
    const { data: t } = await db.from("characters").select("id, name, hp_current, hp_max").eq("id", tid).maybeSingle()
    if (t) {
      const mod = Number((caster as Record<string, unknown>)[MOD_OF[String(sc?.ability ?? "").toLowerCase().slice(0, 3)] ?? ""] ?? 0) || 0
      const amount = healAmount(plan.name, plan.entry, mod)
      const hpMax = Number(t.hp_max) || 1, before = Number(t.hp_current ?? hpMax)
      const hp = Math.min(hpMax, before + amount)
      await db.from("characters").update({ hp_current: hp }).eq("id", t.id)
      healed = { id: t.id, name: t.name, amount: hp - before, hp, hpMax }
    }
  }

  // Malachar hears of it: the next thing he says knows the spell was cast (and on whom)
  const on = healed ? ` on ${healed.id === caster.id ? "themself" : healed.name}` : body.targetName ? ` on ${String(body.targetName).slice(0, 60)}` : ""
  const tail = healed ? ` (${healed.name} regains ${healed.amount} HP, ${healed.hp}/${healed.hpMax})` : ""
  await db.from("dialogue").insert({ speaker: caster.name, speaker_type: "player", channel: "dm", text: `*casts ${plan.name}${on}*${tail}` })

  const left = plan.level > 0 && sc ? Math.max(0, (sc.slots?.[String(plan.level)]?.max ?? 0) - (sc.slots?.[String(plan.level)]?.used ?? 0) - 1) : null
  return NextResponse.json({ ok: true, spell: plan.name, level: plan.level, kind: plan.kind, slotsLeft: left, healed })
}
