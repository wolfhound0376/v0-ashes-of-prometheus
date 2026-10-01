"use client"

// The recipe journal and its schematic. Sam, 2026-10-01:
//   "recipes can show your journal icon and then opening it gives you
//    individual recipes that you can choose. When you select them it
//    automatically takes you to a three tiered schematic with the
//    potion/elixir/fermented drink at the top, below it boxes where the
//    desired reagents are semi translucent requiring you to drag them if you
//    have them. The final tier in the diagram shows the option for a sigil
//    and/or blessing. The page typically has a description on the bottom
//    about how this recipe works."
//
// The schematic decides nothing. Filling a box only marks the reagent as
// chosen; the brew still goes through /api/alchemy/brew (with the recipe's
// slug, so a true recipe waives the blind penalty) and a drink through
// /api/alchemy/make-drink, exactly as before. Dragging is the main gesture;
// tapping a reagent in the tray does the same, for touch screens.

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { cutout, preparedArt } from "@/lib/alchemy-art"
import { SCHOOL_VFX } from "@/lib/spell-school-vfx"
import { RUNE_RIDER, isRuneSchool } from "@/lib/alchemy-runes"
import type { MagicSchool } from "@/lib/spell-school"
import { TintedFlask, type Pack } from "@/components/alchemy/alchemy-bench"

export type Schematic = { kind: "potion"; slug: string } | { kind: "drink"; slug: string }

const JOURNAL_ICON = cutout("recipe-book")
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const slugOf = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

/** The journal button for the tab row. */
export function JournalButton({ onOpen, count }: { onOpen: () => void; count: number }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Recipe journal"
      className="-mb-px ml-auto flex shrink-0 items-center gap-1.5 rounded-t-sm border border-[#9c7a3a] bg-[#1a140b] px-2 py-0.5 font-serif text-xs uppercase tracking-[0.1em] text-[#e2c98e] hover:border-[#e2c98e]"
    >
      <img src={JOURNAL_ICON} alt="" className="h-6 w-6 object-contain" />
      Recipes <span className="text-stone-500">{count}</span>
    </button>
  )
}

export function RecipeJournal({
  pack, busy, effectName, open, onOpen, onClose,
  base, setBase, rune, setRune, setPicked, setRecipe, onBrew, onMakeDrink,
}: {
  pack: Pack
  busy: boolean
  effectName: (slug: string) => string
  open: Schematic | null
  onOpen: (s: Schematic | null) => void
  onClose: () => void
  base: "water" | "blessed-water" | "holy-water"
  setBase: (b: "water" | "blessed-water" | "holy-water") => void
  rune: string
  setRune: (r: string) => void
  setPicked: (slugs: string[]) => void
  setRecipe: (slug: string | null) => void
  onBrew: () => void
  onMakeDrink: (slug: string) => void
}) {
  const potion = open?.kind === "potion" ? pack.recipes.find((r) => r.slug === open.slug) ?? null : null
  const drink = open?.kind === "drink" ? pack.makeable.find((m) => m.slug === open.slug) ?? null : null

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-[#9c7a3a] bg-[#100c07]/95 p-3 shadow-[0_0_0_3px_rgba(6,5,10,.9),0_0_0_4px_#7a6238]">
      <div className="flex items-center gap-2">
        {open && (
          <button type="button" onClick={() => onOpen(null)} aria-label="Back to the journal" className="rounded-sm p-1 text-stone-400 hover:text-[#e2c98e]">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <img src={JOURNAL_ICON} alt="" className="h-8 w-8 object-contain" />
        <h3 className="font-serif text-sm uppercase tracking-[0.2em] text-[#e2c98e]">
          {potion?.name ?? drink?.name ?? "Recipe journal"}
        </h3>
        <button type="button" onClick={onClose} aria-label="Close the journal" className="ml-auto rounded-sm p-1 text-stone-400 hover:text-[#e2c98e]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!open && <JournalList pack={pack} onOpen={onOpen} />}

      {potion && (
        <PotionSchematic
          key={potion.slug}
          pack={pack} recipe={potion} busy={busy} effectName={effectName}
          base={base} setBase={setBase} rune={rune} setRune={setRune}
          setPicked={setPicked} setRecipe={setRecipe} onBrew={onBrew}
        />
      )}
      {drink && <DrinkSchematic key={drink.slug} pack={pack} drink={drink} busy={busy} onMake={() => onMakeDrink(drink.slug)} />}
      {open && !potion && !drink && <p className="text-sm text-stone-500">That recipe is no longer in your journal.</p>}
    </div>
  )
}

// ── the journal's pages ──────────────────────────────────────────────────────

function JournalList({ pack, onOpen }: { pack: Pack; onOpen: (s: Schematic) => void }) {
  const potions = pack.recipes.filter((r) => r.ingredients.length >= 2)
  return (
    <div className="flex flex-col gap-3">
      <JournalSection title="Potions & elixirs" empty="No recipes learned yet. They are found, taught, or come with a kit.">
        {potions.map((r) => (
          <JournalEntry
            key={r.slug}
            image={<TintedFlask effects={r.claims ? [slugOf(r.claims)] : []} potency={1} impurity={0} className="h-12 w-12" />}
            name={r.name}
            kind={r.claims ? `Potion · ${r.claims}` : "Brew"}
            ready={r.ready}
            note={r.ready ? "Every reagent prepared" : "Missing prepared reagents"}
            onClick={() => onOpen({ kind: "potion", slug: r.slug })}
          />
        ))}
      </JournalSection>
      <JournalSection title="Fermented drinks" empty="No drink recipes in the catalogue.">
        {pack.makeable.map((m) => (
          <JournalEntry
            key={m.slug}
            image={<img src={cutout(m.slug)} onError={(e) => { if (m.icon) (e.currentTarget as HTMLImageElement).src = m.icon }} alt="" className="h-12 w-12 object-contain" />}
            name={m.name}
            kind={cap(m.class)}
            ready={m.ok}
            note={m.ok ? "Ready to make" : m.reason ?? "Not tonight"}
            onClick={() => onOpen({ kind: "drink", slug: m.slug })}
          />
        ))}
      </JournalSection>
    </div>
  )
}

function JournalSection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h4 className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-[#c9a868]">{title}</h4>
      {children.length === 0 ? <p className="text-sm text-stone-500">{empty}</p> : <ul className="grid gap-1.5 sm:grid-cols-2">{children}</ul>}
    </section>
  )
}

function JournalEntry({ image, name, kind, ready, note, onClick }: { image: React.ReactNode; name: string; kind: string; ready: boolean; note: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick}
        className="flex w-full items-center gap-3 rounded-sm border border-[#7a5f33]/50 bg-[#0d0b08]/85 p-2 text-left hover:border-[#c9a868]">
        <span className="grid h-12 w-12 shrink-0 place-items-center">{image}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-[#f1dca8]">{name}</span>
          <span className="block truncate text-[11px] text-stone-400">{kind}</span>
          <span className={cn("block truncate text-[11px]", ready ? "text-[#9fd08a]" : "text-stone-500")}>{note}</span>
        </span>
      </button>
    </li>
  )
}

// ── the schematic ────────────────────────────────────────────────────────────

/** One required reagent box. Ghosted until filled; accepts only its own reagent. */
function ReagentBox({ slug, label, filled, have, onDropSlug, onClear }: {
  slug: string; label: string; filled: boolean; have: number
  onDropSlug: (slug: string) => void; onClear: () => void
}) {
  const [over, setOver] = useState(false)
  const art = preparedArt(slug)
  return (
    <div
      onDragOver={(e) => { if (!filled) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDropSlug(e.dataTransfer.getData("text/plain")) }}
      className="flex w-28 flex-col items-center gap-1"
    >
      <button
        type="button"
        onClick={filled ? onClear : undefined}
        title={filled ? "Take it back out" : have ? "Drag it here from your reagents" : "You have none prepared"}
        aria-label={filled ? `${label}, in place. Take it back out` : `${label}, empty`}
        className={cn(
          "relative grid h-24 w-24 place-items-center overflow-hidden rounded-sm border-2 transition",
          filled ? "border-[#e2c98e] bg-[#2a1f10]" : over ? "border-[#e2c98e] border-dashed bg-[#2a1f10]/60" : "border-dashed border-[#7a5f33] bg-black/40",
        )}
      >
        <img
          src={art ?? cutout(slug)}
          alt=""
          className={cn("h-full w-full", art ? "object-cover" : "object-contain p-2", !filled && "opacity-30 grayscale")}
        />
        {filled && <span className="absolute right-1 top-1 rounded-sm bg-[#e2c98e] px-1 text-[10px] font-bold text-black">✓</span>}
      </button>
      <span className="text-center text-[11px] leading-tight text-[#f1dca8]">{label}</span>
      <span className={cn("text-[10px]", have ? "text-stone-400" : "text-[#e07a63]")}>{have ? `${have} prepared` : "none prepared"}</span>
    </div>
  )
}

/** The reagents you hold that this recipe wants, to drag (or tap) into place. */
function Tray({ items, onPlace }: { items: Array<{ slug: string; label: string; left: number }>; onPlace: (slug: string) => void }) {
  if (!items.length) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-sm border border-[#7a5f33]/50 bg-black/30 p-2">
      <span className="w-full text-center text-[10px] uppercase tracking-[0.2em] text-stone-500">Your reagents: drag into the boxes, or tap</span>
      {items.map((t) => {
        const art = preparedArt(t.slug)
        return (
          <button
            key={t.slug}
            type="button"
            draggable={t.left > 0}
            disabled={t.left < 1}
            onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.slug); e.dataTransfer.effectAllowed = "copy" }}
            onClick={() => onPlace(t.slug)}
            className="flex cursor-grab items-center gap-2 rounded-sm border border-[#c9a868] bg-[#1a140b] py-1 pl-1 pr-2 text-xs text-[#f1dca8] active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
          >
            <img src={art ?? cutout(t.slug)} alt="" className={cn("h-9 w-9 rounded-sm", art ? "object-cover" : "object-contain")} />
            {t.label} <span className="text-stone-500">×{t.left}</span>
          </button>
        )
      })}
    </div>
  )
}

function Tier({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{["", "I", "II", "III"][n]} · {title}</span>
      {children}
    </div>
  )
}

/** The gold rule between tiers. */
const Connector = () => <div aria-hidden="true" className="mx-auto h-6 w-px bg-gradient-to-b from-[#c9a868] to-[#7a5f33]" />

function usePlacement(slugs: string[], have: (slug: string) => number) {
  const [filled, setFilled] = useState<boolean[]>(() => slugs.map(() => false))
  useEffect(() => setFilled(slugs.map(() => false)), [slugs.join("|")])
  const used = (slug: string) => slugs.filter((s, i) => s === slug && filled[i]).length
  const place = (slug: string) => {
    const i = slugs.findIndex((s, k) => s === slug && !filled[k])
    if (i < 0 || have(slug) - used(slug) < 1) return
    setFilled((f) => f.map((v, k) => (k === i ? true : v)))
  }
  const clear = (i: number) => setFilled((f) => f.map((v, k) => (k === i ? false : v)))
  return { filled, place, clear, used, complete: filled.length > 0 && filled.every(Boolean) }
}

function PotionSchematic({
  pack, recipe, busy, effectName, base, setBase, rune, setRune, setPicked, setRecipe, onBrew,
}: {
  pack: Pack
  recipe: Pack["recipes"][number]
  busy: boolean
  effectName: (slug: string) => string
  base: "water" | "blessed-water" | "holy-water"
  setBase: (b: "water" | "blessed-water" | "holy-water") => void
  rune: string
  setRune: (r: string) => void
  setPicked: (slugs: string[]) => void
  setRecipe: (slug: string | null) => void
  onBrew: () => void
}) {
  const ing = useMemo(() => new Map(pack.ingredients.map((i) => [i.slug, i])), [pack.ingredients])
  const have = (slug: string) => ing.get(slug)?.prepared ?? 0
  const label = (slug: string) => ing.get(slug)?.name ?? slug.replace(/-/g, " ")
  const { filled, place, clear, used, complete } = usePlacement(recipe.ingredients, have)

  // The vessel follows the schematic: what is in place is what is picked.
  useEffect(() => {
    setRecipe(recipe.slug)
    setPicked(recipe.ingredients.filter((_, i) => filled[i]))
  }, [filled, recipe.slug]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { setPicked([]); setRecipe(null) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const effect = recipe.claims ? slugOf(recipe.claims) : null
  const tray = [...new Set(recipe.ingredients)]
    .filter((s) => have(s) > 0)
    .map((s) => ({ slug: s, label: label(s), left: have(s) - used(s) }))
  const school = isRuneSchool(rune) ? rune : null
  const noAction = pack.campActions < 1

  return (
    <div className="flex flex-col">
      <Tier n={1} title="The brew">
        <div className="flex flex-col items-center rounded-sm border border-[#9c7a3a] bg-[#0d0b08] px-6 py-3">
          <TintedFlask effects={effect ? [effect] : []} potency={1} impurity={0} className="h-24 w-24" />
          <span className="font-serif text-[#f1dca8]">{recipe.name.replace(/^Recipe:\s*/i, "")}</span>
          <span className="text-[11px] uppercase tracking-[0.15em] text-[#c9a868]">Potion{recipe.claims ? ` · ${recipe.claims}` : ""}</span>
        </div>
      </Tier>
      <Connector />
      <Tier n={2} title="Reagents">
        <div className="flex flex-wrap justify-center gap-3">
          {recipe.ingredients.map((s, i) => (
            <ReagentBox key={`${s}-${i}`} slug={s} label={label(s)} filled={filled[i]} have={have(s)} onDropSlug={(d) => d === s && place(s)} onClear={() => clear(i)} />
          ))}
        </div>
        <Tray items={tray} onPlace={place} />
      </Tier>
      <Connector />
      <Tier n={3} title="Sigil and blessing">
        <div className="grid w-full max-w-md grid-cols-2 gap-3">
          <div className="flex flex-col items-center gap-1 rounded-sm border border-[#7a5f33] bg-black/30 p-2">
            <span
              aria-hidden="true"
              className="grid h-12 w-12 place-items-center rounded-full border-2"
              style={school ? { borderColor: hex(SCHOOL_VFX[school as MagicSchool].tint), boxShadow: `0 0 14px ${hex(SCHOOL_VFX[school as MagicSchool].tint)}` } : { borderColor: "#4a3f30" }}
            >
              <span className="text-lg" style={{ color: school ? hex(SCHOOL_VFX[school as MagicSchool].tint) : "#4a3f30" }}>✦</span>
            </span>
            <span className="text-[11px] uppercase tracking-[0.15em] text-[#c9a868]">Sigil</span>
            {pack.runes.marks.length ? (
              <select value={rune} onChange={(e) => setRune(e.target.value)} disabled={busy}
                className="w-full rounded-sm border border-[#7a5f33] bg-[#0d0b08] px-1 py-0.5 text-xs text-[#f1dca8]">
                <option value="">No sigil</option>
                {pack.runes.marks.map((m) => (
                  <option key={m.school} value={m.school} disabled={!m.ok}>{cap(m.school)}{m.ok ? "" : " (can't tonight)"}</option>
                ))}
              </select>
            ) : (
              <span className="text-center text-[11px] text-stone-500">No marks learned</span>
            )}
          </div>
          <div className="flex flex-col items-center gap-1 rounded-sm border border-[#7a5f33] bg-black/30 p-2">
            <img
              src={cutout(base === "water" ? "blessed-water" : base)}
              alt=""
              className={cn("h-12 w-12 object-contain", base === "water" && "opacity-40 grayscale")}
            />
            <span className="text-[11px] uppercase tracking-[0.15em] text-[#c9a868]">Blessing</span>
            <select value={base} onChange={(e) => setBase(e.target.value as typeof base)} disabled={busy}
              className="w-full rounded-sm border border-[#7a5f33] bg-[#0d0b08] px-1 py-0.5 text-xs text-[#f1dca8]">
              <option value="water">Plain water</option>
              <option value="blessed-water" disabled={!pack.bases.blessedWater}>Blessed water ({pack.bases.blessedWater})</option>
              <option value="holy-water" disabled={!pack.bases.holyWater}>Holy water ({pack.bases.holyWater})</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={onBrew}
          disabled={busy || !complete || noAction}
          className="mt-1 rounded-sm border border-[#c9a868] bg-[#5a1f14] px-6 py-2 font-serif text-sm uppercase tracking-[0.15em] text-[#f1dca8] hover:bg-[#7a2a1b] disabled:cursor-not-allowed disabled:bg-[#2a1f10] disabled:opacity-40"
        >
          {noAction ? "No camp action left this rest" : complete ? `Brew — INT ${pack.rolls.brew.modifier >= 0 ? "+" : ""}${pack.rolls.brew.modifier} vs DC ${pack.rolls.brew.dc}` : "Place every reagent"}
        </button>
      </Tier>

      <HowItWorks>
        {recipe.description && <p className="italic text-stone-300">{recipe.description}</p>}
        <p>
          Prepared {recipe.ingredients.map(label).join(" and ")} go into the vessel together
          {recipe.claims ? `, and the one effect they share is ${recipe.claims}` : ""}.
          A true recipe takes away the penalty for mixing blind. The brewing check is Intelligence
          {pack.rolls.brew.proficient ? " with your tools" : ", and without alchemist's supplies or an herbalism kit every brew starts one step dirtier"},
          against DC {pack.rolls.brew.dc}. It costs one camp action ({pack.campActions} left).
        </p>
        <p>
          <b className="text-[#e2c98e]">Sigil:</b>{" "}
          {school
            ? (RUNE_RIDER[school] ?? `${cap(school)} rune: the brew comes out one potency tier stronger.`) + " It uses one rune material."
            : "an optional mark you know, inscribed with one rune material, adds its school's rider to whoever drinks it."}
        </p>
        <p>
          <b className="text-[#e2c98e]">Blessing:</b>{" "}
          {base === "water" ? "brewed on plain water. Blessed or holy water keeps impurity at 1 or below." : `brewed on ${base.replace("-", " ")}, so impurity can't rise above 1. One is used up.`}
        </p>
        {!complete && recipe.ingredients.some((s) => have(s) < 1) && (
          <p className="text-[#e07a63]">You have none of {recipe.ingredients.filter((s) => have(s) < 1).map(label).join(", ")} prepared. Grind or cut it in the Ingredients tab first.</p>
        )}
      </HowItWorks>
    </div>
  )
}

function DrinkSchematic({ pack, drink, busy, onMake }: { pack: Pack; drink: Pack["makeable"][number]; busy: boolean; onMake: () => void }) {
  const ing = useMemo(() => new Map(pack.ingredients.map((i) => [i.slug, i])), [pack.ingredients])
  const drinksHeld = useMemo(() => new Map(pack.drinks.map((d) => [d.slug, d])), [pack.drinks])
  // A drink is made from prepared ingredients, or from another drink (communion wine from mushroom wine).
  const have = (slug: string) => ing.get(slug)?.prepared ?? drinksHeld.get(slug)?.quantity ?? 0
  const label = (slug: string) => ing.get(slug)?.name ?? drinksHeld.get(slug)?.name ?? slug.replace(/-/g, " ")
  const { filled, place, clear, used, complete } = usePlacement(drink.madeFrom, have)
  const tray = [...new Set(drink.madeFrom)].filter((s) => have(s) > 0).map((s) => ({ slug: s, label: label(s), left: have(s) - used(s) }))

  return (
    <div className="flex flex-col">
      <Tier n={1} title="The drink">
        <div className="flex flex-col items-center rounded-sm border border-[#9c7a3a] bg-[#0d0b08] px-6 py-3">
          <img src={cutout(drink.slug)} onError={(e) => { if (drink.icon) (e.currentTarget as HTMLImageElement).src = drink.icon }} alt="" className="h-24 w-24 object-contain" />
          <span className="font-serif text-[#f1dca8]">{drink.name}</span>
          <span className="text-[11px] uppercase tracking-[0.15em] text-[#c9a868]">Fermented drink · {drink.class}</span>
        </div>
      </Tier>
      <Connector />
      <Tier n={2} title="Made from">
        <div className="flex flex-wrap justify-center gap-3">
          {drink.madeFrom.map((s, i) => (
            <ReagentBox key={`${s}-${i}`} slug={s} label={label(s)} filled={filled[i]} have={have(s)} onDropSlug={(d) => d === s && place(s)} onClear={() => clear(i)} />
          ))}
        </div>
        <Tray items={tray} onPlace={place} />
      </Tier>
      <Connector />
      <Tier n={3} title="Sigil and blessing">
        <div className="w-full max-w-md rounded-sm border border-[#7a5f33] bg-black/30 p-2 text-center text-xs text-stone-400">
          {drink.needs
            ? <>This one needs <b className="text-[#e2c98e]">{drink.needs}</b>.{" "}{drink.ok ? "You can give it." : ""}</>
            : "Fermented drinks take no sigil and no blessing."}
        </div>
        <button
          type="button"
          onClick={onMake}
          disabled={busy || !complete || !drink.ok}
          title={drink.ok ? undefined : drink.reason ?? undefined}
          className="mt-1 rounded-sm border border-[#c9a868] bg-[#5a1f14] px-6 py-2 font-serif text-sm uppercase tracking-[0.15em] text-[#f1dca8] hover:bg-[#7a2a1b] disabled:cursor-not-allowed disabled:bg-[#2a1f10] disabled:opacity-40"
        >
          {!drink.ok ? drink.reason ?? "Not tonight" : complete ? "Make it" : "Place every ingredient"}
        </button>
      </Tier>

      <HowItWorks>
        {drink.description && <p className="italic text-stone-300">{drink.description}</p>}
        <p>
          A {drink.class}{drink.maker ? ` (${drink.maker})` : ""}, made from {drink.madeFrom.map(label).join(" and ")}.
          Each drink calls for a Constitution save against DC {drink.dc}; a failure climbs {drink.steps} step{drink.steps === 1 ? "" : "s"} up
          the ladder from sober. An hour without a drink takes one step back off.
        </p>
      </HowItWorks>
    </div>
  )
}

function HowItWorks({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-[#7a5f33]/60 pt-3 text-xs leading-relaxed text-stone-400">
      <h4 className="font-serif text-[11px] uppercase tracking-[0.2em] text-[#c9a868]">How this recipe works</h4>
      {children}
    </div>
  )
}
