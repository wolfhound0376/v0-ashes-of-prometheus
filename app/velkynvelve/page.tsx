"use client"

// /velkynvelve — the walkable painted outpost (Sam, 2026-10-11: "Replace it with this map").
//
// Fourteen painted plates of Velkynvelve, one per area of the book, wired together: the party walks
// across them as pixel sprites, the camera slides from plate to plate, fights zoom into the plate,
// and when an NPC wants a word the Talk button hands over to the dashboard (/?talk=…&return=/velkynvelve),
// whose "Back to the map" button comes straight back here with the party where it stood.
//
// Like /cave, the scene is a self-contained page served same-origin from public/velkynvelve-walk/
// inside an iframe, so it keeps its own render loop and audio without touching the dashboard.
// Plates and music live in Supabase storage (vtt-assets/scenes/velkynvelve/walk/); sprites come from
// /sprites. The page is built from the scratch build in the design session; the record is
// claude/Velkynvelve_Painted_Plates_2026-10-10.md in the project.
//
// WHO GETS IN (Sam, 2026-10-25). A player only while the session is live AND they hold a seat at it
// (lib/table.ts); anyone else goes to the staging table (/table), and a player the DM removes, or whose
// session the DM ends, is sent back there within a few seconds. The DM always gets in — live, or in
// rehearsal (?sandbox=1) — and the map wears the DM frame so a projected DM screen is never mistaken
// for a player's. The DM has no Dashboard link: "He does not need a dashboard UI."
//
// The old top-down Phaser map (components/velkynvelve/*) is no longer routed. It is left in place.

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { StageLink } from "@/components/stage/stage-provider"
import { ArrowLeft, Crown } from "lucide-react"
import { dmHeaders } from "@/lib/dm-key"
import { EndGameButton } from "@/components/end-game-button"
import { DiceProvider } from "@/components/dice/dice-provider"
import { WalkRollBridge } from "@/components/walk/walk-roll-bridge"
import { WalkCueBridge } from "@/components/walk/walk-cue-bridge"
import { MessagePlayerButton } from "@/components/message-player-button"

const RECHECK_MS = 6000

type Gate = "checking" | "dm" | "player"
type Status = "closed" | "lobby" | "live" | null

export default function VelkynvelvePage() {
  const router = useRouter()
  const [gate, setGate] = useState<Gate>("checking")
  // THE GHOST MAP (Sam, 2026-10-29). The session had been ended at 18:14 and this page was still playing
  // it nineteen minutes later, while /table said dark and the roster said nobody. The gate let the DM in
  // and then never looked again, so a finished game kept walking until the tab was closed. The DM still
  // always gets in — that rule stands — but the page now keeps reading the table and says so on the glass.
  const [status, setStatus] = useState<Status>(null)
  const [sandbox, setSandbox] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let live = true
    let id = "", role = ""
    try { id = localStorage.getItem("aop_character_id") ?? ""; role = localStorage.getItem("aop_access_role") ?? "" } catch { /* storage blocked */ }
    // A rehearsal deliberately ignores the session and saves nothing, so it must never be mistaken for a
    // live game — the only thing that used to tell them apart was the DM frame, which a live DM has too.
    try { setSandbox(new URLSearchParams(window.location.search).get("sandbox") === "1") } catch { /* no window */ }
    const check = async (first: boolean) => {
      try {
        const q = id ? `?characterId=${encodeURIComponent(id)}` : ""
        const r = await fetch(`/api/table${q}`, { cache: "no-store", headers: dmHeaders() })
        const j = await r.json()
        if (!live) return
        if (j.error) { if (first) setGate("player"); return }   // the table could not be read: never lock the family out on a blip
        const st: Status = j.state?.status === "lobby" || j.state?.status === "live" ? j.state.status : "closed"
        setStatus(st)
        // The DM only where this browser signed in as the DM — the map inside reads the same flag for its DM
        // tools, so the frame and the tools can never disagree (Sam, 2026-10-25: Lynkes got the frame, the
        // DM's own map lost its tools).
        if (j.isDm && role === "dm") { setGate("dm"); return }
        if (st === "live" && j.mine && !j.mine.away) { setGate("player"); return }
        router.replace("/table")
      } catch {
        if (live && first) setGate("player")
      }
    }
    check(true)
    const t = window.setInterval(() => check(false), RECHECK_MS)
    return () => { live = false; window.clearInterval(t) }
  }, [router])

  if (gate === "checking") {
    return <main className="grid h-dvh place-items-center bg-[#07060b] text-[11px] uppercase tracking-[0.4em] text-stone-600">Finding your seat…</main>
  }

  const dm = gate === "dm"
  // A DM looking at a table that is no longer open: the map below is a finished session still walking.
  // A rehearsal is supposed to ignore the table, so it is never a ghost.
  const ghost = dm && status === "closed" && !sandbox
  // DICE (Sam, 2026-10-25: "Use the dashboard UI dice roll animation and math"). A check the map asks for — picking
  // the pen gate's lock, forcing it — is rolled here, on the dashboard's one dice engine with the dashboard's modifier,
  // logged to the table and sent to Malachar. The map never rolls these itself and never asks "what did you get".
  return (
    <DiceProvider>
    <WalkRollBridge frameRef={frameRef} />
    <WalkCueBridge frameRef={frameRef} />
    <main className="flex h-dvh flex-col bg-[#07060b] text-stone-200">
      <header className="flex items-center gap-3 border-b border-amber-900/40 px-4 py-2">
        {dm ? (
          <a href="/table" className="inline-flex items-center gap-1.5 font-serif text-xs uppercase tracking-[0.18em] text-[#e8c56a] hover:text-[#fff3cf]">
            <Crown className="h-3.5 w-3.5" aria-hidden />
            The Table
          </a>
        ) : (
          <StageLink
            href="/?from=map"
            className="inline-flex items-center gap-1.5 font-serif text-xs uppercase tracking-[0.18em] text-amber-300/90 hover:text-amber-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Dashboard
          </StageLink>
        )}
        <span className="font-serif text-xs uppercase tracking-[0.22em] text-stone-400">Velkynvelve</span>
        {sandbox && (
          <span className="rounded-sm border border-sky-500/50 bg-sky-500/10 px-2 py-0.5 font-serif text-[10px] uppercase tracking-[0.2em] text-sky-300">
            Rehearsal · nothing saves
          </span>
        )}
        {dm ? <span className="ml-auto"><EndGameButton /></span> : <MessagePlayerButton variant="pixel" className="ml-auto" />}
      </header>
      <div className={dm ? "relative min-h-0 flex-1 p-[14px]" : "relative min-h-0 flex-1"}>
        <iframe
          ref={frameRef}
          src="/velkynvelve-walk/index.html"
          title="Velkynvelve"
          className="h-full w-full border-0"
          allow="autoplay; fullscreen"
        />
        {dm && <DmFrame />}
        {ghost && <GhostNotice />}
      </div>
    </main>
    </DiceProvider>
  )
}

// Shown over a DM's map when the table has closed under it. Not a bounce: yanking a projected map out from
// under a DM mid-sentence is worse than the ghost. It states what happened and offers the way back.
function GhostNotice() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#07060b]/85 px-6 backdrop-blur-[2px]">
      <div className="max-w-md rounded-sm border border-amber-700/50 bg-[#120d08] p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.8)]">
        <p className="font-serif text-sm uppercase tracking-[0.22em] text-[#e8c56a]">This session has ended</p>
        <p className="mt-3 text-sm leading-relaxed text-stone-400">
          The table is closed and every seat is empty. What is still moving below is the session you just
          finished, not a live game — nothing here is being saved.
        </p>
        <a
          href="/table"
          className="mt-5 inline-block rounded-sm border border-[#c9a23a] px-4 py-2 font-serif text-xs uppercase tracking-[0.2em] text-[#f4d77a] hover:bg-[#c9a23a]/10"
        >
          Back to the table
        </a>
      </div>
    </div>
  )
}

// The DM frame: a stepped pixel-art border in gold and arcane violet, drawn as vector squares so it stays
// razor sharp at any resolution (a 4K projector included), with pixel-art corner sigils and a "DM MODE"
// plate. It sits over the map's edge and never takes a click.
function DmFrame() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <style>{`
        @keyframes aop-dm-ebb { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        .aop-dm-band { position:absolute; inset:0; }
      `}</style>
      {/* bands, outside in: black, gold, dark, violet (breathing), gold hairline */}
      <div className="aop-dm-band border-[3px] border-black" />
      <div className="aop-dm-band m-[3px] border-[4px] border-[#c9a23a]" />
      <div className="aop-dm-band m-[7px] border-[2px] border-[#2a1606]" />
      <div className="aop-dm-band m-[9px] border-[3px] border-[#8b3dff] [animation:aop-dm-ebb_3.2s_ease-in-out_infinite] [box-shadow:0_0_14px_2px_rgba(139,61,255,0.55),inset_0_0_14px_2px_rgba(139,61,255,0.45)]" />
      <div className="aop-dm-band m-[12px] border-[2px] border-[#f4d77a]" />
      {[
        "left-0 top-0", "right-0 top-0 [transform:scaleX(-1)]", "left-0 bottom-0 [transform:scaleY(-1)]", "right-0 bottom-0 [transform:scale(-1,-1)]",
      ].map((pos) => (
        <svg key={pos} viewBox="0 0 12 12" shapeRendering="crispEdges" className={`absolute h-12 w-12 ${pos}`}>
          <rect x="0" y="0" width="12" height="3" fill="#000" /><rect x="0" y="0" width="3" height="12" fill="#000" />
          <rect x="1" y="1" width="9" height="2" fill="#c9a23a" /><rect x="1" y="1" width="2" height="9" fill="#c9a23a" />
          <rect x="3" y="3" width="4" height="4" fill="#8b3dff" /><rect x="4" y="4" width="2" height="2" fill="#f4d77a" />
          <rect x="8" y="1" width="1" height="1" fill="#fff3cf" /><rect x="1" y="8" width="1" height="1" fill="#fff3cf" />
        </svg>
      ))}
      <div className="absolute left-1/2 top-0 -translate-x-1/2">
        <svg viewBox="0 0 64 9" shapeRendering="crispEdges" className="h-[18px] w-[128px]">
          <rect x="0" y="0" width="64" height="9" fill="#000" />
          <rect x="1" y="1" width="62" height="7" fill="#2a1606" />
          <rect x="1" y="1" width="62" height="1" fill="#c9a23a" /><rect x="1" y="7" width="62" height="1" fill="#c9a23a" />
          <text x="32" y="6.4" textAnchor="middle" fontSize="5.2" fontFamily="monospace" fontWeight="bold" fill="#f4d77a" letterSpacing="0.6">DM MODE</text>
        </svg>
      </div>
    </div>
  )
}
