"use client"

// DEV PREVIEW ONLY — the alchemy bench, run in rehearsal.
//
// Tasting is a one-way door: once a character learns what bluecap does, they
// know it forever, and the only way to see the mechanic was to spend a real
// player's discovery on it. This page resolves a taste through the SAME route
// the table uses, with `sandbox: true`, so nothing is written and nothing is
// learned. The toggle at the top is the only thing standing between rehearsal
// and canon, which is why it reads "COMMIT" in red and defaults to off.
//
// Same code path as the board, like every other *-preview page here.

import { useCallback, useEffect, useMemo, useState } from "react"

type Ingredient = { slug: string; name: string; icon: string | null; description: string; grid: string[] | null; malformed: boolean }
type Effect = { slug: string; name: string; category: string; summary: string; is_harmful: boolean }
type Character = { id: string; name: string; class: string | null; level: number | null; con_modifier: number | null }
type Bench = { ingredients: Ingredient[]; effects: Effect[]; characters: Character[]; counts: { ingredients: number; malformed: number; effects: number } }
type TasteResponse = {
  sandbox: boolean; character: string; item: string; effect: string; effectName: string
  effectSummary: string | null; harmful: boolean; revealed: boolean; firstTime: boolean
  resisted: boolean; applied: { effect: string; tier: number } | null; dc: number
  stillUnknown: number[]; summary: string
}

const CAT_TINT: Record<string, string> = {
  restorative: "#4ea8ff", sensory: "#b37dff", harmful: "#ff4a12", strange: "#ffd24a",
}

export default function AlchemyPreview() {
  const [dmKey, setDmKey] = useState("")
  const [bench, setBench] = useState<Bench | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [characterId, setCharacterId] = useState("")
  const [slug, setSlug] = useState("")
  const [save, setSave] = useState(10)
  const [commit, setCommit] = useState(false)
  const [log, setLog] = useState<TasteResponse[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setErr(null)
    const res = await fetch("/api/alchemy/bench", { headers: dmKey ? { "x-dm-key": dmKey } : {} })
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? `bench ${res.status}`); return }
    const data: Bench = await res.json()
    setBench(data)
    setCharacterId((c) => c || data.characters[0]?.id || "")
    setSlug((s) => s || data.ingredients[0]?.slug || "")
  }, [dmKey])

  useEffect(() => { void load() }, [load])

  const effectsBySlug = useMemo(
    () => Object.fromEntries((bench?.effects ?? []).map((e) => [e.slug, e])),
    [bench],
  )
  const ingredient = bench?.ingredients.find((i) => i.slug === slug) ?? null
  const character = bench?.characters.find((c) => c.id === characterId) ?? null

  async function doTaste() {
    if (!characterId || !slug) return
    setBusy(true)
    try {
      const res = await fetch("/api/alchemy/taste", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId, itemSlug: slug, save, sandbox: !commit }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? `taste ${res.status}`); return }
      setLog((l) => [data as TasteResponse, ...l].slice(0, 20))
    } finally { setBusy(false) }
  }

  /** The d20 the board would roll, plus this character's Constitution. */
  function rollSave() {
    const d20 = 1 + Math.floor(Math.random() * 20)
    setSave(d20 + (character?.con_modifier ?? 0))
  }

  return (
    <div className="min-h-screen bg-[#0a0908] p-6 font-sans text-[#e3d8c0]">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="border-b border-[#58411f] pb-3">
          <h1 className="font-serif text-[26px] uppercase tracking-[.1em] text-[#f0e4c9]">Alchemy Bench</h1>
          <p className="mt-1 text-[12px] text-[#998f79]">
            Rehearsal for Eat It And See. Nothing is written unless you arm COMMIT.
          </p>
        </header>

        {err && (
          <div className="border border-[#7a2a1a] bg-[#1a0d0a] px-4 py-3 text-[13px] text-[#ffb4a0]">
            {err}
            {err.includes("DM only") && (
              <div className="mt-2 flex gap-2">
                <input
                  value={dmKey} onChange={(e) => setDmKey(e.target.value)} placeholder="DM access code"
                  className="flex-1 border border-[#4f4128] bg-[#090708] px-2 py-1 text-[12px]"
                />
                <button onClick={() => void load()} className="border border-[#6d5127] px-3 py-1 text-[11px] uppercase tracking-[.15em] text-[#d7b667]">
                  Unlock
                </button>
              </div>
            )}
          </div>
        )}

        {bench && (
          <>
            <div className="flex flex-wrap items-end gap-3 border border-[#3a2d1a] bg-[#0d0b08] p-4">
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-[.18em] text-[#8e7a50]">Character</span>
                <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}
                  className="border border-[#4f4128] bg-[#090708] px-2 py-1 text-[13px]">
                  {bench.characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} — {c.class} {c.level}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-[.18em] text-[#8e7a50]">Ingredient</span>
                <select value={slug} onChange={(e) => setSlug(e.target.value)}
                  className="border border-[#4f4128] bg-[#090708] px-2 py-1 text-[13px]">
                  {bench.ingredients.map((i) => (
                    <option key={i.slug} value={i.slug}>{i.name}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-[.18em] text-[#8e7a50]">Con save total</span>
                <div className="flex gap-1">
                  <input type="number" value={save} onChange={(e) => setSave(Number(e.target.value))}
                    className="w-20 border border-[#4f4128] bg-[#090708] px-2 py-1 text-[13px]" />
                  <button onClick={rollSave} title="d20 + this character's Con modifier"
                    className="border border-[#6d5127] px-2 text-[11px] uppercase tracking-[.12em] text-[#d7b667]">
                    Roll
                  </button>
                </div>
              </label>

              <label className="flex items-center gap-2 pb-1">
                <input type="checkbox" checked={commit} onChange={(e) => setCommit(e.target.checked)} />
                <span className={`text-[11px] uppercase tracking-[.15em] ${commit ? "text-[#ff6a4a]" : "text-[#766c5d]"}`}>
                  {commit ? "COMMIT — writes to the sheet" : "Rehearsal — writes nothing"}
                </span>
              </label>

              <button onClick={() => void doTaste()} disabled={busy}
                className="ml-auto border border-[#b78942] bg-[#1a1209] px-5 py-2 font-serif text-[13px] uppercase tracking-[.18em] text-[#f0cf76] disabled:opacity-40">
                Taste
              </button>
            </div>

            {ingredient && (
              <div className="border border-[#3a2d1a] bg-[#0d0b08] p-4">
                <div className="flex items-baseline gap-3">
                  <h2 className="font-serif text-[17px] text-[#f0e4c9]">{ingredient.name}</h2>
                  <code className="text-[10px] text-[#766c5d]">{ingredient.slug}</code>
                </div>
                {ingredient.description && (
                  <p className="mt-1 text-[12px] italic text-[#998f79]">{ingredient.description}</p>
                )}
                {ingredient.malformed || !ingredient.grid ? (
                  <p className="mt-3 text-[12px] text-[#ffb4a0]">This row&apos;s grid is malformed — four distinct effects expected.</p>
                ) : (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {ingredient.grid.map((e, idx) => {
                      const meta = effectsBySlug[e]
                      const tint = CAT_TINT[meta?.category ?? ""] ?? "#998f79"
                      return (
                        <div key={e} className="border border-[#2d2317] bg-[#090708] p-2"
                          style={idx === 0 ? { borderColor: tint } : undefined}>
                          <div className="text-[8px] uppercase tracking-[.16em] text-[#766c5d]">
                            {idx === 0 ? "col 1 — tasting" : `col ${idx + 1}`}
                          </div>
                          <div className="mt-1 text-[12px]" style={{ color: tint }}>{meta?.name ?? e}</div>
                          <div className="mt-1 text-[10px] leading-snug text-[#8b8271]">{meta?.summary ?? ""}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {log.map((r, i) => (
                <div key={i} className={`border p-3 text-[12px] ${r.sandbox ? "border-[#3a2d1a] bg-[#0d0b08]" : "border-[#7a5a1a] bg-[#150f06]"}`}>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-serif text-[13px] text-[#f0e4c9]">{r.character}</span>
                    <span className="text-[#998f79]">tastes</span>
                    <span className="font-serif text-[13px] text-[#f0e4c9]">{r.item}</span>
                    <span className={`ml-auto text-[9px] uppercase tracking-[.16em] ${r.sandbox ? "text-[#766c5d]" : "text-[#ff6a4a]"}`}>
                      {r.sandbox ? "rehearsal" : "committed"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4">
                    <Stat label="effect" value={r.effectName} tint={r.harmful ? "#ff4a12" : "#4ea8ff"} />
                    <Stat label={`save vs DC ${r.dc}`} value={r.resisted ? "resisted" : "failed"} tint={r.resisted ? "#9fcf3a" : "#ff4a12"} />
                    <Stat label="learned" value={r.revealed ? "yes — column 1" : "already knew it"} tint={r.revealed ? "#ffd24a" : "#766c5d"} />
                    <Stat label="applied" value={r.applied ? `${r.applied.effect} tier ${r.applied.tier}` : "nothing"} tint={r.applied ? "#ff4a12" : "#766c5d"} />
                    <Stat label="still hidden" value={r.stillUnknown.length ? `cols ${r.stillUnknown.join(", ")}` : "none"} tint="#998f79" />
                  </div>
                  <p className="mt-2 text-[11px] italic text-[#8b8271]">{r.summary}</p>
                </div>
              ))}
              {log.length === 0 && (
                <p className="text-[12px] text-[#766c5d]">
                  {bench.counts.ingredients} ingredients, {bench.counts.effects} effects
                  {bench.counts.malformed > 0 && ` — ${bench.counts.malformed} malformed`}. Taste something.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-[.16em] text-[#766c5d]">{label}</div>
      <div className="text-[12px]" style={{ color: tint }}>{value}</div>
    </div>
  )
}
