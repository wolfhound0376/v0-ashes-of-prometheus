import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { tallyLeader } from "@/lib/travel/leader"
import { activeRunId, readLeader, roster } from "@/lib/travel/leader-store"
import { normaliseDay } from "@/lib/travel/march"

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
  const [lead, party, marchRes] = await Promise.all([
    readLeader(db, runId),
    roster(db),
    runId ? db.from("travel_march").select("pace,hours_today,day_miles").eq("campaign_run_id", runId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const tally = tallyLeader(lead.votes, party.map((c) => c.id))
  const day = normaliseDay((marchRes.data as Record<string, unknown> | null) ?? null)
  return NextResponse.json({
    leader: lead.leader ?? tally.leader,
    by_vote: !lead.leader && !!tally.leader,
    votes: lead.votes,
    counts: tally.counts,
    needed: tally.needed,
    roster: party,
    available: lead.available,
    day: { pace: day.pace, hours_today: day.hours_today, day_miles: Number(marchRes.data?.day_miles) || 7 },
  })
}
