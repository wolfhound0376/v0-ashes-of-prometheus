"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { campVerdict, type CampVerdict, type PartyWhere } from "@/lib/camp-where"

const POLL_MS = 20_000

/**
 * May the party make camp from where it stands right now?
 *
 * Reads party_location_label() (anon may call it) and re-reads when the party
 * moves on the travel map (realtime on party_position) and on a slow poll,
 * because stepping between nodes inside a place moves subnodal_party_position,
 * which is not in the realtime publication.
 *
 * `null` until the first answer arrives.
 */
export function useCampVerdict(): CampVerdict | null {
  const [verdict, setVerdict] = useState<CampVerdict | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let alive = true
    async function load() {
      const [{ data, error }, sit] = await Promise.all([
        supabase.rpc("party_location_label"),
        // the walk plate the party stands on: a cavern or road plate is outside the outpost (lib/camp-where.ts)
        supabase.from("party_situation").select("sub_location").limit(1).maybeSingle(),
      ])
      if (!alive) return
      // A failed read proves nothing about where the party is; do not lock the fire over it.
      const plate = (sit.data as { sub_location?: string | null } | null)?.sub_location ?? null
      setVerdict(campVerdict(error ? null : (data as PartyWhere | null), plate))
    }
    void load()
    const t = setInterval(load, POLL_MS)
    const onFocus = () => void load()
    window.addEventListener("focus", onFocus)
    const ch = supabase
      .channel("camp-verdict")
      .on("postgres_changes", { event: "*", schema: "public", table: "party_position" }, () => void load())
      .subscribe()
    return () => {
      alive = false
      clearInterval(t)
      window.removeEventListener("focus", onFocus)
      void supabase.removeChannel(ch)
    }
  }, [])

  return verdict
}
