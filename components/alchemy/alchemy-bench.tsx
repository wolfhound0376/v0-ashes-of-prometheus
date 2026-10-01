"use client"

// The alchemy bench — the screen a player brews at.
//
// Everything a rule decides is decided by a route; this only draws and rolls:
//   GET  /api/alchemy/pack   what is on this character's bench, masked
//   POST /api/alchemy/taste  Eat It And See (CON save)
//   POST /api/alchemy/brew   the brew (INT check, natural 1 = the film)
//   GET/POST /api/alchemy/drink  preview the dose, then drink it
//
// THE DICE are the board's (useDice), and the route takes the total and the
// face. Nothing here rolls on its own and nothing here re-rolls.
//
// THE ART is the approved set in lib/alchemy-art.ts. The 22 effect colours
// are CSS painted over the approved flask, never a generated image.
//
// THE CRITICAL-FAILURE FILM is cued from here, client-side, off the brew
// response. The brew route also writes `[CINEMATIC: …]` into the dialogue
// feed, but nothing parses that tag out of `dialogue` — only Malachar's own
// output is parsed — so without this the film could never play.

import { useCallback, useEffect, useMemo, useState } from "react"
import { FlaskConical, X } from "lucide-react"
import { useDice, parseDamage } from "@/components/dice/dice-provider"
import { emitCinematicCue } from "@/lib/cinematic-cue"
import {
  BENCH_CLIPS, BENCH_SCENE, VESSEL, bandsOf, cutout, flaskFor, glowRadiusPx, lookOf, preparedArt, type BenchClip,
} from "@/lib/alchemy-art"
import { cn } from "@/lib/utils"
import { BenchSigil, type SigilPhase } from "@/components/alchemy/bench-sigil"
import type { MagicSchool } from "@/lib/spell-school"

type Effect = { slug: string; name: string; category: string; summary: string; is_harmful: boolean }
type Ingredient = {
  slug: string; name: string; icon: string | null; quantity: number
  /** Only `prepared` goes into a brew (extraction, Sam 2026-10-01). */
  raw: number; prepared: number; bruised: number
  method: "grind" | "cut" | "press" | "decant" | null; tool: string | null
  columns: (string | null)[]
}
type Flask = { id: string; name: string; potency: number; impurity: number; effects: string[] }
type Pack = {
  character: { id: string; name: string }
  campActions: number
  ingredients: Ingredient[]
  flasks: Flask[]
  bases: { water: boolean; holyWater: number; blessedWater: number }
  cleric: null | {
    vials: number; silver: number; campActions: number
    bless: { ok: boolean; reason?: string }
    holyWater: { ok: boolean; reason?: string }
    purify: { ok: boolean; reason?: string }
  }
  effects: Effect[]
  drinks: Array<{ id: string; name: string; slug: string; icon: string | null; quantity: number; class: string; dc: number; steps: number; maxLevel: number | null }>
  makeable: Array<{ slug: string; name: string; icon: string | null; class: string; madeFrom: string[]; ok: boolean; reason: string | null }>
  inebriation: { level: number; name: string; effect: string | null; hungover?: boolean; since?: string }
  recipes: Array<{ slug: string; name: string; ingredients: string[]; claims: string | null; ready: boolean }>
  runes: { materials: number; marks: Array<{ school: string; learnedVia: string; ok: boolean; reason: string | null }> }
  rolls: {
    brew: { ability: string; modifier: number; proficient: boolean; dc: number }
    extract: { ability: string; modifier: number; proficient: boolean; dc: number }
    taste: { ability: string; modifier: number; dc: number }
  }
}
type Stage =
  | { kind: "idle" }
  | { kind: "rolling"; clip: BenchClip }
  | { kind: "purified"; effects: string[]; potency: number; summary: string }
  | { kind: "potion"; effects: string[]; potency: number; impurity: number; label: string; summary: string }
  | { kind: "inert"; summary: string }
  | { kind: "critical"; summary: string }
  | { kind: "note"; summary: string }

const ROMAN = ["", "I", "II", "III"]
const IMPURITY = ["clean", "residue", "taint", "corruption"]
const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
const VERB: Record<string, string> = { grind: "Grind", cut: "Cut", press: "Press", decant: "Decant" }
const DONE: Record<string, string> = { grind: "ground", cut: "cut", press: "pressed", decant: "decanted" }

export function AlchemyBench({ characterId, onClose }: { characterId: string; onClose: () => void }) {
  const { roll } = useDice()
  const [pack, setPack] = useState<Pack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [base, setBase] = useState<"water" | "blessed-water" | "holy-water">("water")
  const [rune, setRune] = useState<string>("")
  // Raw ingredients picked for one preparing sitting (up to three, one camp action).
  const [prepPick, setPrepPick] = useState<string[]>([])
  // The rune sealing the current brew, shown on the vessel (board school art).
  const [sigil, setSigil] = useState<{ school: MagicSchool; phase: SigilPhase; key: number } | null>(null)
  // The recipe being followed. Picking ingredients by hand stops following it.
  const [recipe, setRecipe] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<Stage>({ kind: "idle" })
  // An outcome clip plays ONCE, then the still takes over (the tinted flask,
  // the sludge). Only the mixing clip loops, for as long as the dice tumble.
  const [clipEnded, setClipEnded] = useState(false)
  useEffect(() => setClipEnded(false), [stage])

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/alchemy/pack?characterId=${encodeURIComponent(characterId)}`, { cache: "no-store" })
      const body = await r.json()
      if (!r.ok) throw new Error(body?.error ?? "The bench could not be read.")
      const next = body as Pack
      setPack(next)
      // A consecrated base that has run out falls back to water, so the next
      // brew does not roll a d20 only to be refused for a missing base.
      setBase((b) =>
        (b === "blessed-water" && !next.bases.blessedWater) || (b === "holy-water" && !next.bases.holyWater) ? "water" : b,
      )
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The bench could not be read.")
    }
  }, [characterId])

  useEffect(() => { void load() }, [load])

  // Escape closes, as every other overlay on the board does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])

  const effectName = useMemo(() => {
    const m = new Map((pack?.effects ?? []).map((e) => [e.slug, e.name]))
    return (slug: string) => m.get(slug) ?? slug
  }, [pack])

  const toggle = (slug: string) => {
    setRecipe(null)
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : p.length >= 3 ? p : [...p, slug]))
  }

  async function taste(item: Ingredient) {
    if (!pack || busy) return
    setBusy(true)
    try {
      const r = await roll({ die: "d20", numDice: 1, modifier: pack.rolls.taste.modifier, label: `Taste ${item.name} (CON save)` })
      const res = await fetch("/api/alchemy/taste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, itemSlug: item.slug, save: r.total }),
      })
      const body = await res.json()
      setStage({ kind: "note", summary: res.ok ? body.summary : body.error ?? "The taste did not land." })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function prepareSitting() {
    if (!pack || busy || prepPick.length === 0) return
    const items = pack.ingredients.filter((i) => prepPick.includes(i.slug) && i.method)
    setBusy(true)
    try {
      const entries: Array<{ itemSlug: string; check: number; die: number }> = []
      for (const item of items) {
        const r = await roll({
          die: "d20", numDice: 1, modifier: pack.rolls.extract.modifier,
          label: `${VERB[item.method!]} ${item.name} (INT${pack.rolls.extract.proficient ? " + tools" : ""})`,
        })
        entries.push({ itemSlug: item.slug, check: r.total, die: r.keptRolls?.[0] ?? r.rolls[0] })
      }
      const res = await fetch("/api/alchemy/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, items: entries }),
      })
      const body = await res.json()
      const learned = (body.results ?? []).filter((r: { learned?: { name: string } }) => r.learned).map((r: { learned: { name: string } }) => r.learned.name)
      setStage({
        kind: "note",
        summary: res.ok
          ? `${body.summary}${learned.length ? ` You learn: ${learned.join(", ")}.` : ""} (${body.campAction})`
          : body.error ?? "The bench would not take it.",
      })
      setPrepPick([])
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function consecrate(kind: "blessed-water" | "holy-water") {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/alchemy/consecrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, kind }),
      })
      const body = await res.json()
      setStage({ kind: "note", summary: res.ok ? body.summary : body.error ?? "The rite did not take." })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function purify(flask: Flask) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/alchemy/purify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, inventoryItemId: flask.id }),
      })
      const body = await res.json()
      setStage(res.ok
        ? { kind: "purified", effects: flask.effects, potency: body.after.potency, summary: body.summary }
        : { kind: "note", summary: body.error ?? "The ritual would not hold." })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function quaff(d: Pack["drinks"][number]) {
    if (!pack || busy) return
    setBusy(true)
    try {
      const r = await roll({ die: "d20", numDice: 1, modifier: pack.rolls.taste.modifier, label: `CON save vs DC ${d.dc} (${d.name})` })
      const res = await fetch("/api/alchemy/quaff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, inventoryItemId: d.id, save: r.total }),
      })
      const body = await res.json()
      setStage({ kind: "note", summary: res.ok ? `${d.name}: ${body.summary}` : body.error ?? "It would not go down." })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function makeDrink(slug: string) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/alchemy/make-drink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, drinkSlug: slug }),
      })
      const body = await res.json()
      setStage({ kind: "note", summary: res.ok ? body.summary : body.error ?? "It would not come together." })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function brew() {
    if (!pack || busy || picked.length < 2) return
    setBusy(true)
    setStage({ kind: "rolling", clip: "mixing" })
    if (rune) setSigil((s) => ({ school: rune as MagicSchool, phase: "charge", key: (s?.key ?? 0) + 1 }))
    try {
      const r = await roll({
        die: "d20", numDice: 1, modifier: pack.rolls.brew.modifier,
        label: `Brewing check (INT${pack.rolls.brew.proficient ? " + tools" : ""})`,
      })
      const face = r.keptRolls?.[0] ?? r.rolls[0]
      const res = await fetch("/api/alchemy/brew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, itemSlugs: picked, check: r.total, die: face, base, ...(rune ? { rune } : {}), ...(recipe ? { recipeSlug: recipe } : {}) }),
      })
      const body = await res.json()
      if (!res.ok) {
        setStage({ kind: "note", summary: body.error ?? "The bench refused that brew." })
      } else if (body.outcome === "critical_failure") {
        setSigil((s) => (s ? { ...s, phase: "shatter" } : s))
        setStage({ kind: "critical", summary: body.summary })
        if (body.critical?.cue) emitCinematicCue(body.critical.cue)
      } else if (body.outcome === "inert") {
        setSigil((s) => (s ? { ...s, phase: "release" } : s))
        setStage({ kind: "inert", summary: body.summary })
      } else {
        setSigil((s) => (s ? { ...s, phase: "release" } : s))
        setStage({
          kind: "potion",
          effects: (body.effects ?? []).map((e: { slug: string }) => e.slug),
          potency: body.potency, impurity: body.impurity, label: body.label, summary: body.summary,
        })
      }
      setPicked([])
      setRune("")
      setRecipe(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function drink(flask: Flask) {
    if (busy) return
    setBusy(true)
    try {
      const pre = await fetch(`/api/alchemy/drink?characterId=${encodeURIComponent(characterId)}&inventoryItemId=${encodeURIComponent(flask.id)}`, { cache: "no-store" })
      const plan = await pre.json()
      if (!pre.ok) { setStage({ kind: "note", summary: plan.error ?? "That flask will not open." }); return }
      const totals: { heal?: number; harm?: number; save?: number } = {}
      if (plan.roll?.heal) {
        const spec = parseDamage(plan.roll.heal, "Healing")
        if (spec) totals.heal = (await roll(spec)).total
      }
      if (plan.roll?.harm?.dice) {
        const spec = parseDamage(plan.roll.harm.dice, `${plan.roll.harm.type} damage`)
        if (spec) totals.harm = (await roll(spec)).total
      }
      if (plan.roll?.save) {
        totals.save = (await roll({ die: "d20", numDice: 1, modifier: pack?.rolls.taste.modifier ?? 0, label: `CON save vs DC ${plan.roll.save.dc}` })).total
      }
      const res = await fetch("/api/alchemy/drink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, inventoryItemId: flask.id, ...totals }),
      })
      const body = await res.json()
      setStage({ kind: "note", summary: res.ok ? body.summary : body.error ?? "It would not go down." })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const clip: BenchClip | null =
    stage.kind === "rolling" ? stage.clip
      : stage.kind === "inert" ? "inert"
      : stage.kind === "potion" ? "success"
      : stage.kind === "purified" ? "purify"
      : null
  const clipUrl = clip ? BENCH_CLIPS[clip] ?? null : null

  return (
    <div role="dialog" aria-modal="true" aria-label="Alchemy bench" className="fixed inset-0 z-[60] flex flex-col bg-[#070605] text-stone-200">
      <style>{BENCH_CSS}</style>

      {/* The bench itself: painted plate, the idle film over it when there is one. */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <img src={stage.kind === "critical" ? BENCH_SCENE.aftermath : BENCH_SCENE.plate} alt="" className="h-full w-full object-cover opacity-70" />
        {BENCH_CLIPS.idle && stage.kind !== "critical" && (
          <video src={BENCH_CLIPS.idle} autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover opacity-70" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#070605] via-[#070605]/60 to-transparent" />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-3 border-b border-[#7a5f33]/60 bg-[#0d0b08]/80 px-4 py-2">
        <h2 className="flex min-w-0 items-center gap-2 font-serif text-sm uppercase tracking-[0.2em] text-[#e2c98e]">
          <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="shrink-0">Alchemy bench</span>
          {pack && <span className="truncate font-sans text-xs normal-case tracking-normal text-stone-400">{pack.character.name}</span>}
        </h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Leave the bench" className="rounded-sm p-1 text-stone-400 hover:text-[#e2c98e] disabled:opacity-40">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:flex-row">
        {/* The vessel / result */}
        <section aria-live="polite" className="flex flex-col items-center gap-3 lg:w-[38%]">
          <div className="relative grid aspect-square w-full max-w-[260px] place-items-center sm:max-w-[340px] rounded-sm border border-[#7a5f33]/50 bg-[#0d0b08]/70">
            {clipUrl && stage.kind !== "idle" && !clipEnded ? (
              <video
                key={clip}
                src={clipUrl}
                autoPlay
                muted
                playsInline
                loop={clip === "mixing"}
                onEnded={() => setClipEnded(true)}
                onError={() => setClipEnded(true)}
                className="h-full w-full object-contain"
              />
            ) : stage.kind === "potion" ? (
              <TintedFlask effects={stage.effects} potency={stage.potency} impurity={stage.impurity} className="h-[85%]" />
            ) : stage.kind === "purified" ? (
              <TintedFlask effects={stage.effects} potency={stage.potency} impurity={0} className="h-[85%]" />
            ) : (
              <img
                src={stage.kind === "inert" ? VESSEL.inert : picked.length ? VESSEL.full : VESSEL.empty}
                alt={stage.kind === "inert" ? "Grey sludge in the vessel" : picked.length ? "The vessel with ingredients in" : "The empty mixing vessel"}
                className="h-[85%] object-contain"
              />
            )}
            {sigil && <BenchSigil key={sigil.key} school={sigil.school} phase={sigil.phase} />}
            {picked.length > 0 && stage.kind !== "potion" && (
              <div className="absolute bottom-2 left-2 right-2 flex justify-center gap-1">
                {picked.map((s) => (
                  <img key={s} src={cutout(s)} alt="" className="h-10 w-10 rounded-full border border-[#7a5f33] bg-black/60 object-contain" />
                ))}
              </div>
            )}
          </div>

          {stage.kind === "purified" && (
            <p className="text-center font-serif text-[#e2c98e]">Purified<span className="block text-xs text-stone-400">Potency {ROMAN[stage.potency]} · clean</span></p>
          )}
          {stage.kind === "potion" && (
            <p className="text-center font-serif text-[#e2c98e]">
              {stage.label}
              <span className="block text-xs text-stone-400">Potency {ROMAN[stage.potency]} · {IMPURITY[stage.impurity]}</span>
            </p>
          )}
          {stage.kind !== "idle" && stage.kind !== "rolling" && (
            <p className={cn("max-w-prose text-center text-sm", stage.kind === "critical" ? "text-[#f0875f]" : "text-stone-300")}>{stage.summary}</p>
          )}

          {pack && (
            <div className="flex w-full max-w-[340px] flex-col gap-2">
              <fieldset className="flex flex-wrap gap-2 text-sm">
                <legend className="mb-1 text-xs uppercase tracking-wider text-[#c9a868]">Base</legend>
                <label className="flex items-center gap-1"><input type="radio" name="base" checked={base === "water"} onChange={() => setBase("water")} /> Water</label>
                <label className={cn("flex items-center gap-1", !pack.bases.blessedWater && "opacity-40")}>
                  <input type="radio" name="base" disabled={!pack.bases.blessedWater} checked={base === "blessed-water"} onChange={() => setBase("blessed-water")} />
                  Blessed water ({pack.bases.blessedWater})
                </label>
                <label className={cn("flex items-center gap-1", !pack.bases.holyWater && "opacity-40")}>
                  <input type="radio" name="base" disabled={!pack.bases.holyWater} checked={base === "holy-water"} onChange={() => setBase("holy-water")} />
                  Holy water ({pack.bases.holyWater})
                </label>
              </fieldset>
              <button
                type="button"
                onClick={() => void brew()}
                disabled={busy || picked.length < 2 || pack.campActions < 1}
                className="rounded-sm border border-[#c9a868] bg-[#2a1f10] px-3 py-2 font-serif text-sm text-[#f1dca8] hover:bg-[#3a2b15] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pack.campActions < 1
                  ? "No camp action left this rest"
                  : picked.length < 2
                  ? "Choose 2 or 3 prepared ingredients"
                  : `Brew — INT ${sign(pack.rolls.brew.modifier)} vs DC ${pack.rolls.brew.dc}`}
              </button>
              {(base !== "water") && <p className="text-xs text-[#e2c98e]">A consecrated base: impurity can't rise above 1.</p>}
              {pack.runes.marks.length > 0 && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs uppercase tracking-wider text-[#c9a868]">Seal with a rune <span className="normal-case tracking-normal text-stone-500">({pack.runes.materials} rune materials)</span></span>
                  <select value={rune} onChange={(e) => setRune(e.target.value)} disabled={busy}
                    className="rounded-sm border border-[#7a5f33] bg-[#0d0b08] px-2 py-1 text-sm text-[#f1dca8]">
                    <option value="">No rune</option>
                    {pack.runes.marks.map((m) => (
                      <option key={m.school} value={m.school} disabled={!m.ok}>
                        {m.school[0].toUpperCase() + m.school.slice(1)}{m.ok ? "" : " — can't tonight"}
                      </option>
                    ))}
                  </select>
                  {pack.runes.marks.filter((m) => !m.ok).slice(0, 1).map((m) => <span key={m.school} className="text-[11px] text-stone-500">{m.reason}</span>)}
                </label>
              )}
              {pack.cleric && (
                <div className="flex flex-col gap-1 rounded-sm border border-[#7a5f33]/50 bg-[#0d0b08]/80 p-2">
                  <p className="text-xs uppercase tracking-wider text-[#c9a868]">Clerical help <span className="normal-case tracking-normal text-stone-500">· each rite is your camp action ({pack.cleric.campActions} left)</span></p>
                  <button type="button" onClick={() => void consecrate("blessed-water")} disabled={busy || !pack.cleric.bless.ok} title={pack.cleric.bless.reason}
                    className="rounded-sm border border-[#7a5f33] px-2 py-1 text-xs text-[#f1dca8] hover:bg-[#2a1f10] disabled:opacity-40">
                    Bless a vial of water <span className="text-stone-400">({pack.cleric.vials} vials)</span>
                  </button>
                  <button type="button" onClick={() => void consecrate("holy-water")} disabled={busy || !pack.cleric.holyWater.ok} title={pack.cleric.holyWater.reason}
                    className="rounded-sm border border-[#7a5f33] px-2 py-1 text-xs text-[#f1dca8] hover:bg-[#2a1f10] disabled:opacity-40">
                    Make holy water <span className="text-stone-400">(25 gp silver · 1st-level slot)</span>
                  </button>
                  {!pack.cleric.holyWater.ok && pack.cleric.holyWater.reason && <p className="text-[11px] text-stone-500">{pack.cleric.holyWater.reason}</p>}
                  {!pack.cleric.bless.ok && pack.cleric.bless.reason && <p className="text-[11px] text-stone-500">{pack.cleric.bless.reason}</p>}
                </div>
              )}
              {!pack.rolls.brew.proficient && (
                <p className="text-xs text-stone-400">No alchemist's supplies or herbalism kit on your sheet: every brew starts one step dirtier.</p>
              )}
            </div>
          )}
        </section>

        {/* The pack */}
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          {error && <p className="text-sm text-[#f0875f]">{error}</p>}
          {!pack && !error && <p className="text-sm text-stone-400">Laying out your pack…</p>}

          {pack && (
            <>
              <div>
                <h3 className="mb-2 flex flex-wrap items-baseline gap-2 text-xs uppercase tracking-[0.2em] text-[#c9a868]">
                  Ingredients
                  <span className="normal-case tracking-normal text-stone-500">camp actions left: {pack.campActions} · a preparing sitting or a brew costs one</span>
                </h3>
                {prepPick.length > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-sm border border-[#c9a868]/60 bg-[#1a140b] p-2 text-xs">
                    <span className="text-[#f1dca8]">Prepare {prepPick.length} in one sitting (up to 3) — INT {sign(pack.rolls.extract.modifier)} vs DC {pack.rolls.extract.dc} each</span>
                    <button type="button" onClick={() => void prepareSitting()} disabled={busy || pack.campActions < 1}
                      className="ml-auto rounded-sm border border-[#c9a868] bg-[#2a1f10] px-3 py-1 text-[#f1dca8] hover:bg-[#3a2b15] disabled:opacity-40">
                      {pack.campActions < 1 ? "No camp action left" : "Prepare (1 camp action)"}
                    </button>
                  </div>
                )}
                {pack.ingredients.length === 0 && <p className="text-sm text-stone-400">Nothing in your pack will go into a brew. Forage first.</p>}
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                  {pack.ingredients.map((i) => {
                    const on = picked.includes(i.slug)
                    const ready = i.prepared > 0
                    return (
                      <li key={i.slug} className={cn("flex flex-col gap-1 rounded-sm border bg-[#0d0b08]/85 p-2", on ? "border-[#e2c98e]" : "border-[#7a5f33]/50")}>
                        <button
                          type="button"
                          onClick={() => toggle(i.slug)}
                          disabled={busy || !ready}
                          aria-pressed={on}
                          title={ready ? undefined : "Prepare it first"}
                          className="flex flex-col items-center gap-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <img src={(i.raw === 0 && preparedArt(i.slug)) || cutout(i.slug)} onError={(e) => { if (i.icon) (e.currentTarget as HTMLImageElement).src = i.icon }} alt="" className="h-16 w-16 object-contain" />
                          <span className="text-sm text-[#f1dca8]">{i.name}</span>
                          <span className="text-[11px] text-stone-400">
                            {i.raw > 0 && <>raw ×{i.raw}</>}
                            {i.raw > 0 && i.prepared > 0 && " · "}
                            {i.prepared > 0 && <>{i.method ? DONE[i.method] : "ready"} ×{i.prepared}</>}
                            {i.bruised > 0 && <span className="text-[#d9a066]"> ({i.bruised} bruised)</span>}
                          </span>
                        </button>
                        <ul className="flex flex-col gap-0.5" aria-label={`What you know about ${i.name}`}>
                          {i.columns.map((c, n) => (
                            <li key={n} className="flex items-center gap-1 text-[11px]">
                              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full border border-stone-600" style={c ? { background: lookOf(c).liquid } : undefined} />
                              <span className={c ? "text-stone-300" : "text-stone-600"}>{c ? effectName(c) : "?"}</span>
                            </li>
                          ))}
                        </ul>
                        {i.raw > 0 && i.method && (
                          <button
                            type="button"
                            aria-pressed={prepPick.includes(i.slug)}
                            onClick={() => setPrepPick((p) => (p.includes(i.slug) ? p.filter((x) => x !== i.slug) : p.length >= 3 ? p : [...p, i.slug]))}
                            disabled={busy}
                            className={cn(
                              "mt-1 rounded-sm border px-2 py-0.5 text-xs disabled:opacity-40",
                              prepPick.includes(i.slug) ? "border-[#e2c98e] bg-[#3a2b15] text-[#f1dca8]" : "border-[#c9a868] text-[#f1dca8] hover:bg-[#2a1f10]",
                            )}
                          >
                            {prepPick.includes(i.slug) ? "✓ " : ""}{VERB[i.method]} it — {i.tool}
                          </button>
                        )}
                        {i.columns[0] === null && (
                          <button type="button" onClick={() => void taste(i)} disabled={busy} className="mt-1 rounded-sm border border-[#7a5f33] px-2 py-0.5 text-xs text-[#c9a868] hover:bg-[#2a1f10] disabled:opacity-40">
                            Taste it (CON {sign(pack.rolls.taste.modifier)} vs DC {pack.rolls.taste.dc})
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>

              {pack.recipes.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs uppercase tracking-[0.2em] text-[#c9a868]">Your recipes</h3>
                  <ul className="flex flex-col gap-2">
                    {pack.recipes.map((r) => (
                      <li key={r.slug} className={cn("flex items-center gap-3 rounded-sm border bg-[#0d0b08]/85 p-2", recipe === r.slug ? "border-[#e2c98e]" : "border-[#7a5f33]/50")}>
                        <img src={cutout("recipe-page")} alt="" className="h-10 w-10 object-contain" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-[#f1dca8]">{r.name}</p>
                          <p className="text-xs text-stone-400">{r.ingredients.join(" + ")}{r.claims ? ` → ${r.claims}` : ""}</p>
                        </div>
                        <button type="button" disabled={busy || !r.ready} title={r.ready ? undefined : "You need every ingredient prepared"}
                          onClick={() => { setPicked(r.ingredients); setRecipe(r.slug) }}
                          className="rounded-sm border border-[#c9a868] px-3 py-1 text-xs text-[#f1dca8] hover:bg-[#2a1f10] disabled:opacity-40">
                          {recipe === r.slug ? "Following" : "Follow"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="mb-2 flex items-baseline gap-2 text-xs uppercase tracking-[0.2em] text-[#c9a868]">
                  Drink
                  <span className={cn("normal-case tracking-normal", pack.inebriation.level ? "text-[#d9a066]" : "text-stone-500")}>
                    {pack.inebriation.level ? `${pack.inebriation.name}: ${pack.inebriation.effect} · wears off an hour at a time` : "sober"}
                    {pack.inebriation.hungover ? " · hungover" : ""}
                  </span>
                </h3>
                {pack.drinks.length > 0 && (
                  <ul className="mb-2 flex flex-col gap-2">
                    {pack.drinks.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 rounded-sm border border-[#7a5f33]/50 bg-[#0d0b08]/85 p-2">
                        <img src={cutout(d.slug)} onError={(e) => { if (d.icon) (e.currentTarget as HTMLImageElement).src = d.icon }} alt="" className="h-12 w-12 object-contain" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-[#f1dca8]">{d.name} <span className="text-stone-500">×{d.quantity}</span></p>
                          <p className="text-xs text-stone-400">{d.class} · CON DC {d.dc} · fail climbs {d.steps}{d.maxLevel ? ` · never past ${["", "Warm", "Drunk", "Soused", "Ruined"][d.maxLevel]}` : ""}</p>
                        </div>
                        <button type="button" onClick={() => void quaff(d)} disabled={busy} className="rounded-sm border border-[#c9a868] px-3 py-1 text-xs text-[#f1dca8] hover:bg-[#2a1f10] disabled:opacity-40">
                          Drink
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <details className="rounded-sm border border-[#7a5f33]/40 bg-[#0d0b08]/70 p-2">
                  <summary className="cursor-pointer text-xs text-[#c9a868]">Make a drink ({pack.makeable.filter((m) => m.ok).length} ready)</summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {pack.makeable.map((m) => (
                      <li key={m.slug} className="flex items-center gap-2 text-xs">
                        <img src={cutout(m.slug)} alt="" className="h-8 w-8 object-contain" />
                        <span className={cn("min-w-0 flex-1", m.ok ? "text-[#f1dca8]" : "text-stone-500")}>
                          {m.name} <span className="text-stone-500">· {m.class}</span>
                          {!m.ok && m.reason && <span className="block text-[11px]">{m.reason}</span>}
                        </span>
                        <button type="button" onClick={() => void makeDrink(m.slug)} disabled={busy || !m.ok} className="rounded-sm border border-[#7a5f33] px-2 py-0.5 text-[#f1dca8] hover:bg-[#2a1f10] disabled:opacity-30">
                          Make
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>

              <div>
                <h3 className="mb-2 text-xs uppercase tracking-[0.2em] text-[#c9a868]">Your flasks</h3>
                {pack.flasks.length === 0 && <p className="text-sm text-stone-400">No brews yet.</p>}
                <ul className="flex flex-col gap-2">
                  {pack.flasks.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-sm border border-[#7a5f33]/50 bg-[#0d0b08]/85 p-2">
                      <TintedFlask effects={f.effects} potency={f.potency} impurity={f.impurity} className="h-14 w-14" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[#f1dca8]">{f.effects.map(effectName).join(" / ") || f.name}</p>
                        <p className="text-xs text-stone-400">Potency {ROMAN[f.potency]} · {IMPURITY[f.impurity]}</p>
                      </div>
                      {pack.cleric && f.impurity > 0 && (
                        <button type="button" onClick={() => void purify(f)} disabled={busy || !pack.cleric.purify.ok} title={pack.cleric.purify.reason ?? "Purify Food and Drink: clean it, one tier weaker"}
                          className="rounded-sm border border-[#7a5f33] px-3 py-1 text-xs text-[#c9a868] hover:bg-[#2a1f10] disabled:opacity-40">
                          Purify
                        </button>
                      )}
                      <button type="button" onClick={() => void drink(f)} disabled={busy} className="rounded-sm border border-[#c9a868] px-3 py-1 text-xs text-[#f1dca8] hover:bg-[#2a1f10] disabled:opacity-40">
                        Drink
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/** The approved brewed-potion flask with its effects painted on in CSS:
 *  one band per effect (never mixed), glow by potency, motion by effect. */
export function TintedFlask({ effects, potency, impurity, className }: { effects: string[]; potency: number; impurity: number; className?: string }) {
  const src = flaskFor(impurity)
  const bands = bandsOf(effects.length ? effects : ["__none"])
  // Liquid sits in the lower part of the flask art (measured off the cut-outs:
  // roughly 45%–92% of the height). Bands stack bottom-up inside that span.
  // Measured from the BOTTOM (gradient runs "to top"): liquid spans 8%–55%.
  const LIQ_LO = 8, LIQ_HI = 55, span = LIQ_HI - LIQ_LO
  const stops = bands.flatMap((b) => [
    `${b.look.liquid} ${LIQ_LO + b.from * span}%`,
    `${b.look.liquid} ${LIQ_LO + b.to * span}%`,
  ])
  const gradient = `linear-gradient(to top, transparent ${LIQ_LO}%, ${stops.join(", ")}, transparent ${LIQ_HI}%)`
  const top = bands[bands.length - 1].look
  const glow = top.glow ?? bands.find((b) => b.look.glow)?.look.glow ?? null
  const mask = `url(${src}) center / contain no-repeat`
  return (
    <span className={cn("relative inline-block aspect-square", className)} style={glow ? { filter: `drop-shadow(0 0 ${glowRadiusPx(potency)}px ${glow})` } : undefined}>
      <img src={src} alt={effects.length ? `A flask: ${effects.join(", ")}` : "A flask"} className="absolute inset-0 h-full w-full object-contain" />
      {/* Two passes over the same bands: "color" carries the hue, "multiply"
          carries the darkness — "color" alone turns rot's brown-black grey. */}
      <span
        aria-hidden="true"
        className={cn("absolute inset-0 aop-liquid", `aop-m-${top.motion}`)}
        style={{ background: gradient, WebkitMask: mask, mask, mixBlendMode: "color" }}
      />
      <span
        aria-hidden="true"
        className={cn("absolute inset-0 aop-liquid", `aop-m-${top.motion}`)}
        style={{ background: gradient, WebkitMask: mask, mask, mixBlendMode: "multiply", opacity: 0.55 }}
      />
    </span>
  )
}

// One animation per kind of motion. Kept small on purpose: the motion is how
// two close hues are told apart, so it only has to be distinct, not elaborate.
const BENCH_CSS = `
.aop-liquid{animation-duration:3s;animation-iteration-count:infinite;animation-timing-function:ease-in-out}
@keyframes aop-pulse{0%,100%{filter:brightness(1)}15%{filter:brightness(1.5)}30%{filter:brightness(1)}45%{filter:brightness(1.35)}}
@keyframes aop-flicker{0%,100%{opacity:1}20%{opacity:.6}22%{opacity:1}55%{opacity:.75}57%{opacity:1}}
@keyframes aop-shift{0%,100%{filter:hue-rotate(0deg)}50%{filter:hue-rotate(40deg)}}
@keyframes aop-chase{to{filter:hue-rotate(360deg)}}
@keyframes aop-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
@keyframes aop-in{0%,100%{transform:scale(1)}50%{transform:scale(.97)}}
@keyframes aop-blur{0%,100%{filter:blur(0)}50%{filter:blur(1.5px)}}
@keyframes aop-jitter{0%,100%{transform:translate(0,0)}25%{transform:translate(.5px,-.5px)}75%{transform:translate(-.5px,.5px)}}
@keyframes aop-crack{0%,80%,100%{filter:contrast(1)}85%{filter:contrast(1.8) brightness(1.3)}}
@keyframes aop-rise{0%,100%{filter:brightness(1)}50%{filter:brightness(1.2) saturate(.8)}}
.aop-m-pulse{animation-name:aop-pulse;animation-duration:1.2s}
.aop-m-flicker,.aop-m-rim,.aop-m-sparks{animation-name:aop-flicker;animation-duration:1.6s}
.aop-m-swirl,.aop-m-orbit{animation-name:aop-shift;animation-duration:5s}
.aop-m-chase{animation-name:aop-chase;animation-duration:4s;animation-timing-function:linear}
.aop-m-swell,.aop-m-outward,.aop-m-ripple{animation-name:aop-breathe}
.aop-m-inward{animation-name:aop-in}
.aop-m-fog,.aop-m-vapour,.aop-m-frost{animation-name:aop-blur;animation-duration:4s}
.aop-m-hiss,.aop-m-churn,.aop-m-flecks{animation-name:aop-jitter;animation-duration:.6s}
.aop-m-crack{animation-name:aop-crack}
.aop-m-rise,.aop-m-sink{animation-name:aop-rise;animation-duration:2s}
@media (prefers-reduced-motion:reduce){.aop-liquid{animation:none!important}}
`
