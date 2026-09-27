"use client"

// The learning mark on the sheet — docs/claude_Earned_Proficiency.md §6.
//
// Returns the snake_case skills that have any progress on the ledger and are
// not yet awarded, for one character. A presence, not a meter: the hook never
// sees a count. Best-effort: on any failure the sheet simply shows no marks.
//
// `refreshKey` re-fetches when it changes - the dashboard passes something
// that moves once per turn (the log length), because progress lands when a
// roll is accepted and the mark should appear the turn after, without polling.

import { useEffect, useState } from "react"

export function useSkillMarks(characterId: string | null | undefined, refreshKey?: unknown): Set<string> {
  const [marks, setMarks] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!characterId) {
      setMarks(new Set())
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/skill-progress/marks?characterId=${encodeURIComponent(characterId)}`, { cache: "no-store" })
        if (!res.ok) return
        const body = (await res.json()) as { skills?: unknown }
        if (cancelled) return
        const skills = Array.isArray(body.skills) ? body.skills.filter((s): s is string => typeof s === "string") : []
        setMarks(new Set(skills))
      } catch {
        // A missing mark is never worth an error on the table.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [characterId, refreshKey])

  return marks
}

/** "Sleight of Hand" / "animal-handling" → the ledger's snake_case key. */
export function skillMarkKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_")
}
