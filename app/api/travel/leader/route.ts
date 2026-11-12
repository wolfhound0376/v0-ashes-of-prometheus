import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { tallyLeader, whoLeads } from "@/lib/travel/leader"
import { activeRunId, readLeader, roster } from "@/lib/travel/leader-store"
import { normaliseDay, normaliseLog } from "@/lib/travel/march"
import { readSeated } from "@/lib/seats"

// GET /api/travel/leader — who leads the march, for every browser at the table.
//
// Public on purpose: a player needs to know whether their own character leads
// (to be offered the road) and how the vote stands. It gives away nothing the
// DM keeps: the day NUMBER stays behind the screen (same rule as
// /api/game-clock); only the hours walked today, the pace and the day's miles
// cross, because the hover card needs them to price a leg.
//
// Writes go through POST /api/travel {action: "vote" | "leader"}.

export const dynamic = "force-dynamic"

export async function GET() {
  const db = createAdminClient()
  const runId = await activeRunId(db)
  const [lead, party, seats, marchRes, haltRes] = await Promise.all([
    readLeader(db, runId),
    roster(db),
    // who is at the table this run, in the order they sat down: the map draws them marching behind the leader
    readSeated(db),
    runId ? db.from("travel_march").select("*").eq("campaign_run_id", runId).maybeSingle() : Promise.resolve({ data: null }),
    // The march's open halt, if any. A browser that left the map for the camp comes back to a fresh page;
    // without this the camp card - and with it "break camp", which starts the new day - would be gone.
    db.from("travel_arrivals").select("outcome,node_id").eq("halted", true).is("resolved_at", null).limit(1).maybeSingle(),
  ])
  const ho = (haltRes.data?.outcome ?? null) as { kind?: unknown; title?: unknown; body?: unknown; source?: unknown } | null
  // Only a camp crosses here: an encounter's title and text stay with the browser that rolled it.
  const openHalt = ho && ho.kind === "camp" ? { kind: "camp", title: String(ho.title ?? "Camp"), body: typeof ho.body === "string" ? ho.body : null, source: String(ho.source ?? "") } : null
  const tally = tallyLeader(lead.votes, party.map((c) => c.id))
  const leads = whoLeads(lead.leader, lead.host, tally.leader)
  const day = normaliseDay((marchRes.data as Record<string, unknown> | null) ?? null)
  return NextResponse.json({
    leader: leads.leader,
    by_vote: leads.by_vote,
    by: leads.by,
    votes: lead.votes,
    counts: tally.counts,
    needed: tally.needed,
    roster: party,
    seated: seats.filter((s) => !s.away).map((s) => s.id),
    available: lead.available,
    open_halt: openHalt,
    // today_log: the day's ledger for the fatigue gauge (absent until migration travel_march_today_log; then [])
    day: { pace: day.pace, hours_today: day.hours_today, day_miles: Number(marchRes.data?.day_miles) || 7, today_log: normaliseLog((marchRes.data as Record<string, unknown> | null)?.today_log) },
  })
}
