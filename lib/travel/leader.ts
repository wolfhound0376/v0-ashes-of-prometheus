// lib/travel/leader.ts
//
// Who leads the march (Sam, 2026-10-14): "DM selects it but the group technically votes to
// determine the leader from the main players. That can change if they lose confidence."
//
// So: the players at the table vote among themselves; a candidate with more than half of the
// eligible votes leads. Votes stand until changed, so losing confidence is simply voting again —
// when a new candidate passes half, the lead changes. The DM may set the leader outright (an
// override), and the DM may always move the party regardless of who leads.
//
// THE HOST LEADS (Sam, 2026-11-10): "Whomever is the host of the game should be the leader." The hero who
// started the campaign (lib/host.ts, world flag `host`) leads the march without a vote. The order is:
// the DM's named leader if there is one, else the host, else whoever the vote carried. So the vote only
// decides at a table that has no host, and the DM can still hand the lead to someone else.
//
// Pure. The route stores votes in travel_march.leader_votes and the result in
// travel_march.leader_character_id (migrations/travel_march_leader.sql).

export interface LeaderTally {
  /** The character with more than half of the eligible voters behind them, or null. */
  leader: string | null
  /** Votes per candidate, eligible voters only. */
  counts: Record<string, number>
  /** Votes needed to lead: strictly more than half of the eligible voters. */
  needed: number
  eligible: number
}

/** `votes` maps voter character id → candidate character id. Only eligible voters and eligible candidates count. */
export function tallyLeader(votes: Record<string, string> | null | undefined, eligible: readonly string[]): LeaderTally {
  const ok = new Set(eligible)
  const counts: Record<string, number> = {}
  for (const [voter, cand] of Object.entries(votes ?? {})) {
    if (!ok.has(voter) || !ok.has(cand)) continue
    counts[cand] = (counts[cand] ?? 0) + 1
  }
  const needed = Math.floor(eligible.length / 2) + 1
  let leader: string | null = null
  for (const [cand, n] of Object.entries(counts)) if (n >= needed) leader = cand
  return { leader, counts, needed, eligible: eligible.length }
}

/** May this actor move the party? The DM always; a player only while they lead. */
export function mayLead(actor: { dm: boolean; characterId: string | null }, leader: string | null): boolean {
  if (actor.dm) return true
  return !!actor.characterId && actor.characterId === leader
}

/**
 * Who leads, and whether the vote is what decided it. `named` is the DM's override, `host` the hero who
 * started the campaign, `voted` the vote's winner; each may be null.
 */
export function whoLeads(named: string | null, host: string | null, voted: string | null): { leader: string | null; by_vote: boolean; by: "dm" | "host" | "vote" | null } {
  if (named) return { leader: named, by_vote: false, by: "dm" }
  if (host) return { leader: host, by_vote: false, by: "host" }
  if (voted) return { leader: voted, by_vote: true, by: "vote" }
  return { leader: null, by_vote: false, by: null }
}
