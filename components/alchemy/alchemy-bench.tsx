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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { FlaskConical, X } from "lucide-react"
import { useDice, parseDamage } from "@/components/dice/dice-provider"
import {
  BENCH_CLIPS, BENCH_SCENE, brewFilms, drinkFilm, type BenchFilm, VESSEL, bandsOf, cutout, flaskFor, glowRadiusPx, lookOf, preparedArt, type BenchClip,
} from "@/lib/alchemy-art"
import { cn } from "@/lib/utils"
import { BenchSigil, type SigilPhase } from "@/components/alchemy/bench-sigil"
import { BenchIntro } from "@/components/alchemy/bench-intro"
import { JournalButton, RecipeJournal, type Schematic } from "@/components/alchemy/recipe-journal"
import { RUNE_RIDER, isRuneSchool } from "@/lib/alchemy-runes"
import { ExtractFocus, type ExtractResult } from "@/components/alchemy/extract-focus"
import type { MagicSchool } from "@/lib/spell-school"

type Effect = { slug: string; name: string; category: string; summary: string; is_harmful: boolean }
export type Ingredient = {
  slug: string; name: string; icon: string | null; quantity: number
  /** Only `prepared` goes into a brew (extraction, Sam 2026-10-01). */
  raw: number; prepared: number; bruised: number
  method: "grind" | "cut" | "press" | "decant" | null; tool: string | null
  columns: (string | null)[]
}
export type Flask = { id: string; name: string; potency: number; impurity: number; effects: string[] }
export type Pack = {
  character: { id: string; name: string; class?: string | null }
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
  makeable: Array<{
    slug: string; name: string; icon: string | null; class: string; madeFrom: string[]; ok: boolean; reason: string | null
    description?: string | null; dc: number; steps: number; needs?: string | null; maker?: string | null
  }>
  inebriation: { level: number; name: string; effect: string | null; hungover?: boolean; since?: string }
  recipes: Array<{ slug: string; name: string; ingredients: string[]; claims: string | null; description?: string | null; ready: boolean }>
  runes: { materials: number; marks: Array<{ school: string; learnedVia: string; ok: boolean; reason: string | null }> }
  rolls: {
    brew: { ability: string; modifier: number; proficient: boolean; dc: number; blindDc?: number }
    extract: { ability: string; modifier: number; proficient: boolean; dc: number }
    taste: { ability: string; modifier: number; dc: number }
  }
}
type Made =
  | {
      kind: "brew"; id: string | null; label: string; potency: number; impurity: number
      effects: Array<{ slug: string; name: string; summary?: string | null; harmful?: boolean }>
      rune: string | null; base: string; recipe: boolean
    }
  | { kind: "drink"; slug: string; name: string; class: string; dc: number; steps: number; description: string | null }

type Stage =
  | { kind: "idle" }
  | { kind: "rolling"; clip: BenchClip }
  | { kind: "purified"; effects: string[]; potency: number; summary: string }
  | { kind: "potion"; effects: string[]; potency: number; impurity: number; label: string; summary: string }
  | { kind: "inert"; summary: string }
  | { kind: "critical"; summary: string }
  | { kind: "note"; summary: string }

type BenchTab = "ingredients" | "reagents" | "drinks" | "potions" | "elixirs"
const TABS: Array<{ id: BenchTab; label: string }> = [
  { id: "ingredients", label: "Ingredients" },
  { id: "reagents", label: "Reagents" },
  { id: "drinks", label: "Fermented drinks" },
  { id: "potions", label: "Potions" },
  { id: "elixirs", label: "Elixirs" },
]
const ROMAN = ["", "I", "II", "III"]
const IMPURITY = ["clean", "residue", "taint", "corruption"]
const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
const VERB: Record<string, string> = { grind: "Grind", cut: "Cut", press: "Press", decant: "Decant" }
const DONE: Record<string, string> = { grind: "ground", cut: "cut", press: "pressed", decant: "decanted" }

export function AlchemyBench({
  characterId, onClose, sandbox, headerExtra,
}: {
  characterId: string
  onClose: () => void
  /** The DM's practice character (lib/alchemy-sandbox.ts): every call carries
   *  the DM key, and the header grows Restock / Refill. */
  sandbox?: { dmKey: string }
  /** Anything the page wants in the header (the DM's sandbox switch). */
  headerExtra?: ReactNode
}) {
  const { roll } = useDice()
  // Every bench call goes through here, so the sandbox's DM key rides along.
  const dmKey = sandbox?.dmKey
  const api = useCallback(
    (url: string, init: RequestInit = {}) =>
      fetch(url, dmKey === undefined ? init : { ...init, headers: { ...(init.headers as Record<string, string> | undefined), "x-dm-key": dmKey } }),
    [dmKey],
  )
  const [pack, setPack] = useState<Pack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [base, setBase] = useState<"water" | "blessed-water" | "holy-water">("water")
  const [rune, setRune] = useState<string>("")
  // Raw ingredients picked for one preparing sitting (up to three, one camp action).
  // The raw ingredient zoomed to the centre to be extracted (Sam, 2026-10-01).
  const [focus, setFocus] = useState<string | null>(null)
  // The rune sealing the current brew, shown on the vessel (board school art).
  const [sigil, setSigil] = useState<{ school: MagicSchool; phase: SigilPhase; key: number } | null>(null)
  // The recipe being followed. Picking ingredients by hand stops following it.
  const [recipe, setRecipe] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The module opens with its film (Sam, 9/29; kept 2026-10-01).
  const [intro, setIntro] = useState(true)
  // The step films waiting to play, in order (lib/alchemy-art BENCH_FILMS):
  // the fire, the rune, the pour, the still, or on a natural 1 the failure.
  // Each plays after its roll and before the result window (Sam, 2026-10-01:
  // "make sure the videos are wired to the result of the alchemy step").
  const [reel, setReel] = useState<Array<BenchFilm & { key: number }>>([])
  const reelKey = useRef(0)
  const playFilms = (films: BenchFilm[]) =>
    setReel((q) => [...q, ...films.map((f) => ({ ...f, key: ++reelKey.current }))])
  const filming = reel.length > 0
  // The pack, in order (Sam, 2026-10-01): ingredients, reagents, fermented
  // drinks, potions, elixirs. One effect is a potion; two or more in the same
  // flask is an elixir (Sam's ruling, same day).
  const [tab, setTab] = useState<BenchTab>("ingredients")
  // The recipe journal, and the schematic open in it (null = the journal's list).
  const [journal, setJournal] = useState(false)
  const [schematic, setSchematic] = useState<Schematic | null>(null)
  // What was just made, shown before it goes in the pack for good (Sam,
  // 2026-10-01: "showing you what you made and its properties, asking you if
  // you want it or toss it"). It is already in the pack; Toss takes it out.
  const [made, setMade] = useState<Made | null>(null)
  const [stage, setStage] = useState<Stage>({ kind: "idle" })
  // An outcome clip plays ONCE, then the still takes over (the tinted flask,
  // the sludge). Only the mixing clip loops, for as long as the dice tumble.
  const [clipEnded, setClipEnded] = useState(false)
  useEffect(() => setClipEnded(false), [stage])
  useEffect(() => {
    // A brew has landed (or failed): close the schematic so the vessel shows it,
    // and open the tab its flask went into.
    if (stage.kind === "potion" || stage.kind === "purified") setTab(stage.effects.length >= 2 ? "elixirs" : "potions")
    if (stage.kind === "potion" || stage.kind === "inert" || stage.kind === "critical") {
      setJournal(false)
      setSchematic(null)
    }
  }, [stage])

  const load = useCallback(async () => {
    try {
      const r = await api(`/api/alchemy/pack?characterId=${encodeURIComponent(characterId)}`, { cache: "no-store" })
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
  }, [characterId, api])

  useEffect(() => { void load() }, [load])

  // Sandbox only: put the practice character back to a full pack, or give it
  // its camp actions again (app/api/alchemy/sandbox).
  const [sbClass, setSbClass] = useState<"Wizard" | "Cleric">("Wizard")
  const [sbKnowAll, setSbKnowAll] = useState(false)
  const [sbNote, setSbNote] = useState<string | null>(null)
  useEffect(() => {
    if (pack?.character.class === "Cleric" || pack?.character.class === "Wizard") setSbClass(pack.character.class)
  }, [pack?.character.class])
  const sandboxDo = useCallback(
    async (action: "restock" | "refill", cls?: "Wizard" | "Cleric") => {
      setBusy(true)
      setSbNote(null)
      try {
        const r = await api("/api/alchemy/sandbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, class: cls ?? sbClass, knowAll: sbKnowAll }),
        })
        const b = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(b?.error ?? "The sandbox could not be reset.")
        if (action === "restock") {
          setPicked([]); setFocus(null); setRecipe(null); setRune(""); setBase("water"); setSigil(null); setStage({ kind: "idle" })
          setSbNote(`Restocked as a ${b.class}: ${b.items} pack rows, every mark and recipe, ${b.campActions} camp actions${b.knownEffects ? ", every effect known" : ""}.`)
        } else {
          setSbNote(`${b.campActions} camp actions again.`)
        }
        await load()
      } catch (e) {
        setSbNote(e instanceof Error ? e.message : "The sandbox could not be reset.")
      } finally {
        setBusy(false)
      }
    },
    [api, load, sbClass, sbKnowAll],
  )

  // Escape closes, as every other overlay on the board does.
  useEffect(() => {
    // While the film plays, Escape skips it (BenchIntro) rather than closing.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy && !intro && !filming && !made && !focus) onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, intro, filming, made, focus, onClose])

  const effectName = useMemo(() => {
    const m = new Map((pack?.effects ?? []).map((e) => [e.slug, e.name]))
    return (slug: string) => m.get(slug) ?? slug
  }, [pack])

  // The filter bar over the reagents and ingredients (Sam, 2026-10-01: "We
  // need a filter option at the top for ingredients"). It only ever filters
  // by what the player can already see: the effect menu lists known effects,
  // never the hidden columns.
  const [q, setQ] = useState("")
  const [show, setShow] = useState<"all" | "raw" | "ready" | "unknown">("all")
  const [hasEffect, setHasEffect] = useState("")
  const knownEffects = useMemo(() => {
    const seen = new Set<string>()
    for (const i of pack?.ingredients ?? []) for (const c of i.columns) if (c) seen.add(c)
    return [...seen].map((slug) => ({ slug, name: effectName(slug) })).sort((a, b) => a.name.localeCompare(b.name))
  }, [pack, effectName])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (pack?.ingredients ?? []).filter(
      (i) =>
        (!needle || i.name.toLowerCase().includes(needle) || i.columns.some((c) => c && effectName(c).toLowerCase().includes(needle))) &&
        (!hasEffect || i.columns.includes(hasEffect)) &&
        (show === "all" ||
          (show === "raw" && i.raw > 0) ||
          (show === "ready" && i.prepared > 0) ||
          (show === "unknown" && i.columns.some((c) => c === null))),
    )
  }, [pack, q, show, hasEffect, effectName])
  // Reagents: what has been prepared and can go in the vessel. Ingredients: what is still raw.
  const reagents = shown.filter((i) => i.prepared > 0)
  const rawOnes = shown.filter((i) => i.raw > 0)
  const filtering = q.trim() !== "" || show !== "all" || hasEffect !== ""
  const flasksIn = (t: BenchTab) => (pack?.flasks ?? []).filter((f) => (t === "elixirs" ? f.effects.length >= 2 : f.effects.length < 2))
  const tabCount = (t: BenchTab) =>
    t === "ingredients" ? (pack?.ingredients ?? []).filter((i) => i.raw > 0).length
      : t === "reagents" ? (pack?.ingredients ?? []).filter((i) => i.prepared > 0).length
      : t === "drinks" ? (pack?.drinks ?? []).length
      : flasksIn(t).length

  // Grab a reagent and drop it in (Sam, 2026-10-01: "grab reagents and place
  // them in the mix not just click on them"). Clicking still works.
  const [vesselOver, setVesselOver] = useState(false)
  const dropInVessel = (slug: string) => {
    if (!slug || busy || !(pack?.ingredients ?? []).some((i) => i.slug === slug && i.prepared > 0)) return
    setRecipe(null)
    setPicked((p) => (p.includes(slug) || p.length >= 3 ? p : [...p, slug]))
  }

  const toggle = (slug: string) => {
    setRecipe(null)
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : p.length >= 3 ? p : [...p, slug]))
  }

  async function taste(item: Ingredient) {
    if (!pack || busy) return
    setBusy(true)
    try {
      const r = await roll({ die: "d20", numDice: 1, modifier: pack.rolls.taste.modifier, label: `Taste ${item.name} (CON save)` })
      const res = await api("/api/alchemy/taste", {
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

  /** One sitting: roll each ingredient on the board's dice, post them
   *  together (one camp action), and return a result per slug, in order. */
  async function extractRun(slugs: string[]): Promise<ExtractResult[]> {
    if (!pack || busy) return []
    const items = slugs.map((s) => pack.ingredients.find((i) => i.slug === s)).filter((i): i is Ingredient => !!i && !!i.method)
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
      const res = await api("/api/alchemy/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, items: entries }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok && !Array.isArray(body.results)) {
        return items.map((i) => ({ slug: i.slug, ok: false as const, error: body.error ?? "The bench would not take it." }))
      }
      const out = ((body.results ?? []) as Array<Record<string, unknown>>).map((r, k): ExtractResult =>
        r.ok
          ? {
              slug: entries[k].itemSlug, ok: true,
              outcome: r.outcome as "prepared" | "bruised" | "ruined",
              preparedName: (r.preparedName as string | null) ?? null,
              learned: ((r.learned as { name?: string } | null)?.name) ?? null,
              summary: String(r.summary ?? ""),
            }
          : { slug: entries[k].itemSlug, ok: false, error: String(r.error ?? "Refused.") },
      )
      await load()
      return out
    } finally {
      setBusy(false)
    }
  }

  async function consecrate(kind: "blessed-water" | "holy-water") {
    if (busy) return
    setBusy(true)
    try {
      const res = await api("/api/alchemy/consecrate", {
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
      const res = await api("/api/alchemy/purify", {
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
      const res = await api("/api/alchemy/quaff", {
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
      const res = await api("/api/alchemy/make-drink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, drinkSlug: slug }),
      })
      const body = await res.json()
      setStage({ kind: "note", summary: res.ok ? body.summary : body.error ?? "It would not come together." })
      if (res.ok) {
        setTab("drinks"); setJournal(false); setSchematic(null)
        if (body.drink) { playFilms([drinkFilm(body.drink.class)]); setMade({ kind: "drink", ...body.drink }) }
      }
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
        label: `Brewing check (INT${pack.rolls.brew.proficient ? " + tools" : ""}) vs DC ${recipe ? pack.rolls.brew.dc : pack.rolls.brew.blindDc ?? 15}`,
      })
      const face = r.keptRolls?.[0] ?? r.rolls[0]
      const res = await api("/api/alchemy/brew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, itemSlugs: picked, check: r.total, die: face, base, ...(rune ? { rune } : {}), ...(recipe ? { recipeSlug: recipe } : {}) }),
      })
      const body = await res.json()
      if (res.ok) playFilms(brewFilms(String(body.outcome), body.rune ?? (rune || null)))
      if (!res.ok) {
        setStage({ kind: "note", summary: body.error ?? "The bench refused that brew." })
      } else if (body.outcome === "critical_failure") {
        setSigil((s) => (s ? { ...s, phase: "shatter" } : s))
        setStage({ kind: "critical", summary: body.summary })
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
        setMade({
          kind: "brew", id: body.productId ?? null, label: body.label, effects: body.effects ?? [],
          potency: body.potency, impurity: body.impurity, rune: body.rune ?? null, base: body.base ?? "water", recipe: Boolean(recipe),
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
      const pre = await api(`/api/alchemy/drink?characterId=${encodeURIComponent(characterId)}&inventoryItemId=${encodeURIComponent(flask.id)}`, { cache: "no-store" })
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
      const res = await api("/api/alchemy/drink", {
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

  async function toss(m: Made) {
    if (busy) return
    setBusy(true)
    try {
      const res = await api("/api/alchemy/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(m.kind === "brew" ? { characterId, inventoryItemId: m.id } : { characterId, drinkSlug: m.slug }),
      })
      const body = await res.json().catch(() => ({}))
      setStage({ kind: "note", summary: res.ok ? `Tossed: ${body.tossed}.` : body.error ?? "It would not pour out." })
      setMade(null)
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
      {intro && <BenchIntro onDone={() => setIntro(false)} />}
      {!intro && filming && (
        <BenchIntro key={reel[0].key} film={reel[0]} label={reel[0].label} onDone={() => setReel((q) => q.slice(1))} />
      )}
      {focus && pack && (() => {
        const ing = pack.ingredients.find((i) => i.slug === focus)
        if (!ing) return null
        return (
          <ExtractFocus
            ingredient={ing}
            others={pack.ingredients.filter((o) => o.slug !== ing.slug && o.raw > 0 && o.method)}
            roll={pack.rolls}
            campActions={pack.campActions}
            busy={busy}
            onExtract={extractRun}
            onTaste={() => { setFocus(null); void taste(ing) }}
            onClose={() => setFocus(null)}
          />
        )
      })()}
      {made && !intro && !filming && <MadeWindow made={made} busy={busy} onKeep={() => setMade(null)} onToss={() => void toss(made)} />}

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
        <div className="flex shrink-0 items-center gap-2">
          {headerExtra}
          <button type="button" onClick={onClose} disabled={busy} aria-label="Leave the bench" className="rounded-sm p-1 text-stone-400 hover:text-[#e2c98e] disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {sandbox && (
        <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#c9563f]/50 bg-[#2a0f0a]/85 px-4 py-2 text-xs text-stone-300">
          <span className="font-serif uppercase tracking-[0.2em] text-[#ff9a7a]">Sandbox</span>
          <span className="text-stone-400">The DM&apos;s practice character. Nothing here reaches the game or its log.</span>
          <label className="flex items-center gap-1.5">
            <span className="text-stone-400">As</span>
            <select
              value={sbClass}
              disabled={busy}
              onChange={(e) => { const c = e.target.value as "Wizard" | "Cleric"; setSbClass(c); void sandboxDo("restock", c) }}
              className="rounded-sm border border-[#7a5f33] bg-[#0d0b08] px-1.5 py-0.5 text-stone-200"
            >
              <option value="Wizard">Wizard (runes)</option>
              <option value="Cleric">Cleric (blessing, holy water, purify)</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={sbKnowAll} disabled={busy} onChange={(e) => setSbKnowAll(e.target.checked)} />
            <span>Know every effect on restock</span>
          </label>
          <button type="button" disabled={busy} onClick={() => void sandboxDo("restock")} className="rounded-sm border border-[#c9563f] px-2.5 py-1 font-serif uppercase tracking-[0.15em] text-[#ff9a7a] hover:bg-[#c9563f]/20 disabled:opacity-40">
            Restock
          </button>
          <button type="button" disabled={busy} onClick={() => void sandboxDo("refill")} className="rounded-sm border border-[#7a5f33] px-2.5 py-1 font-serif uppercase tracking-[0.15em] text-[#e2c98e] hover:bg-[#7a5f33]/20 disabled:opacity-40">
            Refill camp actions
          </button>
          {sbNote && <span className="basis-full text-stone-400">{sbNote}</span>}
        </div>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:flex-row">
        {/* The vessel / result */}
        <section aria-live="polite" className="flex flex-col items-center gap-3 lg:w-[38%]">
          <div
            onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-aop-reagent")) { e.preventDefault(); setVesselOver(true) } }}
            onDragLeave={() => setVesselOver(false)}
            onDrop={(e) => { e.preventDefault(); setVesselOver(false); dropInVessel(e.dataTransfer.getData("application/x-aop-reagent")) }}
            className={cn(
              "relative grid aspect-square w-full max-w-[260px] place-items-center sm:max-w-[340px] rounded-sm border bg-[#0d0b08]/70 transition-shadow",
              vesselOver ? "border-[#e2c98e] shadow-[0_0_24px_rgba(226,201,142,.45)]" : "border-[#7a5f33]/50",
            )}
          >
            {vesselOver && <span className="pointer-events-none absolute top-2 z-10 rounded-sm bg-black/70 px-2 py-0.5 text-xs text-[#f1dca8]">Drop it in</span>}
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
                  <img key={s} src={preparedArt(s) ?? cutout(s)} alt="" className={cn("h-10 w-10 rounded-full border border-[#7a5f33] bg-black/60", preparedArt(s) ? "object-cover" : "object-contain")} />
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
                  : recipe
                  ? `Brew — INT ${sign(pack.rolls.brew.modifier)} vs DC ${pack.rolls.brew.dc}`
                  : `Mix blind — INT ${sign(pack.rolls.brew.modifier)} vs DC ${pack.rolls.brew.blindDc ?? 15}`}
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
              <div className="sticky top-0 z-20 -mx-1 flex flex-col gap-2 bg-[#070605]/90 px-1 pb-2 backdrop-blur">
                <div role="tablist" aria-label="The pack" className="flex flex-wrap items-end gap-1 border-b border-[#7a5f33]/60">
                  {TABS.map((t) => {
                    const on = !journal && tab === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => { setTab(t.id); setJournal(false); setSchematic(null) }}
                        className={cn(
                          "-mb-px rounded-t-sm border px-2 py-1.5 font-serif text-[11px] uppercase tracking-[0.06em]",
                          on ? "border-[#9c7a3a] border-b-[#070605] bg-[#1a140b] text-[#f1dca8]" : "border-transparent text-stone-400 hover:text-[#e2c98e]",
                        )}
                      >
                        {t.label} <span className="text-stone-500">{tabCount(t.id)}</span>
                      </button>
                    )
                  })}
                  <JournalButton onOpen={() => { setJournal(true); setSchematic(null) }} count={pack.recipes.filter((r) => r.ingredients.length >= 2).length + pack.makeable.length} />
                </div>
                  {pack.ingredients.length > 0 && (tab === "ingredients" || tab === "reagents") && (
                <div className="flex flex-wrap items-center gap-2 rounded-sm border border-[#7a5f33]/60 bg-[#0d0b08]/95 px-2 py-2 text-xs backdrop-blur">
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search ingredients or effects…"
                    aria-label="Search ingredients or effects"
                    className="min-w-[160px] flex-1 rounded-sm border border-[#7a5f33] bg-[#070605] px-2 py-1 text-sm text-stone-200 placeholder:text-stone-500"
                  />
                  <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show"
                    className="rounded-sm border border-[#7a5f33] bg-[#070605] px-1.5 py-1 text-stone-200">
                    <option value="all">Everything</option>
                    <option value="raw">Can be prepared</option>
                    <option value="ready">Ready to brew</option>
                    <option value="unknown">Still has unknown effects</option>
                  </select>
                  <select value={hasEffect} onChange={(e) => setHasEffect(e.target.value)} aria-label="Has the effect"
                    className="max-w-[200px] rounded-sm border border-[#7a5f33] bg-[#070605] px-1.5 py-1 text-stone-200">
                    <option value="">Any effect</option>
                    {knownEffects.map((e) => <option key={e.slug} value={e.slug}>{e.name}</option>)}
                  </select>
                  {filtering && (
                    <button type="button" onClick={() => { setQ(""); setShow("all"); setHasEffect("") }}
                      className="rounded-sm border border-[#7a5f33] px-2 py-1 text-[#c9a868] hover:bg-[#2a1f10]">
                      Clear
                    </button>
                  )}
                  <span className="text-stone-500">{shown.length} of {pack.ingredients.length}</span>
                </div>
              )}
              </div>

              {journal ? (
                <RecipeJournal
                  pack={pack} busy={busy} effectName={effectName}
                  open={schematic} onOpen={setSchematic} onClose={() => { setJournal(false); setSchematic(null) }}
                  base={base} setBase={setBase} rune={rune} setRune={setRune}
                  setPicked={setPicked} setRecipe={setRecipe}
                  onBrew={() => void brew()} onMakeDrink={(slug) => void makeDrink(slug)}
                />
              ) : (
                <>
              {/* REAGENTS — what has been prepared, shown as it now looks (Sam: "a
                  window for our reagents made with images"). This is where the
                  vessel is filled from. */}
              {tab === "reagents" && (
                <div className="rounded-sm border border-[#9c7a3a]/70 bg-[#120e08]/90 p-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,.6)]">
                  <h3 className="mb-2 flex flex-wrap items-baseline gap-2 text-xs uppercase tracking-[0.2em] text-[#e2c98e]">
                    Reagents
                    <span className="normal-case tracking-normal text-stone-500">prepared and ready for the vessel · pick 2 or 3</span>
                  </h3>
                  {reagents.length === 0 && (
                    <p className="text-sm text-stone-500">
                      {filtering ? "No reagent matches the filter." : "Nothing prepared yet. Grind, cut or press raw ingredients in the Ingredients tab."}
                    </p>
                  )}
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                    {reagents.map((i) => {
                      const on = picked.includes(i.slug)
                      const art = preparedArt(i.slug)
                      return (
                        <li key={i.slug}>
                          <button
                            type="button"
                            draggable={!busy && !on}
                            onDragStart={(e) => { e.dataTransfer.setData("application/x-aop-reagent", i.slug); e.dataTransfer.effectAllowed = "move" }}
                            onClick={() => toggle(i.slug)}
                            disabled={busy}
                            aria-pressed={on}
                            title={on ? "In the vessel. Click to take it out" : "Drag it into the vessel (or click)"}
                            className={cn(
                              "flex w-full cursor-grab flex-col items-center gap-1 rounded-sm border bg-[#0d0b08]/85 p-2 text-center transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_18px_rgba(226,201,142,.45)] active:cursor-grabbing disabled:opacity-60",
                              on ? "border-[#e2c98e] bg-[#2a1f10]" : "border-[#7a5f33]/50 hover:border-[#c9a868]",
                            )}
                          >
                            <span className="relative grid h-24 w-full place-items-center overflow-hidden rounded-sm bg-black/40">
                              <img
                                src={art ?? cutout(i.slug)}
                                onError={(e) => { const el = e.currentTarget as HTMLImageElement; if (el.src !== cutout(i.slug)) el.src = cutout(i.slug); else if (i.icon) el.src = i.icon }}
                                alt=""
                                className={art ? "h-full w-full object-cover" : "h-20 w-20 object-contain"}
                              />
                              {on && <span className="absolute right-1 top-1 rounded-sm bg-[#e2c98e] px-1 text-[10px] font-bold text-black">IN</span>}
                            </span>
                            <span className="text-sm text-[#f1dca8]">{i.name}</span>
                            <span className="text-[11px] text-stone-400">
                              {i.method ? DONE[i.method] : "ready"} ×{i.prepared}
                              {i.bruised > 0 && <span className="text-[#d9a066]"> ({i.bruised} bruised)</span>}
                            </span>
                            <span className="flex flex-wrap justify-center gap-1" aria-label={`What you know about ${i.name}`}>
                              {i.columns.map((c, n) => (
                                <span key={n} title={c ? effectName(c) : "Unknown"} className="h-2.5 w-2.5 rounded-full border border-stone-600" style={c ? { background: lookOf(c).liquid } : undefined} />
                              ))}
                            </span>
                          </button>
                          {/* Nothing raw left to taste from the Ingredients list: taste a prepared one here. */}
                          {i.raw === 0 && i.columns[0] === null && (
                            <button type="button" onClick={() => void taste(i)} disabled={busy}
                              className="mt-1 w-full rounded-sm border border-[#7a5f33] px-2 py-0.5 text-xs text-[#c9a868] hover:bg-[#2a1f10] disabled:opacity-40">
                              Taste it (CON {sign(pack.rolls.taste.modifier)} vs DC {pack.rolls.taste.dc})
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {tab === "ingredients" && (<div>
                <h3 className="mb-2 flex flex-wrap items-baseline gap-2 text-xs uppercase tracking-[0.2em] text-[#c9a868]">
                  Ingredients
                  <span className="normal-case tracking-normal text-stone-500">raw · camp actions left: {pack.campActions} · a preparing sitting or a brew costs one</span>
                </h3>
                {pack.ingredients.length === 0 && <p className="text-sm text-stone-400">Nothing in your pack will go into a brew. Forage first.</p>}
                {pack.ingredients.length > 0 && rawOnes.length === 0 && (
                  <p className="text-sm text-stone-500">{filtering ? "No raw ingredient matches the filter." : "Everything you carry is prepared."}</p>
                )}
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                  {rawOnes.map((i) => (
                    <li key={i.slug}>
                      {/* Hover glows; click ticks and zooms it to the centre (Sam, 2026-10-01). */}
                      <button
                        type="button"
                        data-tick="click"
                        aria-haspopup="dialog"
                        onClick={() => setFocus(i.slug)}
                        disabled={busy}
                        className="group flex h-full w-full flex-col gap-1 rounded-sm border border-[#7a5f33]/50 bg-[#0d0b08]/85 p-2 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#e2c98e] hover:shadow-[0_0_18px_rgba(226,201,142,.45)] focus-visible:border-[#e2c98e] focus-visible:shadow-[0_0_18px_rgba(226,201,142,.45)] disabled:opacity-60"
                      >
                        <span className="flex w-full flex-col items-center gap-1">
                          <img src={cutout(i.slug)} onError={(e) => { if (i.icon) (e.currentTarget as HTMLImageElement).src = i.icon }} alt="" className="h-16 w-16 object-contain transition-transform duration-200 group-hover:scale-110" />
                          <span className="text-sm text-[#f1dca8]">{i.name}</span>
                          <span className="text-[11px] text-stone-400">raw ×{i.raw}</span>
                        </span>
                        <span className="flex flex-col gap-0.5" aria-label={`What you know about ${i.name}`}>
                          {i.columns.map((c, n) => (
                            <span key={n} className="flex items-center gap-1 text-[11px]">
                              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full border border-stone-600" style={c ? { background: lookOf(c).liquid } : undefined} />
                              <span className={c ? "text-stone-300" : "text-stone-600"}>{c ? effectName(c) : "?"}</span>
                            </span>
                          ))}
                        </span>
                        <span className="mt-1 rounded-sm border border-[#7a5f33] px-2 py-0.5 text-center text-xs text-[#c9a868]">
                          {i.method ? `${VERB[i.method]} — ${i.tool}` : "No method known"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>)}

              {tab === "drinks" && (<div>
                <h3 className="mb-2 flex items-baseline gap-2 text-xs uppercase tracking-[0.2em] text-[#c9a868]">
                  Fermented drinks
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
                {pack.drinks.length === 0 && <p className="mb-1 text-sm text-stone-500">No drinks in your pack.</p>}
                <p className="text-xs text-stone-500">New drinks are made from the recipe journal.</p>
              </div>)}

              {(tab === "potions" || tab === "elixirs") && (<div>
                <h3 className="mb-2 flex flex-wrap items-baseline gap-2 text-xs uppercase tracking-[0.2em] text-[#c9a868]">
                  {tab === "potions" ? "Potions" : "Elixirs"}
                  <span className="normal-case tracking-normal text-stone-500">{tab === "potions" ? "one effect" : "two or more effects in one flask"}</span>
                </h3>
                {flasksIn(tab).length === 0 && <p className="text-sm text-stone-400">{tab === "potions" ? "No potions yet." : "No elixirs yet."}</p>}
                <ul className="flex flex-col gap-2">
                  {flasksIn(tab).map((f) => (
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
              </div>)}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/** What was just made: what it is, what it does, keep it or toss it. */
function MadeWindow({ made, busy, onKeep, onToss }: { made: Made; busy: boolean; onKeep: () => void; onToss: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onKeep() } }
    window.addEventListener("keydown", k, true)
    return () => window.removeEventListener("keydown", k, true)
  }, [onKeep])
  const brew = made.kind === "brew" ? made : null
  const drink = made.kind === "drink" ? made : null
  const kind = brew ? (brew.effects.length >= 2 ? "Elixir" : "Potion") : `Fermented drink · ${drink!.class}`
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="What you made">
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-sm border border-[#9c7a3a] bg-[#100c07] p-5 shadow-[0_0_0_3px_rgba(6,5,10,.95),0_0_0_4px_#7a6238,0_30px_80px_rgba(0,0,0,.8)]">
        <p className="text-[10px] uppercase tracking-[0.3em] text-stone-500">You made</p>
        {brew ? (
          <TintedFlask effects={brew.effects.map((e) => e.slug)} potency={brew.potency} impurity={brew.impurity} className="h-32 w-32" />
        ) : (
          <img src={cutout(drink!.slug)} alt="" className="h-32 w-32 object-contain" />
        )}
        <h3 className="text-center font-serif text-lg text-[#f1dca8]">{brew ? brew.label : drink!.name}</h3>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#c9a868]">{kind}</p>
        <dl className="w-full divide-y divide-[#7a5f33]/40 border-y border-[#7a5f33]/40 text-sm">
          {brew && brew.effects.map((e) => (
            <div key={e.slug} className="flex flex-col gap-0.5 py-1.5">
              <dt className={cn("font-serif", e.harmful ? "text-[#f0875f]" : "text-[#e2c98e]")}>{e.name}{e.harmful ? " (harmful)" : ""}</dt>
              {e.summary && <dd className="text-xs text-stone-400">{e.summary}</dd>}
            </div>
          ))}
          {brew && (
            <div className="flex justify-between py-1.5 text-xs text-stone-300">
              <span>Potency {ROMAN[brew.potency]}</span><span>{IMPURITY[brew.impurity]}</span>
            </div>
          )}
          {brew && brew.rune && isRuneSchool(brew.rune) && (
            <p className="py-1.5 text-xs text-stone-300">{RUNE_RIDER[brew.rune] ?? `${brew.rune[0].toUpperCase()}${brew.rune.slice(1)} rune: one potency tier stronger.`}</p>
          )}
          {brew && brew.base !== "water" && <p className="py-1.5 text-xs text-stone-300">Brewed on {brew.base.replace("-", " ")}.</p>}
          {drink && (
            <>
              {drink.description && <p className="py-1.5 text-xs italic text-stone-300">{drink.description}</p>}
              <p className="py-1.5 text-xs text-stone-300">Each drink: CON save DC {drink.dc}. A failure climbs {drink.steps} step{drink.steps === 1 ? "" : "s"}.</p>
            </>
          )}
        </dl>
        <div className="flex w-full gap-3">
          <button type="button" onClick={onToss} disabled={busy || (brew ? !brew.id : false)}
            className="flex-1 rounded-sm border border-[#7a5f33] px-3 py-2 font-serif text-sm uppercase tracking-[0.15em] text-stone-300 hover:bg-[#2a1f10] disabled:opacity-40">
            Toss it
          </button>
          <button type="button" onClick={onKeep} disabled={busy} autoFocus
            className="flex-1 rounded-sm border border-[#c9a868] bg-[#2a1f10] px-3 py-2 font-serif text-sm uppercase tracking-[0.15em] text-[#f1dca8] hover:bg-[#3a2b15] disabled:opacity-40">
            Keep it
          </button>
        </div>
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
