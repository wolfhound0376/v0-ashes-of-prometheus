/**
 * WHERE THE TOKENS WENT — one row per NPC opener or named-NPC fight turn: did the bank (or the map's own algorithm)
 * answer it, or did it pay for a model call, and why (migrations/20261124050000_opener_banks.sql). The Cast shows the
 * tally per agent next to the options' own "from the bank / written by the model" tags, so Sam can see the saving.
 *
 * Best-effort by contract: a failed write is logged and never costs the turn.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type TurnRoute = "opener" | "mind"
export type TurnSource = "bank" | "algorithm" | "model"

export async function logTurn(db: Db, t: { npc: string; agentKey?: string | null; route: TurnRoute; source: TurnSource; why: string }): Promise<void> {
  try {
    const { error } = await db.from("npc_turns").insert({
      npc: t.npc.slice(0, 60),
      agent_key: t.agentKey ?? null,
      route: t.route,
      source: t.source,
      why: t.why.slice(0, 80),
    })
    if (error) console.error("[npc-turns]", error.message)
  } catch (e) {
    console.error("[npc-turns]", (e as Error).message)
  }
}
