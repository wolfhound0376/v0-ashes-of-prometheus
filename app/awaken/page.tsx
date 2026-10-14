"use client"

// /awaken — between the door and the pen.
//
// Sam, 2026-10-14: "Once selected the game shows you your opening cinematic and then opens the
// Area 11. The game then has you roll ... to determine what you start out with and Malachar
// narrates briefly."
//
//   1. THE FILM     the opening clip for the slave pen (cinematic_clips, kind environment, scope
//                   party), resolved by /api/cinematics as a player request so it counts as seen
//                   for this character — the dashboard's look-around will not replay it. No film,
//                   or seen already: straight on.
//   2. THE ROLL     1d20 + days imprisoned (1d10), on the shared dice (components/dashboard/
//                   fortune-roll.tsx, lib/scavenged.ts). Already rolled this run: straight on.
//   3. HIS WORDS    Malachar's narration of the roll, shown here as it is written, then
//   4. THE PEN      /velkynvelve, Area 11.
//
// Per-character films (the memory sequence in Character_Intro_Draft_2026-10-12) slot in at step 1
// once they are approved and shot: ask for kind "action", scope "solo", state "awaken" first.

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { DiceProvider } from "@/components/dice/dice-provider"
import { CinematicOverlay } from "@/components/dashboard/cinematic-overlay"
import { FortuneRoll } from "@/components/dashboard/fortune-roll"
import { useLich } from "@/lib/hooks/use-lich"
import { MusicToggle } from "@/components/music-toggle"
import { fadeOutThemeAudio, useThemeAudio } from "@/components/theme-audio"

/** Where the party wakes. Must match `environments.name` / `cinematic_clips.location` (the restart route's STARTING_LOCATION). */
const OPENING_LOCATION = "Scene_1_Velkynvelve (slave pen)"
const PEN_ROUTE = "/velkynvelve"

type Step = "seat" | "film" | "roll" | "words" | "go"

export default function AwakenPage() {
  const router = useRouter()
  // The theme carries on under the film (the film is muted by house rule) and the roll, and
  // fades as the pen takes over — the map has music of its own.
  useThemeAudio()
  const [seat, setSeat] = useState<{ id: string; token: string; name: string | null } | null>(null)
  const [step, setStep] = useState<Step>("seat")
  const [film, setFilm] = useState<string | null>(null)
  const [words, setWords] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)
  const { sendMessage } = useLich("abyss")
  const started = useRef(false)

  // The seat this browser holds. Nobody seated: the door.
  useEffect(() => {
    try {
      const id = window.localStorage.getItem("aop_character_id")
      const token = window.localStorage.getItem("aop_claim_token")
      if (!id || !token) { router.replace("/join"); return }
      window.sessionStorage.setItem("aop_intro_seen", "1")
      setSeat({ id, token, name: null })
      fetch(`/api/verify-claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterId: id, claimToken: token }) })
        .then((r) => r.json())
        .then((j) => {
          if (!j?.valid) { router.replace("/join"); return }
          if (j?.character?.name) setSeat((s) => (s ? { ...s, name: j.character.name } : s))
        })
        .catch(() => {})
    } catch { router.replace("/join") }
  }, [router])

  // 1. the film
  useEffect(() => {
    if (!seat || started.current) return
    started.current = true
    const params = new URLSearchParams({ location: OPENING_LOCATION, kind: "environment", scope: "party", trigger_type: "player_initiated", character_id: seat.id })
    fetch(`/api/cinematics?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const url = j?.clip?.video_url as string | undefined
        if (url) { setFilm(url); setStep("film") } else setStep("roll")
      })
      .catch(() => setStep("roll"))
  }, [seat])

  // 3. his words — the roll's result handed to Malachar as a direction; his answer is shown here.
  const narrate = useCallback(async (direction: string) => {
    if (!seat) return
    setWaiting(true)
    try {
      const res = await sendMessage(direction, seat.id, seat.token, { director: true })
      setWords(res?.text?.trim() || null)
    } catch (e) {
      console.error("[awaken] narration failed:", e)
    } finally {
      setWaiting(false)
    }
  }, [seat, sendMessage])

  const goToPen = () => { setStep("go"); fadeOutThemeAudio(); router.replace(PEN_ROUTE) }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-stone-200">
      <MusicToggle />
      <div className="pointer-events-none absolute inset-0 bg-[url('/images/intro-poster.webp')] bg-cover bg-center opacity-20" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.9)_70%,#000_100%)]" />

      {step === "film" && film && <CinematicOverlay src={film} onClose={() => setStep("roll")} />}

      <DiceProvider>
        {step === "roll" && seat && (
          <FortuneRoll
            characterId={seat.id}
            claimToken={seat.token}
            characterName={seat.name}
            onNarrate={(d) => { void narrate(d) }}
            onDismiss={(rolled) => setStep(rolled ? "words" : "go")}
          />
        )}
      </DiceProvider>

      <div className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 py-14 text-center">
        {step === "seat" && <div className="text-[11px] uppercase tracking-[0.4em] text-stone-600">Finding your seat…</div>}

        {step === "words" && (
          <>
            <div className="text-[10px] uppercase tracking-[0.5em] text-[#8a6a3a]">Malachar</div>
            <div className="mt-6 min-h-[6rem] whitespace-pre-line font-serif text-lg leading-relaxed text-[#e8d9ae]">
              {words ?? (waiting ? <span className="animate-pulse text-stone-500">…</span> : <span className="text-stone-600">He says nothing yet. The pen is waiting.</span>)}
            </div>
            <button
              onClick={goToPen}
              disabled={waiting}
              className="mt-10 rounded-sm border-2 border-[#8a6a3a] bg-gradient-to-b from-[#2a2015]/90 via-black/80 to-[#2a2015]/90 px-12 py-4 font-serif text-2xl uppercase tracking-[0.35em] text-[#e8c56a] shadow-[0_0_40px_rgba(201,168,104,0.3)] transition-all hover:border-[#f4e0a8] hover:text-[#fff3cf] disabled:opacity-50"
            >
              Into the pen
            </button>
          </>
        )}

        {step === "go" && (
          <GoNow onGo={goToPen} />
        )}
      </div>
    </div>
  )
}

/** Already rolled this run (a return visit): no card, no words — straight to the pen after a beat. */
function GoNow({ onGo }: { onGo: () => void }) {
  useEffect(() => { const t = window.setTimeout(onGo, 400); return () => window.clearTimeout(t) }, [onGo])
  return <div className="text-[11px] uppercase tracking-[0.4em] text-stone-600">The pen…</div>
}
