"use client"

// The ingredient, zoomed to the centre of the bench, asking to be extracted.
// Sam, 2026-10-01: "when you hover over a reagent its card glows, clicking it
// causes an audible click and zooms into the center of it asking if you want
// to extract it (method to do so is on the card). If you select extract then
// the roll occurs and either a successful animation renders or an
// unsuccessful renders. You then see the result."
//
// The rule is unchanged (lib/extraction.ts, /api/alchemy/extract): one camp
// action is a SITTING of up to three, each its own roll. So the zoomed card
// can take up to two more raw ingredients along for the same action; on its
// own it extracts just the one.
//
// The animations draw only approved art: the raw cut-out turning into its
// approved prepared painting (prepared), the same tinged amber (bruised), or
// the raw cut-out shuddering, darkening and breaking apart (ruined). When the
// method films are approved they can play here instead.

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { cutout, preparedArt } from "@/lib/alchemy-art"
import type { Ingredient } from "@/components/alchemy/alchemy-bench"

export type ExtractResult =
  | { slug: string; ok: true; outcome: "prepared" | "bruised" | "ruined"; preparedName: string | null; learned: string | null; summary: string }
  | { slug: string; ok: false; error: string }

const VERB: Record<string, string> = { grind: "Grind", cut: "Cut", press: "Press", decant: "Decant" }
const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
const REVEAL_MS = 1900

export function ExtractFocus({
  ingredient, others, roll, campActions, busy, onExtract, onTaste, onClose,
}: {
  ingredient: Ingredient
  /** Other raw ingredients that could join this sitting. */
  others: Ingredient[]
  roll: { extract: { modifier: number; dc: number; proficient: boolean }; taste: { modifier: number; dc: number } }
  campActions: number
  busy: boolean
  /** Rolls each on the board's dice, posts the sitting, returns one result per slug in order. */
  onExtract: (slugs: string[]) => Promise<ExtractResult[]>
  onTaste: () => void
  onClose: () => void
}) {
  const [extra, setExtra] = useState<string[]>([])
  const [phase, setPhase] = useState<"ask" | "rolling" | "reveal" | "done">("ask")
  const [results, setResults] = useState<ExtractResult[]>([])
  const [shown, setShown] = useState(0)
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

  const all = [ingredient, ...others.filter((o) => extra.includes(o.slug))]
  const bySlug = new Map([ingredient, ...others].map((i) => [i.slug, i]))

  // Escape closes, except mid-roll.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && phase !== "rolling") { e.stopPropagation(); onClose() } }
    window.addEventListener("keydown", k, true)
    return () => window.removeEventListener("keydown", k, true)
  }, [phase, onClose])

  // One result at a time, each with its own animation, then the summary.
  useEffect(() => {
    if (phase !== "reveal") return
    if (shown >= results.length) { setPhase("done"); return }
    const t = window.setTimeout(() => setShown((n) => n + 1), reduce ? 400 : REVEAL_MS)
    return () => window.clearTimeout(t)
  }, [phase, shown, results.length, reduce])

  async function go() {
    setPhase("rolling")
    try {
      const r = await onExtract(all.map((i) => i.slug))
      setResults(r)
      setShown(0)
      setPhase(r.length ? "reveal" : "done")
    } catch {
      setResults([{ slug: ingredient.slug, ok: false, error: "The bench would not take it." }])
      setPhase("done")
    }
  }

  const current = phase === "reveal" ? results[shown] : null
  const noAction = campActions < 1

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Extract ${ingredient.name}`}>
      <style>{FOCUS_CSS}</style>
      <div className="aop-zoom relative flex w-full max-w-md flex-col items-center gap-3 rounded-sm border border-[#c9a868] bg-[#100c07] p-5 shadow-[0_0_0_3px_rgba(6,5,10,.95),0_0_0_4px_#7a6238,0_0_60px_rgba(226,201,142,.25)]">
        {phase !== "rolling" && phase !== "reveal" && (
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 rounded-sm p-1 text-stone-400 hover:text-[#e2c98e]">
            <X className="h-4 w-4" />
          </button>
        )}

        {/* The stage: the ingredient, then each result's animation in turn. */}
        <div className="relative grid h-48 w-48 place-items-center">
          {current ? (
            <Reveal key={`${current.slug}-${shown}`} result={current} name={bySlug.get(current.slug)?.name ?? current.slug} reduce={reduce} />
          ) : phase === "done" ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {results.map((r) => (
                <img
                  key={r.slug}
                  src={r.ok && r.outcome !== "ruined" ? preparedArt(r.slug) ?? cutout(r.slug) : cutout(r.slug)}
                  alt=""
                  className={cn("rounded-sm object-cover", results.length > 1 ? "h-20 w-20" : "h-44 w-44",
                    r.ok && r.outcome === "ruined" && "opacity-40 grayscale", r.ok && r.outcome === "bruised" && "sepia")}
                />
              ))}
            </div>
          ) : (
            <img src={cutout(ingredient.slug)} alt="" className={cn("h-44 w-44 object-contain", phase === "rolling" && "aop-wobble")} />
          )}
        </div>

        <h3 className="text-center font-serif text-lg text-[#f1dca8]">{ingredient.name}{all.length > 1 ? ` and ${all.length - 1} more` : ""}</h3>

        {phase === "ask" && (
          <>
            {ingredient.method ? (
              <p className="text-center text-sm text-stone-300">
                <b className="text-[#e2c98e]">{VERB[ingredient.method]} it</b> with the {ingredient.tool}.
                <span className="block text-xs text-stone-400">
                  INT {sign(roll.extract.modifier)}{roll.extract.proficient ? " with your tools" : ""} vs DC {roll.extract.dc}. Beat it by 5 to learn an effect;
                  miss and it bruises; miss by 5 or roll a 1 and it is ruined.
                </span>
              </p>
            ) : (
              <p className="text-center text-sm text-stone-400">Nobody has written down how {ingredient.name} is prepared.</p>
            )}

            {ingredient.method && others.length > 0 && (
              <div className="w-full">
                <p className="mb-1 text-center text-[11px] text-stone-500">One camp action covers up to three. Add to this sitting:</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {others.map((o) => {
                    const on = extra.includes(o.slug)
                    return (
                      <button key={o.slug} type="button" aria-pressed={on} title={`${o.name}: ${o.method ? VERB[o.method] : ""}`}
                        onClick={() => setExtra((x) => (on ? x.filter((s) => s !== o.slug) : x.length >= 2 ? x : [...x, o.slug]))}
                        className={cn("rounded-sm border p-0.5", on ? "border-[#e2c98e] bg-[#2a1f10]" : "border-[#7a5f33]/50 opacity-70 hover:opacity-100")}>
                        <img src={cutout(o.slug)} alt={o.name} className="h-9 w-9 object-contain" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex w-full flex-col gap-2">
              <button type="button" onClick={() => void go()} disabled={busy || !ingredient.method || noAction} data-tick="click"
                className="rounded-sm border border-[#c9a868] bg-[#5a1f14] px-4 py-2 font-serif text-sm uppercase tracking-[0.15em] text-[#f1dca8] hover:bg-[#7a2a1b] disabled:cursor-not-allowed disabled:bg-[#2a1f10] disabled:opacity-40">
                {noAction ? "No camp action left this rest" : `Extract${all.length > 1 ? ` all ${all.length}` : ""} (1 camp action)`}
              </button>
              {ingredient.columns[0] === null && (
                <button type="button" onClick={onTaste} disabled={busy}
                  className="rounded-sm border border-[#7a5f33] px-4 py-1.5 text-xs text-[#c9a868] hover:bg-[#2a1f10] disabled:opacity-40">
                  Taste it instead (CON {sign(roll.taste.modifier)} vs DC {roll.taste.dc}, free)
                </button>
              )}
            </div>
          </>
        )}

        {phase === "rolling" && <p className="text-sm text-stone-400">Rolling…</p>}

        {phase === "done" && (
          <>
            <ul className="flex w-full flex-col gap-1.5 text-sm">
              {results.map((r) => (
                <li key={r.slug} className="rounded-sm border border-[#7a5f33]/50 bg-black/30 px-2 py-1.5">
                  {r.ok ? (
                    <>
                      <b className={cn("font-serif", r.outcome === "prepared" ? "text-[#9fd08a]" : r.outcome === "bruised" ? "text-[#d9a066]" : "text-[#f0875f]")}>
                        {r.outcome === "prepared" ? r.preparedName ?? "Prepared" : r.outcome === "bruised" ? `${r.preparedName ?? "Prepared"}, bruised` : `${bySlug.get(r.slug)?.name ?? r.slug} is ruined`}
                      </b>
                      <span className="block text-xs text-stone-400">{r.summary}</span>
                      {r.learned && <span className="block text-xs text-[#e2c98e]">You learn: {r.learned}.</span>}
                    </>
                  ) : (
                    <span className="text-xs text-[#f0875f]">{bySlug.get(r.slug)?.name ?? r.slug}: {r.error}</span>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" onClick={onClose}
              className="w-full rounded-sm border border-[#c9a868] bg-[#2a1f10] px-4 py-2 font-serif text-sm uppercase tracking-[0.15em] text-[#f1dca8] hover:bg-[#3a2b15]">
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** One result's animation: transform, transform tinged, or break apart. */
function Reveal({ result, name, reduce }: { result: ExtractResult; name: string; reduce: boolean }) {
  const raw = cutout(result.slug)
  if (!result.ok) {
    return <img src={raw} alt="" className="h-44 w-44 object-contain opacity-50" />
  }
  if (result.outcome === "ruined") {
    return (
      <div className={cn("relative h-44 w-44", !reduce && "aop-shudder")} aria-label={`${name}: ruined`}>
        {["0 50% 50% 0", "0 0 50% 50%", "50% 50% 0 0", "50% 0 0 50%"].map((inset, i) => (
          <img
            key={i}
            src={raw}
            alt=""
            className={cn("absolute inset-0 h-full w-full object-contain", !reduce && `aop-shard aop-shard-${i}`)}
            style={{ clipPath: `inset(${inset})`, filter: "grayscale(1) brightness(.45)" }}
          />
        ))}
        {!reduce && <span className="aop-dust absolute inset-0" />}
      </div>
    )
  }
  const art = preparedArt(result.slug)
  const bruised = result.outcome === "bruised"
  return (
    <div className="relative h-44 w-44" aria-label={`${name}: ${result.outcome}`}>
      {!reduce && <span className={cn("aop-burst absolute -inset-6 rounded-full", bruised && "aop-burst-amber")} />}
      <img src={raw} alt="" className={cn("absolute inset-0 h-full w-full object-contain", reduce ? "hidden" : "aop-out")} />
      <img
        src={art ?? raw}
        alt=""
        className={cn("absolute inset-0 h-full w-full rounded-sm", art ? "object-cover" : "object-contain", !reduce && "aop-in")}
        style={bruised ? { filter: "sepia(.7) saturate(1.3) hue-rotate(-12deg) brightness(.9)" } : undefined}
      />
    </div>
  )
}

const FOCUS_CSS = `
@keyframes aop-zoom{from{transform:scale(.55);opacity:0}to{transform:scale(1);opacity:1}}
.aop-zoom{animation:aop-zoom .28s cubic-bezier(.2,.9,.3,1.2)}
@keyframes aop-wobble{0%,100%{transform:rotate(0)}25%{transform:rotate(-4deg)}75%{transform:rotate(4deg)}}
.aop-wobble{animation:aop-wobble .5s ease-in-out infinite}
@keyframes aop-out{0%{opacity:1;transform:scale(1)}45%{opacity:1;transform:scale(1.08);filter:brightness(1.8)}70%{opacity:0;transform:scale(.7)}100%{opacity:0}}
.aop-out{animation:aop-out 1.4s ease-in forwards}
@keyframes aop-in{0%,45%{opacity:0;transform:scale(.6) rotate(-6deg)}75%{opacity:1;transform:scale(1.06) rotate(0)}100%{opacity:1;transform:scale(1)}}
.aop-in{animation:aop-in 1.4s ease-out forwards}
@keyframes aop-burst{0%,35%{opacity:0;transform:scale(.3)}55%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.4)}}
.aop-burst{background:radial-gradient(circle,rgba(255,226,140,.85) 0%,rgba(226,201,142,.35) 35%,transparent 65%);animation:aop-burst 1.4s ease-out forwards}
.aop-burst-amber{background:radial-gradient(circle,rgba(217,140,60,.75) 0%,rgba(160,90,40,.3) 35%,transparent 65%)}
@keyframes aop-shudder{0%,100%{transform:translate(0)}10%{transform:translate(-3px,1px)}20%{transform:translate(3px,-1px)}30%{transform:translate(-2px,2px)}40%{transform:translate(2px,0)}50%{transform:translate(0)}}
.aop-shudder{animation:aop-shudder .5s linear 1}
@keyframes aop-s0{0%,40%{transform:none;opacity:1}100%{transform:translate(-40px,70px) rotate(-30deg);opacity:0}}
@keyframes aop-s1{0%,40%{transform:none;opacity:1}100%{transform:translate(40px,80px) rotate(25deg);opacity:0}}
@keyframes aop-s2{0%,40%{transform:none;opacity:1}100%{transform:translate(35px,60px) rotate(40deg);opacity:0}}
@keyframes aop-s3{0%,40%{transform:none;opacity:1}100%{transform:translate(-35px,90px) rotate(-45deg);opacity:0}}
.aop-shard{animation:1.5s ease-in forwards}
.aop-shard-0{animation-name:aop-s0}.aop-shard-1{animation-name:aop-s1}.aop-shard-2{animation-name:aop-s2}.aop-shard-3{animation-name:aop-s3}
@keyframes aop-dust{0%,45%{opacity:0}60%{opacity:.8}100%{opacity:0;transform:translateY(20px)}}
.aop-dust{background:radial-gradient(circle at 50% 70%,rgba(120,110,95,.6),transparent 60%);animation:aop-dust 1.5s ease-out forwards}
@media (prefers-reduced-motion:reduce){.aop-zoom,.aop-wobble{animation:none}}
`
