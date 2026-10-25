"use client"

// /choose — WHO WALKS INTO THE DARK. Where Start New Game lands.
//
// Sam, 2026-10-25: "Players may choose from one of four characters that cuts into their intro and
// showcases their abilities and history OR they may create their own character. THIS IS THE ONLY
// WAY TO THE FORGE OUTSIDE THE DM CREATING ONE HIMSELF."
//
//   four canon cards  → confirm (your name) → the hero's film (Skip ▸; follows the Cinematics
//                        switch) → three words → wait for the DM → Enter → /awaken
//   Forge Your Own    → /forge
//
// A canon pick is reserved the moment it is confirmed (/api/forge/claim-canon) so two strangers
// cannot both wait for Fifi; the DM opens the cell at /dm exactly as for a Forge hero. One of each
// per run: a hero someone is seated as, or someone is waiting to be, shows greyed. The claim is kept
// in this browser (CLAIM_KEY) so closing the tab and coming back resumes the wait.
//
// Design of record: project doc claude/Canon_Hero_Intros_2026-10-25.md.

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ClipboardCopy, Hammer } from "lucide-react"
import { cn } from "@/lib/utils"
import { cinematicsOn } from "@/lib/settings"

type Hero = {
  slug: string; name: string; clazz: string; origin: string | null; hook: string; powers: string[]; portrait: string
  availability: "free" | "seated" | "claimed"; film: string | null
}
type Claim = { code: string; slug: string; heroName: string }
type Stage = "list" | "confirm" | "film" | "waiting"

const CLAIM_KEY = "aop_canon_claim_v1"
const CHARACTER_LS_KEY = "aop_character_id"
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"

function readClaim(): Claim | null {
  try {
    const raw = window.localStorage.getItem(CLAIM_KEY)
    const c = raw ? (JSON.parse(raw) as Claim) : null
    return c && typeof c.code === "string" && typeof c.slug === "string" ? c : null
  } catch { return null }
}
function writeClaim(c: Claim | null) {
  try { c ? window.localStorage.setItem(CLAIM_KEY, JSON.stringify(c)) : window.localStorage.removeItem(CLAIM_KEY) } catch { /* private mode */ }
}

export default function ChooseHero() {
  const router = useRouter()
  const [heroes, setHeroes] = useState<Hero[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>("list")
  const [picked, setPicked] = useState<Hero | null>(null)
  const [claim, setClaim] = useState<Claim | null>(null)
  const [leaving, setLeaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/heroes", { cache: "no-store" })
      const j = await r.json()
      setHeroes(Array.isArray(j.heroes) ? j.heroes : [])
      setLoadErr(j.error ?? null)
    } catch { setLoadErr("Could not reach the cells."); setHeroes([]) }
  }, [])

  useEffect(() => {
    const c = readClaim()
    if (c) { setClaim(c); setStage("waiting") }
    load()
  }, [load])

  // The Forge's one door: ask for the pass (lib/forge-pass.ts), then go. A refused pass says so.
  const forge = async () => {
    try {
      const r = await fetch("/api/forge/pass", { method: "POST" })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setLoadErr(j.error ?? "The Forge would not open."); return }
    } catch { setLoadErr("Could not reach the Forge."); return }
    setLeaving(true); window.setTimeout(() => router.push("/forge"), 380)
  }

  const reserved = (c: Claim, hero: Hero) => {
    writeClaim(c); setClaim(c)
    setStage(hero.film && cinematicsOn() ? "film" : "waiting")
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-black text-stone-200">
      {/* the title painting, dimmed and soft, so this reads as the next room of the same house */}
      <div className="pointer-events-none fixed inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/intro-poster.webp" alt="" className="h-full w-full scale-110 object-cover opacity-30 blur-md" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.9)_75%)]" />
      </div>

      {stage === "film" && picked?.film && claim && (
        <HeroFilm src={picked.film} onDone={() => setStage("waiting")} />
      )}

      <div className={cn("relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-10 transition-opacity duration-300 sm:px-8", leaving && "opacity-0")}>
        <header className="mb-8 text-center">
          <div className="text-[10px] uppercase tracking-[0.5em] text-[#8a6a3a]">Out of the Abyss</div>
          <h1 className="mt-3 font-serif text-3xl uppercase tracking-[0.25em] text-[#e8c56a] sm:text-4xl">Who walks into the dark?</h1>
          <div className="mx-auto mt-4 h-px w-48 bg-gradient-to-r from-transparent via-[#c9a868] to-transparent" />
        </header>

        {stage === "waiting" && claim ? (
          <Waiting claim={claim} onCancel={() => { writeClaim(null); setClaim(null); setStage("list"); load() }} router={router} />
        ) : (
          <>
            {heroes === null ? (
              <div className="py-24 text-center text-[11px] uppercase tracking-[0.4em] text-stone-600">Unlocking the cells…</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
                {heroes.map((h, i) => (
                  <HeroCard key={h.slug} hero={h} delay={i * 0.07} onPick={() => { setPicked(h); setStage("confirm") }} />
                ))}
                <ForgeCard onPick={forge} delay={heroes.length * 0.07} />
              </div>
            )}
            {loadErr && <p className="mt-6 text-center text-[12px] text-red-400/80">{loadErr}</p>}
            <p className="mt-8 text-center text-[11px] leading-relaxed text-stone-600">
              Each hero walks with one player at a time. Whoever you choose waits for the Dungeon Master to open their cell.
            </p>
          </>
        )}
      </div>

      {stage === "confirm" && picked && (
        <Confirm hero={picked} onBack={() => { setStage("list"); setPicked(null) }} onReserved={(c) => reserved(c, picked)} onTaken={() => { setStage("list"); setPicked(null); load() }} />
      )}

      <style>{`@keyframes chooseIn { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } } .choose-in { animation: chooseIn .6s ease-out both }`}</style>
    </div>
  )
}

function HeroCard({ hero, onPick, delay }: { hero: Hero; onPick: () => void; delay: number }) {
  const free = hero.availability === "free"
  return (
    <button
      type="button"
      disabled={!free}
      onClick={onPick}
      style={{ animationDelay: `${delay}s` }}
      className={cn(
        "choose-in group relative aspect-[3/5] overflow-hidden rounded-[3px] border text-left transition-all duration-300",
        free
          ? "border-[#7a5f33]/70 hover:-translate-y-1 hover:border-[#e8c56a] hover:shadow-[0_0_50px_rgba(232,197,106,0.35)]"
          : "cursor-not-allowed border-[#2a241e]",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={hero.portrait} alt="" className={cn("absolute inset-0 h-full w-full object-cover object-top transition-transform duration-700", free ? "group-hover:scale-105" : "grayscale opacity-40")} />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
        <div className="text-[9px] uppercase tracking-[0.3em] text-[#c9a868]/90">{hero.clazz}{hero.origin ? ` · ${hero.origin}` : ""}</div>
        <div className="mt-1 font-serif text-base leading-tight text-[#f0dba8] sm:text-lg">{hero.name}</div>
        {free ? (
          <p className="mt-2 hidden text-[11px] italic leading-snug text-stone-400 sm:block">{hero.hook}</p>
        ) : (
          <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-stone-500">{hero.availability === "seated" ? "Already walks the Underdark" : "Someone waits to be them"}</p>
        )}
      </div>
    </button>
  )
}

function ForgeCard({ onPick, delay }: { onPick: () => void; delay: number }) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{ animationDelay: `${delay}s` }}
      className="choose-in group relative col-span-2 flex aspect-auto min-h-40 flex-col items-center justify-center overflow-hidden rounded-[3px] border border-dashed border-[#8a6a3a]/70 bg-gradient-to-b from-[#1a120a]/90 to-black/90 p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-solid hover:border-[#e8c56a] hover:shadow-[0_0_50px_rgba(255,140,40,0.3)] lg:col-span-1 lg:aspect-[3/5]"
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_bottom,rgba(255,120,30,0.28)_0%,transparent_70%)] opacity-60 transition-opacity group-hover:opacity-100" />
      <Hammer className="relative h-10 w-10 text-[#c9a868] transition-transform duration-300 group-hover:-rotate-12 group-hover:text-[#ffcf7a]" />
      <div className="relative mt-4 font-serif text-lg uppercase tracking-[0.25em] text-[#e8c56a]">Forge your own</div>
      <p className="relative mt-2 text-[11px] leading-snug text-stone-500">A hero nobody has seen yet. Name, build, face and voice.</p>
    </button>
  )
}

function Confirm({ hero, onBack, onReserved, onTaken }: { hero: Hero; onBack: () => void; onReserved: (c: Claim) => void; onTaken: () => void }) {
  const [playerName, setPlayerName] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const go = async () => {
    if (!playerName.trim()) { setErr("Tell us your name first."); return }
    setBusy(true); setErr(null)
    try {
      const r = await fetch("/api/forge/claim-canon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: hero.slug, playerName }) })
      const j = await r.json()
      if (r.status === 409) { window.alert(j.error); onTaken(); return }
      if (!r.ok || !j.ok) { setErr(j.error ?? "The door did not answer."); return }
      onReserved({ code: j.code, slug: hero.slug, heroName: j.heroName ?? hero.name })
    } catch { setErr("Could not reach the door.") } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onBack}>
      <div className="choose-in relative grid w-full max-w-3xl overflow-hidden rounded-[3px] border border-[#8a6a3a]/80 bg-[#0d0a07] shadow-[0_0_80px_rgba(201,168,104,0.2)] sm:grid-cols-[2fr_3fr]" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero.portrait} alt="" className="h-56 w-full object-cover object-top sm:h-full" />
        <div className="p-6 sm:p-8">
          <div className="text-[10px] uppercase tracking-[0.35em] text-[#8a6a3a]">{hero.clazz}{hero.origin ? ` · ${hero.origin}` : ""}</div>
          <h2 className="mt-2 font-serif text-2xl text-[#f0dba8]">Walk as {hero.name}?</h2>
          <p className="mt-3 text-[15px] italic leading-relaxed text-stone-400">{hero.hook}</p>
          <div className="mt-5 text-[10px] uppercase tracking-[0.3em] text-stone-600">What they can do</div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {hero.powers.map((p) => <li key={p} className="rounded-sm border border-[#3d3428] bg-black/50 px-2.5 py-1 text-[12px] text-[#d9bd7e]">{p}</li>)}
          </ul>
          <label className="mt-6 block text-[10px] uppercase tracking-[0.3em] text-stone-500" htmlFor="player-name">Your name (the player)</label>
          <input
            id="player-name"
            autoFocus
            value={playerName}
            maxLength={40}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") go() }}
            className="mt-2 w-full rounded-sm border border-[#3d3428] bg-black/70 px-3 py-2 font-serif text-lg text-[#f0dba8] outline-none focus:border-[#c9a868]"
          />
          {err && <p className="mt-2 text-[12px] text-red-400/90">{err}</p>}
          <div className="mt-6 flex items-center justify-between gap-3">
            <button type="button" onClick={onBack} className="text-[11px] uppercase tracking-[0.25em] text-stone-500 hover:text-stone-300">Back</button>
            <button type="button" disabled={busy} onClick={go} className="rounded-sm border border-[#c9a868]/80 bg-gradient-to-b from-[#2a2015] to-black px-6 py-3 font-serif text-[14px] uppercase tracking-[0.3em] text-[#e8c56a] shadow-[0_0_30px_rgba(201,168,104,0.25)] transition-all hover:text-[#fff3cf] hover:shadow-[0_0_60px_rgba(232,197,106,0.45)] disabled:opacity-50">
              {busy ? "…" : `Become ${hero.name.split(" ")[0]}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The hero's intro film, full screen. Starts muted (browsers insist); one tap brings the sound up. */
function HeroFilm({ src, onDone }: { src: string; onDone: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const [muted, setMuted] = useState(true)
  useEffect(() => { ref.current?.play().catch(() => { /* waits for a tap */ }) }, [])
  const unmute = () => { const v = ref.current; if (!v) return; v.muted = false; setMuted(false); v.play().catch(() => {}) }
  return (
    <div className="fixed inset-0 z-40 bg-black">
      <video ref={ref} src={src} muted={muted} playsInline autoPlay onEnded={onDone} onClick={() => (muted ? unmute() : onDone())} className="absolute inset-0 h-full w-full object-cover" />
      {muted && (
        <button type="button" onClick={unmute} className="fixed left-1/2 top-6 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#8a6a3a]/60 bg-black/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] text-[#c9a868] backdrop-blur-sm">
          ♪ Tap anywhere for sound
        </button>
      )}
      <button type="button" onClick={onDone} className="absolute bottom-6 right-8 z-50 rounded-sm border border-[#8a6a3a]/50 bg-black/50 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-stone-400 backdrop-blur-sm transition-colors hover:border-[#c9a868] hover:text-[#e8c56a]">
        Skip ▸
      </button>
    </div>
  )
}

function Waiting({ claim, onCancel, router }: { claim: Claim; onCancel: () => void; router: ReturnType<typeof useRouter> }) {
  const [status, setStatus] = useState<"pending" | "activated" | "rejected" | "unknown">("pending")
  const [copied, setCopied] = useState(false)
  const [entering, setEntering] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const tick = async () => {
      try {
        const r = await fetch(`/api/forge/submit?code=${encodeURIComponent(claim.code)}`, { cache: "no-store" })
        const j = await r.json()
        if (!live) return
        if (j.ok) setStatus(j.status)
        else if (j.reason === "unknown") setStatus("unknown")
      } catch { /* next tick */ }
    }
    tick()
    const t = window.setInterval(tick, 5000)
    return () => { live = false; window.clearInterval(t) }
  }, [claim.code])

  const enter = async () => {
    setEntering(true); setErr(null)
    try {
      const r = await fetch("/api/claim-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: claim.code }) })
      const j = await r.json()
      if (!r.ok || !j.ok || j.role !== "player") { setErr("The door did not open yet. Try again in a moment."); return }
      window.localStorage.setItem(ROLE_LS_KEY, "player")
      window.localStorage.setItem(CHARACTER_LS_KEY, j.character.id)
      window.localStorage.setItem(TOKEN_LS_KEY, j.claimToken)
      writeClaim(null)
      router.replace("/awaken")
    } catch { setErr("Could not reach the door.") } finally { setEntering(false) }
  }

  const words = claim.code.split("-")
  return (
    <div className="mx-auto max-w-2xl rounded-[3px] border border-[#3d3428] bg-black/70 px-6 py-10 text-center backdrop-blur-sm sm:px-10">
      <div className="text-[10px] uppercase tracking-[0.45em] text-[#8a6a3a]">Malachar</div>
      <p className="mx-auto mt-3 max-w-lg font-serif text-lg italic leading-relaxed text-[#b98cf0] [text-shadow:0_0_18px_rgba(123,47,214,0.45)]">
        “{claim.heroName}. I remember that one. Sit. Wait. I'll decide whether you're worth waking.”
      </p>

      <div className="mx-auto mt-8 max-w-md">
        <div className="text-[11px] uppercase tracking-[0.3em] text-stone-500">Your words</div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {words.map((w, i) => (
            <span key={i} className="rounded-sm border border-[#7a5f33]/70 bg-black/60 px-4 py-2 font-serif text-xl tracking-[0.12em] text-[#f0dba8]">{w}</span>
          ))}
        </div>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(claim.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }) }} className="mt-3 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.25em] text-stone-500 hover:text-[#c9a868]">
          <ClipboardCopy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
        </button>
        <p className="mt-3 text-[12px] leading-relaxed text-stone-500">Write these down. They are how you come back as {claim.heroName} — from this device or any other. Don't share them.</p>
      </div>

      <div className="mt-8">
        {status === "pending" && <Pill tone="wait">Waiting for the Dungeon Master</Pill>}
        {status === "activated" && <Pill tone="open">Your cell is open</Pill>}
        {status === "rejected" && <Pill tone="shut">The Dungeon Master turned this claim away</Pill>}
        {status === "unknown" && <Pill tone="shut">The door has no record of these words</Pill>}
      </div>

      {status === "activated" && (
        <button type="button" onClick={enter} disabled={entering} className="mt-6 rounded-sm border-2 border-[#8a6a3a] bg-gradient-to-b from-[#2a2015]/90 via-black/80 to-[#2a2015]/90 px-14 py-4 font-serif text-2xl uppercase tracking-[0.4em] text-[#e8c56a] shadow-[0_0_40px_rgba(201,168,104,0.35)] transition-all hover:border-[#f4e0a8] hover:text-[#fff3cf] hover:shadow-[0_0_80px_rgba(232,197,106,0.6)] disabled:opacity-50">
          {entering ? "…" : "Enter"}
        </button>
      )}
      {status === "pending" && <p className="mt-4 text-[12px] text-stone-600">This page keeps watch. You can close it and come back through <span className="text-stone-400">Play Saved Game</span> with your words.</p>}
      {err && <p className="mt-3 text-[12px] text-red-400/90">{err}</p>}

      {(status === "rejected" || status === "unknown") && (
        <div className="mt-10 border-t border-[#2a241e] pt-4">
          <button type="button" onClick={onCancel} className="text-[11px] uppercase tracking-[0.25em] text-stone-600 hover:text-stone-400">Choose again</button>
        </div>
      )}
    </div>
  )
}

function Pill({ tone, children }: { tone: "wait" | "open" | "shut"; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.3em]",
      tone === "wait" && "border-[#7a3a2a]/70 bg-[#2a1410]/70 text-[#e0a090]",
      tone === "open" && "border-emerald-500/60 bg-[#10201a]/80 text-emerald-200 shadow-[0_0_24px_rgba(52,211,153,0.25)]",
      tone === "shut" && "border-[#3d3428] bg-black/60 text-stone-500")}>
      <span className={cn("h-2 w-2 rounded-full", tone === "wait" && "animate-pulse bg-[#e0705a]", tone === "open" && "bg-emerald-400", tone === "shut" && "bg-stone-600")} />
      {children}
    </span>
  )
}
