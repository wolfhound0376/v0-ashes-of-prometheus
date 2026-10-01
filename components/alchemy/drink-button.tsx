"use client"

// "Drink" on an inventory row, so a drink or a brewed flask can be drunk
// anywhere, not only at the camp bench (Sam, 2026-10-01: "you can drink this
// even when out of combat"). The rules are the routes': /api/alchemy/quaff for
// beer, wine and liquor, /api/alchemy/drink for a brewed potion. The dice are
// the board's; nothing here rolls on its own.

import { useCallback, useEffect, useState } from "react"
import { useDice, parseDamage } from "@/components/dice/dice-provider"

type Kind = "drink" | "flask"

/** Which inventory rows can be drunk, read once from the player's bench view. */
export function useDrinkables(characterId: string | null | undefined, refreshKey?: unknown) {
  const [map, setMap] = useState<Map<string, Kind>>(new Map())
  const [conMod, setConMod] = useState(0)
  const load = useCallback(async () => {
    if (!characterId) return
    try {
      const r = await fetch(`/api/alchemy/pack?characterId=${encodeURIComponent(characterId)}`, { cache: "no-store" })
      if (!r.ok) return
      const b = (await r.json()) as { drinks?: { id: string }[]; flasks?: { id: string }[]; rolls?: { taste?: { modifier?: number } } }
      const m = new Map<string, Kind>()
      for (const d of b.drinks ?? []) m.set(d.id, "drink")
      for (const f of b.flasks ?? []) m.set(f.id, "flask")
      setMap(m)
      setConMod(Number(b.rolls?.taste?.modifier ?? 0))
    } catch {
      /* the button simply does not appear */
    }
  }, [characterId])
  useEffect(() => { void load() }, [load, refreshKey])
  return { kindOf: (id: string) => map.get(id) ?? null, conMod, reload: load }
}

export function DrinkButton({
  characterId, itemId, itemName, kind, conMod, onDone,
}: {
  characterId: string; itemId: string; itemName: string; kind: Kind; conMod: number
  onDone?: (summary: string) => void
}) {
  const { roll } = useDice()
  const [busy, setBusy] = useState(false)

  async function go() {
    if (busy) return
    setBusy(true)
    try {
      if (kind === "drink") {
        const pre = await fetch(`/api/alchemy/quaff?characterId=${encodeURIComponent(characterId)}&inventoryItemId=${encodeURIComponent(itemId)}`, { cache: "no-store" })
        const plan = await pre.json()
        if (!pre.ok) return onDone?.(plan.error ?? "It will not open.")
        const save = (await roll({ die: "d20", numDice: 1, modifier: conMod, label: `CON save vs DC ${plan.save.dc} (${itemName})` })).total
        const res = await fetch("/api/alchemy/quaff", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId, inventoryItemId: itemId, save }),
        })
        const body = await res.json()
        onDone?.(res.ok ? `${itemName}: ${body.summary}` : body.error ?? "It would not go down.")
      } else {
        const pre = await fetch(`/api/alchemy/drink?characterId=${encodeURIComponent(characterId)}&inventoryItemId=${encodeURIComponent(itemId)}`, { cache: "no-store" })
        const plan = await pre.json()
        if (!pre.ok) return onDone?.(plan.error ?? "That flask will not open.")
        const totals: { heal?: number; harm?: number; save?: number } = {}
        if (plan.roll?.heal) { const s = parseDamage(plan.roll.heal, "Healing"); if (s) totals.heal = (await roll(s)).total }
        if (plan.roll?.harm?.dice) { const s = parseDamage(plan.roll.harm.dice, `${plan.roll.harm.type} damage`); if (s) totals.harm = (await roll(s)).total }
        if (plan.roll?.save) totals.save = (await roll({ die: "d20", numDice: 1, modifier: conMod, label: `CON save vs DC ${plan.roll.save.dc}` })).total
        const res = await fetch("/api/alchemy/drink", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId, inventoryItemId: itemId, ...totals }),
        })
        const body = await res.json()
        onDone?.(res.ok ? body.summary : body.error ?? "It would not go down.")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); void go() }}
      disabled={busy}
      title={kind === "drink" ? `Drink ${itemName} — CON save against its proof` : `Drink ${itemName}`}
      className="rounded border border-[#8a672d] px-2 py-1 text-[9px] text-[#d8b873] hover:bg-[#2a1e0d] disabled:opacity-50"
    >
      {busy ? "…" : "Drink"}
    </button>
  )
}
