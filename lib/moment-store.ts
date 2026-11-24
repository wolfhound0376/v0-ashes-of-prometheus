/**
 * Reads the rows lib/moment.ts builds THE MOMENT from. Best-effort: any failure gives an empty moment authored by
 * Malachar, so the option chips never wait on it or break for it.
 */
import { buildMoment, type CardLite, type Moment, type WalkRow } from "@/lib/moment"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function loadMoment(db: Db, opts: { characterId: string | null; talkingTo?: string | null }): Promise<{ moment: Moment; cards: CardLite[] }> {
  let cards: CardLite[] = []
  try {
    const since = new Date(Date.now() - 15 * 60_000).toISOString()
    const [walk, agents, roll] = await Promise.all([
      db.from("walk_world").select("plate, state, heroes, updated_at").order("updated_at", { ascending: false }).limit(4),
      db.from("npc_agents").select("key, name, aliases, sprite_slug, agenda"),
      opts.characterId
        ? db.from("roll_requests").select("skill, purpose").eq("character_id", opts.characterId).eq("status", "pending").gte("created_at", since).order("created_at", { ascending: false }).limit(1)
        : Promise.resolve({ data: [] }),
    ])
    cards = (agents.data ?? []) as CardLite[]
    const moment = buildMoment({
      rows: (walk.data ?? []) as WalkRow[],
      characterId: opts.characterId,
      cards,
      talkingTo: opts.talkingTo ?? null,
      roll: (roll.data ?? [])[0] ?? null,
    })
    return { moment, cards }
  } catch (e) {
    console.error("[moment] load failed:", e)
    return { moment: buildMoment({ rows: [], characterId: null, cards, talkingTo: opts.talkingTo ?? null }), cards }
  }
}
