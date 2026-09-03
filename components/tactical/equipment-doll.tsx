"use client"

import { useCallback, useEffect, useState } from "react"
import { HAND_SLOTS } from "@/lib/equipped"

// ============================================================================
// THE DOLL — what you are holding, and the two clicks that change it.
//
// Sam: "Doll sheet should migrate from dashboard UI in the expandible sheet
// and permit me to equip the dagger or unequip it. These do take an action
// though."
//
// It replaces a panel that read "Equipment and proficiencies remain live from
// the character record" — a sentence standing where a feature should be.
//
// IT MATTERS BECAUSE ATTACK READS IT. Since lib/equipped, the rack no longer
// lists every carried weapon: "Attack" swings whatever is in the main hand.
// So this panel is not an inventory display, it is the weapon selector — the
// only place the answer to "what does Attack do" is chosen.
//
// THE COST IS SHOWN BEFORE IT IS PAID. A swap is two object interactions
// (sheathe one, draw the other), so mid-fight it costs the free interaction
// AND the action. A player about to spend their whole turn re-arming should
// know that from the button, not from the log afterwards.
// ============================================================================

interface DollRow { id?: string; slot: string; item_key: string | null; name: string; icon_url?: string | null; equipped?: boolean | null }
interface PackRow {
  id: string; name: string; item_key: string | null; item_type?: string | null
  equippable_slot?: string | null; icon_url?: string | null
  items?: { equippable_slot?: string | null } | null
}

const SLOT_LABEL: Record<string, string> = { main_hand: "Main hand", off_hand: "Off hand" }

export default function EquipmentDoll({ characterId, accent, onChanged }: {
  characterId: string
  accent: string
  onChanged?: () => void
}) {
  const [doll, setDoll] = useState<DollRow[]>([])
  const [pack, setPack] = useState<PackRow[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/equipment?character_id=${encodeURIComponent(characterId)}`, { cache: "no-store" })
      const j = await res.json()
      if (!res.ok) { setNote(j?.error ?? "could not read your gear"); return }
      setDoll(j.equipped ?? [])
      setPack(j.carried ?? [])
    } catch { setNote("could not reach the server") }
  }, [characterId])

  useEffect(() => { void load() }, [load])

  const post = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setNote(null)
    try {
      const res = await fetch("/api/equipment", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, character_id: characterId }),
      })
      const j = await res.json()
      // The server's own words. A refusal here is a RULE — "nothing left this
      // turn to reach for your gear with" — and paraphrasing it would lose
      // the reason.
      if (!res.ok) { setNote(j?.error ?? "refused"); return }
      await load()
      onChanged?.()
      setNote(j.replaced
        ? `Sheathed ${j.replaced}, drew ${j.equipped}${j.cost === "action" ? " — action spent" : ""}`
        : j.equipped ? `Drew ${j.equipped}${j.cost === "action" ? " — action spent" : ""}`
        : `Put away ${j.unequipped}${j.cost === "action" ? " — action spent" : ""}`)
    } catch { setNote("network") } finally { setBusy(false) }
  }, [characterId, load, onChanged])

  const slotOf = (r: PackRow) => (r.equippable_slot ?? r.items?.equippable_slot ?? "").toLowerCase()
  // Only weapons, and only the hands: armour and the rest are not yet wired to
  // anything that reads them, and offering a button that changes no rule is
  // worse than not offering it.
  const holdable = pack.filter((r) => HAND_SLOTS.includes(slotOf(r) as (typeof HAND_SLOTS)[number]))

  return (
    <div className="px-2 py-2">
      <div className="grid grid-cols-2 gap-2">
        {HAND_SLOTS.map((slot) => {
          const held = doll.find((d) => d.slot === slot && d.equipped !== false)
          return (
            <div key={slot} className="border border-[#4c3a20] bg-[#0a0708] px-2 py-2">
              <div className="text-[7px] uppercase tracking-[.18em] text-[#8e7a50]">{SLOT_LABEL[slot]}</div>
              {held ? (
                <>
                  <div className="mt-1 truncate font-serif text-[13px] text-[#e3d3af]">{held.name}</div>
                  <button
                    disabled={busy}
                    onClick={() => void post({ action: "unequip", slot })}
                    className="mt-1 w-full border border-[#5a4526] px-1 py-[2px] font-serif text-[8px] uppercase tracking-[.16em] text-[#a08a5c] hover:border-[#a94a3a] hover:text-[#e0654f] disabled:opacity-40"
                  >Put away</button>
                </>
              ) : (
                <div className="mt-1 font-serif text-[12px] italic text-[#6f6553]">empty</div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-2 text-[7px] uppercase tracking-[.18em] text-[#8e7a50]">Carried</div>
      {holdable.length === 0 && (
        <div className="py-2 font-serif text-[10px] italic text-[#6f6553]">Nothing you can hold.</div>
      )}
      {holdable.map((r) => {
        const inHand = doll.some((d) => d.equipped !== false && (d.item_key ? d.item_key === r.item_key : d.name === r.name))
        const slot = slotOf(r)
        const occupied = doll.some((d) => d.slot === slot && d.equipped !== false)
        return (
          <button
            key={r.id}
            disabled={busy || inHand}
            onClick={() => void post({ action: "equip", slot, item_key: r.item_key })}
            className="flex w-full items-center gap-2 border-b border-[#2d2317] px-1 py-[5px] text-left last:border-0 hover:bg-[#1c1610] disabled:opacity-40"
            // Two interactions when something has to come off first, so a
            // mid-fight swap costs the whole turn. Said on the button.
            title={inHand ? "already in hand" : occupied ? "a swap costs two interactions — the free one and your action" : "one free object interaction"}
          >
            <span className="min-w-0 flex-1 truncate font-serif text-[11px] text-[#cbbb92]">{r.name}</span>
            <span className="shrink-0 font-serif text-[8px] uppercase tracking-[.14em]" style={{ color: inHand ? accent : "#6a5a3c" }}>
              {inHand ? "held" : occupied ? "swap" : "draw"}
            </span>
          </button>
        )
      })}

      <div className="mt-2 min-h-[13px] font-serif text-[9px] text-[#8a7952]">{note}</div>
    </div>
  )
}
