"use client"

// DM-only HEAL / DMG controls. These used to sit beside the HP bar on the
// player dashboard, where any player could press them. Writes go through
// /api/dm/characters, which re-checks DM_ACCESS_CODE server-side.

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { dmHeaders } from "@/lib/dm-key"

type HpRow = {
  id: string
  name: string
  class: string | null
  hp_current: number | null
  hp_max: number | null
  sheet_hp_temp: number | null
}

export function HitPointsTab() {
  const [rows, setRows] = useState<HpRow[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("characters")
      .select("id, name, class, hp_current, hp_max, sheet_hp_temp")
      .eq("is_player", true)
      .is("archived_at", null)
      .order("name")
    if (error) setMessage(error.message)
    setRows((data as HpRow[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function apply(row: HpRow, mode: "heal" | "damage") {
    const amount = Math.floor(Number(amounts[row.id] ?? "1"))
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter a whole number above 0.")
      return
    }
    const max = row.hp_max ?? 0
    const current = row.hp_current ?? 0
    const temp = row.sheet_hp_temp ?? 0
    const patch: Record<string, number> = {}
    if (mode === "heal") {
      patch.hp_current = Math.min(max, current + amount)
    } else {
      const absorbed = Math.min(temp, amount)
      if (temp > 0) patch.sheet_hp_temp = temp - absorbed
      patch.hp_current = Math.max(0, current - (amount - absorbed))
    }

    setBusyId(row.id)
    setMessage(null)
    try {
      const res = await fetch("/api/dm/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...dmHeaders() },
        body: JSON.stringify({ action: "update", id: row.id, patch }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setMessage(res.status === 403 ? "DM code missing or wrong — save it above." : body.error ?? "Update failed.")
        return
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)))
      setMessage(`${row.name} ${mode === "heal" ? "healed" : "took"} ${amount}${mode === "heal" ? "" : " damage"}.`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      {message && <p className="mb-3 text-xs text-[#d9c79c]" role="status">{message}</p>}
      {loading ? (
        <p className="text-xs text-stone-500">Loading party…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-stone-500">No player characters found.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const max = row.hp_max ?? 0
            const current = row.hp_current ?? 0
            const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0
            const busy = busyId === row.id
            return (
              <li key={row.id} className="flex items-center gap-3 rounded-sm border border-[#3d3428] bg-[#0f0d0b] px-3 py-2.5">
                <div className="w-32 shrink-0">
                  <b className="block truncate font-serif text-sm text-[#e8dcc4]">{row.name}</b>
                  <span className="text-[10px] uppercase tracking-wider text-stone-500">{row.class ?? "—"}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs text-[#ddd2bc]">
                    HP {current} / {max}
                    {row.sheet_hp_temp ? <span className="text-stone-500"> · +{row.sheet_hp_temp} temp</span> : null}
                  </span>
                  <div className="h-2 bg-[#281315]"><div className="h-full bg-[#bd3039]" style={{ width: `${pct}%` }} /></div>
                </div>
                <label className="sr-only" htmlFor={`hp-amount-${row.id}`}>Amount for {row.name}</label>
                <input
                  id={`hp-amount-${row.id}`}
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={amounts[row.id] ?? "1"}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  className="w-14 rounded-sm border border-[#3d3428] bg-[#0a0806] px-2 py-1 text-center text-xs text-[#e8dcc4] focus:border-[#c4a777]/60 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => apply(row, "heal")}
                  className="rounded border border-[#4b3a19] px-3 py-1 text-[11px] uppercase tracking-wider text-[#d9c79c] hover:border-[#c9a868] hover:text-white disabled:opacity-50"
                >
                  Heal
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => apply(row, "damage")}
                  className="rounded border border-[#6b2226] px-3 py-1 text-[11px] uppercase tracking-wider text-[#e0a0a0] hover:border-[#bd3039] hover:text-white disabled:opacity-50"
                >
                  Dmg
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
