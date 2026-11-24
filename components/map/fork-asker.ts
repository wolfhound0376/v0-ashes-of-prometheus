"use client"

// "OK, WHICH ONE?" (Sam, 2026-11-23: "When there are multiple ways to go, make sure someone asks 'Ok, which one?'").
// The travel map's fork (the walk hands the party out onto several roads: the "Which way?" card) is asked by someone in
// the company, out loud in their own saved voice: a companion if one travels with you, else another hero, nobody when
// you walk alone (the card still asks). The walk page does the same at its own forks (template.html chooseDestination).
// The company is the roster the road already reads (app/api/camp/roster); the voice is /api/npc-tts through the
// page's one mouth (lib/speech-queue), the same route the Message button uses.

import { useEffect, useState } from "react"
import { speak } from "@/lib/speech-queue"

export const FORK_LINE = "Ok, which one?"

type Member = { slug: string; pc: boolean; name: string; id?: string | null }

/** Who asks at the fork, while `active`; null until the company is known, or when nobody walks with you. */
export function useForkAsker(active: boolean, myCharacterId: string | null | undefined): string | null {
  const [who, setWho] = useState<string | null>(null)
  useEffect(() => {
    if (!active) { setWho(null); return }
    let alive = true
    fetch("/api/camp/roster")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return
        const members: Member[] = Array.isArray(j?.members) ? j.members : []
        const companions = members.filter((m) => !m.pc && m.name)
        const heroes = members.filter((m) => m.pc && m.name && (!myCharacterId || m.id !== myCharacterId))
        const pool = companions.length ? companions : heroes
        if (!pool.length) return
        const m = pool[Math.floor(Math.random() * pool.length)]
        setWho(m.name)
        speak({
          rank: "npc",
          speaker: m.name,
          fetch: async () => {
            try {
              const res = await fetch("/api/npc-tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: FORK_LINE, npcName: m.name }) })
              return res.ok ? await res.blob() : null
            } catch { return null }
          },
        })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [active, myCharacterId])
  return who
}
