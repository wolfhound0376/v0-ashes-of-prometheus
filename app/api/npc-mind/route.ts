import { NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createAdminClient } from "@/lib/supabase/admin"
import { findNpcRow } from "@/lib/npc-acquaintance"
import { cleanOffer, parseMindReply } from "@/lib/npc-mind"

// Same direct-Anthropic provider as /api/npc-opener and /api/chat.
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * NPC MINDS: one turn of a named NPC's fight on the painted map (/velkynvelve).
 *
 * Sam, 2026-11-10: "Named characters should use AI to use AI bubbles, how they fight, cast spells, call for help,
 * retreat, negotiate, etc. Characters that have status should be able to control the other NPCs under them."
 * Before that (2026-08-28) the guards were ruled an algorithm; this is the tier above them that was never built.
 *
 * The map sends the NPC, the fight as it stands, and the OFFER: only what the page can do this turn (the attacks on
 * the NPC's own block, the heroes it can see, retreat if there is a way out, negotiate/surrender for the commander
 * of the fight only, orders for the commander only). The model picks inside the offer and says one short line.
 * lib/npc-mind.ts throws away anything outside it. Haiku, because the turn is waiting.
 *
 * Failure is always HTTP 200 with {choice: null}: the map runs its own algorithm for that turn.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "")
    const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.round(v) : null)
    const npc = body?.npc ?? {}
    const npcName = clip(npc.name, 60)
    const offer = cleanOffer(body?.offer)
    if (!npcName || !offer.actions.length) return NextResponse.json({ choice: null })

    let personality = ""
    try {
      const row = await findNpcRow(createAdminClient(), npcName)
      if (row) personality = [row.description, row.disposition ? `disposition: ${row.disposition}` : ""].filter(Boolean).join("; ").slice(0, 400)
    } catch (e) {
      console.error("[npc-mind] npc row lookup failed:", e)
    }

    const heroes = (Array.isArray(body?.heroes) ? body.heroes : []).slice(0, 8).map((h: Record<string, unknown>) =>
      `- ${clip(h.key, 20)}: ${clip(h.name, 40)}${h.cls ? ` (${clip(h.cls, 20)})` : ""}, HP ${num(h.hp)}/${num(h.hpMax)}, ${num(h.ft)} ft away${clip(h.conds, 80) ? `, ${clip(h.conds, 80)}` : ""}${h.lastHitMe ? ", just hurt you" : ""}`,
    )
    const side = (Array.isArray(body?.side) ? body.side : []).slice(0, 10).map((s: Record<string, unknown>) =>
      `- ${clip(s.name, 40)}${s.under ? " (under your command)" : ""}, HP ${num(s.hp)}/${num(s.hpMax)}`,
    )
    const attacks = (Array.isArray(npc.attacks) ? npc.attacks : []).slice(0, 6).map((a: Record<string, unknown>) =>
      `- ${clip(a.name, 40)}: ${a.ranged ? `ranged, ${num(a.range)} ft` : "melee"}${a.spell ? " (a spell)" : ""}`,
    )
    const log = (Array.isArray(body?.log) ? body.log : []).slice(-6).map((l: unknown) => `- ${clip(l, 160)}`)
    const order = clip(body?.orderFromAbove, 120)

    const prompt = `You are Malachar, the lich running an Out of the Abyss D&D 5e fight. You play ONE named NPC for one turn.
NPC: ${npcName}${clip(npc.epithet, 60) ? `, ${clip(npc.epithet, 60)}` : ""}. HP ${num(npc.hp)}/${num(npc.hpMax)}.${clip(npc.conds, 80) ? ` Conditions: ${clip(npc.conds, 80)}.` : ""}
${personality ? `Who they are: ${personality}` : ""}
${offer.canOrder ? "They are the highest-ranking drow in this fight: the others obey them." : clip(body?.commander, 60) ? `They answer to ${clip(body?.commander, 60)}, who commands this fight.` : ""}
${order ? `Their commander's last order: ${order}.` : ""}
Place: ${clip(body?.area, 60) || "Velkynvelve"}, round ${num(body?.round) ?? 1}. The heroes are escaped prisoners.
Heroes they can go for (use the key):
${heroes.join("\n") || "- none"}
Their own side:
${side.join("\n") || "- nobody else"}
Their attacks:
${attacks.join("\n") || "- none"}
Lately:
${log.join("\n") || "- the fight has just begun"}

Choose what they do NOW. Allowed actions: ${offer.actions.join(", ")}.
- attack: needs "target" (a hero key) and "attack" (one of their attack names).
- call_for_help: shout for reinforcements; spends the turn.
- retreat: leave the fight by the nearest way out${offer.canOrder ? " — everyone under them falls back too" : ""}.
- negotiate: call a halt and offer terms; the WHOLE fight stops and becomes a conversation.
- surrender: yield; the whole fight stops.
Play them as the book would: proud drow do not parley at full strength, cowards break when bloodied, priestesses of Lolth despise weakness. Most turns are attacks.
${offer.canOrder ? 'They may also give one order to those under them: "order": {"kind": "focus", "target": "<hero key>"} | {"kind": "protect"} | {"kind": "fall_back"} | {"kind": "hold"}, or null.' : ""}
"line": what they shout this turn, in character, at most 12 words (or "" to stay silent). Do not invent spells, items or facts.
Reply with only JSON: {"action": "...", "target": "...", "attack": "...", "line": "...", "order": null}`

    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      messages: [{ role: "user", content: prompt }],
      abortSignal: AbortSignal.timeout(6000),
    })
    const choice = parseMindReply(result.text, offer)
    if (!choice) console.warn("[npc-mind] reply outside the offer:", result.text.slice(0, 300))
    return NextResponse.json({ choice })
  } catch (error) {
    console.error("[npc-mind] failed:", error)
    return NextResponse.json({ choice: null })
  }
}
