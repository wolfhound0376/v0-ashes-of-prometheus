"use client"

// The repair bench — the screen a player puts their gear right at.
//
// The third door behind Craft in the camp window (docs/claude_Camp_Scene.md
// §1c), built on the rules Sam approved 2026-10-01
// (docs/claude_Repair_Mend_Upgrade.md §9, items 1-5 YES).
//
// Everything a rule decides is decided by the route; this only draws and rolls:
//   GET  /api/camp/repair?characterId=   the pack, with what each piece needs
//   POST /api/camp/repair                maintain | mend | repair | salvage
//
// THE DICE are the board's (useDice), and the route takes the face the table
// actually rolled. Nothing here rolls on its own and nothing here re-rolls —
// the same contract the alchemy bench works under.
//
// WHAT THIS DELIBERATELY DOES NOT HIDE: a verb the character cannot use stays
// on screen, greyed, carrying the route's own reason. A bench that hides the
// Repair button when you lack the tool teaches you nothing; one that says "you
// are not proficient with Smith's Tools" sends you to find Eldeth.

import { useCallback, useEffect, useState } from "react"
import { Hammer, Wrench, Sparkles, Recycle, X, AlertTriangle } from "lucide-react"
import { useDice } from "@/components/dice/dice-provider"
import { cn } from "@/lib/utils"
import { CONDITIONS, type Condition } from "@/lib/repair"

type Effect = {
  attack: number; damage: number; ac: number
  disadvantage: boolean; unusable: boolean
  valueMultiplier: number; note: string
}

type RepairPlan = {
  from: Condition; to: Condition
  dc: number; hours: number; checks: number
  tool: string; requires: string | null
  materialsGp: number
  haveTool: boolean
  toPristineGp: number
  modifier: number
  ability: string
  banked: number
  flags: string[]
}

type Piece = {
  inventoryItemId: string
  name: string
  slug: string | null
  condition: Condition
  effect: Effect
  maintainable: boolean
  mend: { ok: boolean; to: Condition; reason: string | null; flags: string[] }
  repair: RepairPlan | null
  repairReason: string | null
  becomesOnRepair: string | null
}

type Pack = {
  character: { id: string; name: string }
  campActions: number
  facilities: string[]
  tools: string[]
  items: Piece[]
}

// The severity ramp. Every pill carries its WORD as well as its colour —
// colour alone fails for red-green deficiency and in peripheral vision, the
// same rule the spell schools adopted.
const RUNG: Record<Condition, { label: string; fg: string; bg: string; border: string }> = {
  pristine:  { label: "Pristine",  fg: "text-[#9ccf7a]", bg: "bg-[#1a2414]", border: "border-[#5d7a45]" },
  worn:      { label: "Worn",      fg: "text-[#e2c98e]", bg: "bg-[#241d12]", border: "border-[#7a5f33]" },
  damaged:   { label: "Damaged",   fg: "text-[#f0913f]", bg: "bg-[#2a1a0c]", border: "border-[#a35f22]" },
  broken:    { label: "Broken",    fg: "text-[#ff9a7a]", bg: "bg-[#2a0f0a]", border: "border-[#c9563f]" },
  destroyed: { label: "Destroyed", fg: "text-stone-400", bg: "bg-[#16140f]", border: "border-[#4a443a]" },
}

/** Worst first — nobody opens this bench to look at what is already fine. */
function byNeed(a: Piece, b: Piece): number {
  const d = CONDITIONS.indexOf(b.condition) - CONDITIONS.indexOf(a.condition)
  return d !== 0 ? d : a.name.localeCompare(b.name)
}

function Ladder({ condition }: { condition: Condition }) {
  const at = CONDITIONS.indexOf(condition)
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {CONDITIONS.map((c, i) => (
        <span
          key={c}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors",
            i === at ? RUNG[c].border.replace("border-", "bg-") : i < at ? "bg-[#3d3428]" : "bg-[#241f18]",
          )}
        />
      ))}
    </div>
  )
}

function Pill({ condition }: { condition: Condition }) {
  const r = RUNG[condition]
  return (
    <span className={cn("shrink-0 rounded-sm border px-1.5 py-0.5 font-serif text-[10px] uppercase tracking-[0.14em]", r.fg, r.bg, r.border)}>
      {r.label}
    </span>
  )
}

/** One verb. Disabled carries the reason rather than vanishing. */
function Verb({
  label, hint, reason, icon: Icon, tone = "gold", busy, onClick,
}: {
  label: string; hint: string; reason: string | null
  icon: typeof Wrench; tone?: "gold" | "red"; busy: boolean; onClick: () => void
}) {
  const blocked = reason !== null
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={blocked || busy}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-sm border p-3 text-left transition-colors",
        tone === "red"
          ? "border-[#c9563f]/60 bg-[#1d0f0c] hover:border-[#c9563f]"
          : "border-[#3d3428] bg-[#15110c] hover:border-[#c9a868]",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[#3d3428]",
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "red" ? "text-[#ff9a7a]" : "text-[#c9a868]")} aria-hidden="true" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-serif text-sm text-[#e2c98e]">{label}</span>
        <span className="text-xs leading-snug text-stone-400">{blocked ? reason : hint}</span>
      </span>
    </button>
  )
}

export function RepairBench({ characterId, onClose }: { characterId: string; onClose: () => void }) {
  const { roll } = useDice()
  const [pack, setPack] = useState<Pack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ tone: "good" | "bad" | "plain"; lines: string[] } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/camp/repair?characterId=${encodeURIComponent(characterId)}`)
      const body = await r.json()
      if (!r.ok) { setError(body.error === "not_found" ? "That character is not at this camp." : "The bench could not read your pack."); return }
      setPack(body as Pack)
      setError(null)
    } catch {
      setError("The bench could not read your pack.")
    }
  }, [characterId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])

  const picked = pack?.items.find((i) => i.inventoryItemId === pickedId) ?? null

  async function act(action: "maintain" | "mend" | "salvage", item: Piece) {
    if (busy) return
    setBusy(true)
    setSaid(null)
    try {
      const r = await fetch("/api/camp/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId, inventoryItemId: item.inventoryItemId, action,
          ...(action === "maintain" ? { tool: item.repair?.tool ?? pack?.tools[0] ?? null } : {}),
        }),
      })
      const body = await r.json()
      if (!r.ok || !body.ok) { setSaid({ tone: "bad", lines: [body.reason ?? "The bench refused that."] }); return }
      setSaid({ tone: "good", lines: [body.note, ...(body.flags ?? [])].filter(Boolean) })
      await load()
    } catch {
      setSaid({ tone: "bad", lines: ["That did not reach the bench."] })
    } finally {
      setBusy(false)
    }
  }

  /** The only verb that rolls. The route settles it; this hands over the face. */
  async function repair(item: Piece) {
    const plan = item.repair
    if (!plan || busy) return
    setBusy(true)
    setSaid(null)
    try {
      const r = await roll({
        die: "d20", numDice: 1, modifier: plan.modifier,
        label: `Repair ${item.name} — ${plan.ability.toUpperCase()} + ${plan.tool} vs DC ${plan.dc}`,
      })
      const face = r.keptRolls?.[0] ?? r.rolls[0]
      const res = await fetch("/api/camp/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, inventoryItemId: item.inventoryItemId, action: "repair", face, tool: plan.tool }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) { setSaid({ tone: "bad", lines: [body.reason ?? body.error ?? "The bench refused that repair."] }); return }
      const lines: string[] = [body.note]
      if (body.swappedTo) lines.push(`The rust comes away with the ruin. It is a ${body.swappedTo.replace(/-/g, " ")} now.`)
      if (!body.done) lines.push(`${body.successes} of ${body.checks} hours of good work banked.`)
      lines.push(...(body.flags ?? []))
      setSaid({ tone: body.success ? "good" : "plain", lines: lines.filter(Boolean) })
      await load()
    } catch {
      setSaid({ tone: "bad", lines: ["That did not reach the bench."] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Repair bench" className="fixed inset-0 z-[60] flex flex-col bg-[#070605] text-stone-200">
      <header className="relative z-10 flex items-center justify-between gap-3 border-b border-[#7a5f33]/60 bg-[#0d0b08]/80 px-4 py-2">
        <h2 className="flex min-w-0 items-center gap-2 font-serif text-sm uppercase tracking-[0.2em] text-[#e2c98e]">
          <Hammer className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="shrink-0">Repair bench</span>
          {pack && <span className="truncate font-sans text-xs normal-case tracking-normal text-stone-400">{pack.character.name}</span>}
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          {pack && (
            <span className="font-serif text-[10px] uppercase tracking-[0.18em] text-stone-400">
              Actions <span className={pack.campActions > 0 ? "text-[#e2c98e]" : "text-[#ff9a7a]"}>{pack.campActions}</span>
            </span>
          )}
          <button type="button" onClick={onClose} disabled={busy} aria-label="Leave the bench" className="rounded-sm p-1 text-stone-400 hover:text-[#e2c98e] disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {error && (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="max-w-sm text-sm text-stone-400">{error}</p>
        </div>
      )}

      {!error && pack && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          {/* The pack, worst first. */}
          <section aria-label="Your gear" className="min-h-0 flex-1 overflow-y-auto border-b border-[#3d3428] p-3 md:max-w-sm md:border-b-0 md:border-r">
            {pack.items.length === 0 && <p className="p-3 text-sm text-stone-400">Nothing in your pack.</p>}
            <ul className="flex flex-col gap-1.5">
              {[...pack.items].sort(byNeed).map((it) => (
                <li key={it.inventoryItemId}>
                  <button
                    type="button"
                    onClick={() => { setPickedId(it.inventoryItemId); setSaid(null) }}
                    className={cn(
                      "flex w-full flex-col gap-1.5 rounded-sm border p-2.5 text-left transition-colors",
                      it.inventoryItemId === pickedId ? "border-[#c9a868] bg-[#1a150e]" : "border-[#3d3428] bg-[#15110c] hover:border-[#7a5f33]",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-serif text-sm text-[#e2c98e]">{it.name}</span>
                      <Pill condition={it.condition} />
                    </span>
                    <Ladder condition={it.condition} />
                    {it.effect.note && <span className="text-xs leading-snug text-stone-400">{it.effect.note}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* What this piece needs. */}
          <section aria-label="What it needs" className="min-h-0 flex-1 overflow-y-auto p-4">
            {!picked && <p className="text-sm text-stone-400">Pick something out of your pack.</p>}

            {picked && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-serif text-lg text-[#e3b95c]">{picked.name}</h3>
                    <Pill condition={picked.condition} />
                  </div>
                  <Ladder condition={picked.condition} />
                  {picked.effect.note && <p className="text-sm leading-relaxed text-stone-300">{picked.effect.note}</p>}
                  {picked.becomesOnRepair && picked.condition === "damaged" && (
                    <p className="text-xs leading-relaxed text-[#9ccf7a]">
                      Worked past damaged, the rust comes off for good — it becomes a {picked.becomesOnRepair.replace(/-/g, " ")}.
                    </p>
                  )}
                </div>

                {said && (
                  <div
                    role="status"
                    className={cn(
                      "flex flex-col gap-1 rounded-sm border p-3 text-sm leading-relaxed",
                      said.tone === "good" ? "border-[#5d7a45] bg-[#141a10] text-stone-200"
                        : said.tone === "bad" ? "border-[#c9563f]/60 bg-[#1d0f0c] text-[#ffc5b2]"
                        : "border-[#7a5f33] bg-[#17130d] text-stone-300",
                    )}
                  >
                    {said.lines.map((l, i) => (
                      <p key={i} className={i > 0 ? "text-xs text-stone-400" : undefined}>{l}</p>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Verb
                    label="Maintain"
                    hint="Five minutes and a tool. Free, once a rest."
                    reason={picked.maintainable ? null : `${picked.name} is past what care alone can fix.`}
                    icon={Sparkles}
                    busy={busy}
                    onClick={() => void act("maintain", picked)}
                  />

                  <Verb
                    label="Mend"
                    hint={`The cantrip — one minute, no tools. Closes the break to ${picked.mend.to}.`}
                    reason={picked.mend.ok ? null : picked.mend.reason}
                    icon={Wrench}
                    busy={busy}
                    onClick={() => void act("mend", picked)}
                  />

                  {picked.repair ? (
                    <div className="flex flex-col gap-2 rounded-sm border border-[#3d3428] bg-[#120f0a] p-3">
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        <dt className="text-stone-500">Tool</dt>
                        <dd className={picked.repair.haveTool ? "text-stone-300" : "text-[#ff9a7a]"}>
                          {picked.repair.tool}{picked.repair.haveTool ? "" : " — not yours"}
                        </dd>
                        <dt className="text-stone-500">Check</dt>
                        <dd className="text-stone-300">
                          {picked.repair.ability.toUpperCase()} vs DC {picked.repair.dc}
                        </dd>
                        <dt className="text-stone-500">Hours of good work</dt>
                        <dd className="text-stone-300">{picked.repair.banked} of {picked.repair.checks}</dd>
                        <dt className="text-stone-500">Materials</dt>
                        <dd className="text-stone-300">{picked.repair.materialsGp} gp</dd>
                        {picked.repair.requires && (
                          <>
                            <dt className="text-stone-500">Needs</dt>
                            <dd className="text-stone-300">a {picked.repair.requires}</dd>
                          </>
                        )}
                        <dt className="text-stone-500">All the way to pristine</dt>
                        <dd className="text-stone-300">{picked.repair.toPristineGp} gp</dd>
                      </dl>

                      <Verb
                        label={`Repair — one rung to ${picked.repair.to}`}
                        hint="One camp action, one hour, one check. A failed hour never undoes banked work."
                        reason={
                          !picked.repair.haveTool
                            ? `${pack.character.name} is not proficient with ${picked.repair.tool}.`
                            : pack.campActions < 1
                              ? "No camp actions left tonight."
                              : null
                        }
                        icon={Hammer}
                        busy={busy}
                        onClick={() => void repair(picked)}
                      />

                      {picked.repair.flags.map((f, i) => (
                        <p key={i} className="flex items-start gap-1.5 text-xs leading-snug text-[#c9a868]">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>{f}</span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    picked.repairReason && (
                      <p className="rounded-sm border border-[#3d3428] bg-[#120f0a] p-3 text-xs leading-relaxed text-stone-400">
                        {picked.repairReason}
                      </p>
                    )
                  )}

                  {picked.condition === "destroyed" && (
                    <Verb
                      label="Salvage"
                      hint="Strip it for what it was made of. The record of how it broke survives."
                      reason={null}
                      icon={Recycle}
                      tone="red"
                      busy={busy}
                      onClick={() => void act("salvage", picked)}
                    />
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
