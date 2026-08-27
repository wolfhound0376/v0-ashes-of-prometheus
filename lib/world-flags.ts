"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

// World flags are the small durable facts the whole table has to agree on.
// A row exists only once the thing has happened; absence means it has not.
// That is deliberate - there is no "false" to forget to write, and nothing
// anyone has to remember to seed.
//
// The first is PEN_DOOR_OPEN, set the moment the slave pen's door is unlocked,
// picked, or opened from the outside. Everything that should look different
// afterwards reads this rather than keeping its own copy.

export const PEN_DOOR_OPEN = "pen-door-open"

/**
 * True once the named flag has been set, live.
 *
 * Subscribed rather than polled, because a door opening is a moment: every
 * screen at the table should change at once, not on whoever refreshes first.
 */
export function useWorldFlag(key: string, campaignId = "ashes-of-prometheus") {
  const [isSet, setIsSet] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let alive = true

    async function read() {
      const { data } = await supabase
        .from("world_flags")
        .select("key")
        .eq("campaign_id", campaignId)
        .eq("key", key)
        .maybeSingle()
      if (alive) setIsSet(Boolean(data))
    }

    void read()

    // Any write to the table re-reads this one flag. The table is tiny and
    // changes a handful of times a session, so a re-read is cheaper to reason
    // about than unpacking the payload and guessing at its shape.
    const channel = supabase
      .channel(`world-flags-${key}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "world_flags" },
        () => void read(),
      )
      .subscribe()

    return () => {
      alive = false
      void supabase.removeChannel(channel)
    }
  }, [key, campaignId])

  return isSet
}
