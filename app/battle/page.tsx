"use client"

// /battle — the combat board, full screen.
//
// It lived inside the dashboard's stage window first, and Sam's verdict was
// immediate: "too cluttered and it's really dark, can't see anything." He was
// right on both. A 3D board squeezed into a 500-px strip between nine panels
// has no room to orbit, and the stage's own toolbar, tabs and gradients sat
// on top of it. The board is a place you GO, like /map — the whole viewport,
// nothing else fighting for it.

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import CombatBoard3D from "@/components/tactical/combat-board-3d"
import { DynamicMusic } from "@/components/dashboard/dynamic-music"
import { createClient } from "@/lib/supabase/client"
import { isCombatant } from "@/lib/challenge-rating"
import { CANONICAL_START_LOCATION } from "@/lib/game-data"

// The music followed the party everywhere EXCEPT the one screen a fight is
// actually fought on.
//
// DynamicMusic was mounted only on the dashboard, and v4-dashboard sends a DM
// browser here the moment a fight starts. So the combat track was selected on
// a page the DM was being navigated away from in the same breath, and this
// page — where the fight happens — was silent. Worse: while a fight is live
// that redirect fires on every load of `/`, so a DM could not get back to the
// player at all. Players were never redirected and heard it normally; the DM
// was the one person at the table who could not.
//
// The control carries its own fixed position (bottom-16 right-20), which
// clears the board's End Combat button at bottom-3 right-3.
function BattleMusic() {
  const [location, setLocation] = useState<string | null>(null)
  // Two independent reasons the music should turn to combat, OR-ed below.
  const [threat, setThreat] = useState(false)
  const [fightLive, setFightLive] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let alive = true

    // The room the party is standing in, by position rather than by whichever
    // environments row was edited last — the same authority the NPC window's
    // backdrop uses, so the board and the dashboard cannot disagree about
    // which room the fight is in.
    async function loadLocation() {
      const { data: position } = await supabase
        .from("party_position").select("node_id").limit(1).maybeSingle()
      if (!position?.node_id) return
      const { data: node } = await supabase
        .from("travel_nodes").select("scene_environment_id")
        .eq("id", position.node_id).maybeSingle()
      if (!node?.scene_environment_id) return
      const { data: env } = await supabase
        .from("environments").select("name")
        .eq("id", node.scene_environment_id).maybeSingle()
      if (alive && env?.name) setLocation(env.name)
    }

    // "In combat" on the dashboard means an active NPC that is a threat. That
    // is the right question THERE, where there is no initiative order to read.
    async function loadCombat() {
      const { data } = await supabase
        .from("npc_encounters").select("is_active, challenge_rating").eq("is_active", true)
      if (alive) setThreat((data ?? []).some(n => isCombatant(n.challenge_rating)))
    }

    // ...but on the BOARD there is, and it is the authority. A fight here is
    // `combat_state.status = 'active'`: initiative rolled, a turn order, a
    // round counter. Asking npc_encounters instead was silent during real
    // fights — observed 2026-08-27 with a live round-1 turn order on the map
    // while the only active encounter row was Buppido at CR 0, correctly not
    // a combatant. The DM ran the whole fight to the room's ambient theme.
    async function loadFight() {
      const { data } = await supabase
        .from("combat_state").select("id").eq("status", "active").limit(1).maybeSingle()
      if (alive) setFightLive(Boolean(data))
    }

    void loadLocation()
    void loadCombat()
    void loadFight()

    // The fight ending should drop the music back to the room's own theme
    // without anyone reloading the board.
    const channel = supabase
      .channel("battle-music")
      .on("postgres_changes", { event: "*", schema: "public", table: "npc_encounters" }, () => { void loadCombat() })
      .on("postgres_changes", { event: "*", schema: "public", table: "combat_state" }, () => { void loadFight() })
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [])

  // Hold at the canonical start room until the real one arrives, exactly as
  // the dashboard does — never a client-side default that could pick a pool
  // from another part of the world.
  return (
    <DynamicMusic
      location={location ?? CANONICAL_START_LOCATION}
      inCombat={fightLive || threat}
    />
  )
}

function BattleBoardPage() {
  const router = useRouter()
  const sandbox = useSearchParams().get("sandbox") === "1"
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#020204]">
      {sandbox && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-40 -translate-x-1/2 rounded-b border border-t-0 border-[#7a5c2b] bg-[#2a1f10]/95 px-4 py-1 font-serif text-[10px] uppercase tracking-[0.25em] text-[#f0cd7a]">
          Rehearsal — nothing here is canon
        </div>
      )}
      <CombatBoard3D
        sandbox={sandbox}
        onBack={() => {
          // Mark this exit as deliberate. The dashboard's live-fight redirect
          // checks this flag; without it, leaving the board during combat
          // bounced the DM straight back to /battle on arrival.
          try { sessionStorage.setItem("aop-left-battle", "1") } catch {}
          router.push("/")
        }}
      />
      <BattleMusic />
    </div>
  )
}

// useSearchParams forces this subtree to render on the client; without a
// Suspense boundary the App Router fails the build at prerender time.
export default function BattlePage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#020204]" />}>
      <BattleBoardPage />
    </Suspense>
  )
}
