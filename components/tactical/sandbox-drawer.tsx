"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

// ============================================================================
// THE STAGE DOOR — putting things on the rehearsal board.
//
// Sam: "we need a sandbox where we can take various monsters, we can select
// items, 3d objects, NPCs, characters, and a handful of environments to try
// out interactions and sounds."
//
// The rehearsal board has existed for a while. Nothing could be put on it: no
// screen in this app spawns a token, so trying a hook horror against the party
// meant writing an INSERT by hand. This drawer is the door.
//
// IT DOES NOT TOUCH THE BOARD FILE. Not one line.
//
// That is a deliberate architectural choice, not a coincidence. Three other
// live branches are inside combat-board-3d.tsx right now (pick-it-up,
// board-declutter, board-says-why), and a fourth edit to a 5,000-line file
// four sessions are already fighting over would cost more in merge pain than
// the feature is worth.
//
// It works because the board is ALREADY subscribed to vtt_tokens on its own
// map. Spawn a row through /api/sandbox and the board's own realtime handler
// glides it in, exactly as if a drow had walked there. Remove one and its
// DELETE branch takes it away. The drawer never needs to speak to the board,
// only to the database they both watch.
//
// Mounted from app/battle/page.tsx, only when ?sandbox=1.
// ============================================================================

type Tab = "bestiary" | "npcs" | "characters" | "scene"

interface Roster {
  map: { id: string; name: string; grid_width: number; grid_height: number; environment_id: string | null }
  bestiary: Array<{ id: string; name: string; size: string | null; cr: string | null; hp: number | null; ac: number | null; role: string | null; model_url: string | null }>
  npcs: Array<{ id: string; name: string; hp_max: number | null; challenge_rating: string | null; monster_type: string | null; disposition: string | null; bestiary_id: string | null; character_id: string | null }>
  characters: Array<{ id: string; name: string; class: string | null; level: number | null; hp_max: number | null; character_type: string | null }>
  environments: Array<{ id: string; name: string; scene_key: string | null; time_of_day: string | null }>
  tokens: Array<{ id: string; label: string; grid_x: number; grid_y: number; token_size: string | null; allegiance: string | null; hp_current: number | null; hp_max: number | null; updated_by: string | null }>
}

const GOLD = "#f0cd7a"
const SIDE_TINT: Record<string, string> = {
  party: "#5fd3a0", ally: "#7fb2ff", hostile: "#e0654f",
}
const SIDES = ["party", "ally", "hostile"] as const
type Side = typeof SIDES[number]

/**
 * Which side a creature is on, from its bestiary role — the same rule the
 * server applies, so the dot you see before you click is the side you get.
 *
 * Only "ally/prisoner" is an ally. 18 of the 43 bestiary rows are, because
 * this bestiary holds the whole Velkynvelve cast and not just its monsters.
 */
const sideForRole = (role: string | null | undefined): Side =>
  (role ?? "").trim().toLowerCase() === "ally/prisoner" ? "ally" : "hostile"

export default function SandboxDrawer() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>("bestiary")
  const [roster, setRoster] = useState<Roster | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [q, setQ] = useState("")
  // Where the next spawn lands. Null means "the middle" — the server clamps
  // and searches outward from whatever it is given, so this is a hint rather
  // than a demand.
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  // Null means "whatever the catalogue says". Setting it is how you find out
  // what a drow fighting FOR you looks like.
  const [side, setSide] = useState<Side | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sandbox", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) { setNote(json?.error ?? "could not read the roster"); return }
      setRoster(json as Roster)
    } catch { setNote("could not reach the sandbox") }
  }, [])

  useEffect(() => { if (open && !roster) void load() }, [open, roster, load])

  const post = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setNote(null)
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      // Say what went wrong, in the words the server used. A drawer that
      // fails silently is how you end up clicking a monster six times and
      // wondering why the board is empty.
      if (!res.ok) { setNote(json?.error ?? "refused"); return null }
      await load()
      return json
    } catch { setNote("network"); return null } finally { setBusy(false) }
  }, [load])

  const spawn = (kind: "bestiary" | "npc" | "character", id: string, label: string) =>
    void post({ action: "spawn", kind, source_id: id, grid_x: at?.x, grid_y: at?.y, allegiance: side ?? undefined })
      .then((r) => { if (r) setNote(`${label} → ${r.grid_x},${r.grid_y}`) })

  const w = roster?.map.grid_width ?? 12
  const h = roster?.map.grid_height ?? 12
  const occupied = useMemo(() => {
    const m = new Map<string, Roster["tokens"][number]>()
    for (const t of roster?.tokens ?? []) m.set(`${t.grid_x},${t.grid_y}`, t)
    return m
  }, [roster])

  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase())

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute left-0 top-1/2 z-40 -translate-y-1/2 rounded-r border border-l-0 border-[#7a5c2b] bg-[#2a1f10]/95 px-2 py-6 font-serif text-[10px] uppercase tracking-[0.3em] text-[#f0cd7a] [writing-mode:vertical-rl] hover:bg-[#3a2c16]"
        title="Open the stage door"
      >
        Stage&nbsp;Door
      </button>
    )
  }

  return (
    <div className="absolute left-0 top-0 z-40 flex h-full w-[380px] flex-col border-r border-[#6a512c] bg-[linear-gradient(180deg,rgba(16,12,15,.985),rgba(5,4,7,.985))] shadow-[8px_0_28px_#000a]">
      {/* header */}
      <div className="flex items-center justify-between border-b border-[#3a2c16] px-3 py-2">
        <div className="font-serif text-[11px] uppercase tracking-[0.3em]" style={{ color: GOLD }}>
          Stage Door
        </div>
        <button onClick={() => setOpen(false)} className="px-2 font-serif text-[13px] text-[#8a7952] hover:text-[#f0cd7a]">×</button>
      </div>

      {/* tabs */}
      <div className="flex border-b border-[#3a2c16]">
        {([["bestiary", "Monsters"], ["npcs", "NPCs"], ["characters", "Cast"], ["scene", "Scene"]] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 py-1.5 font-serif text-[9px] uppercase tracking-[0.2em] ${tab === k ? "bg-[#2a1f10] text-[#f0cd7a]" : "text-[#7d6c48] hover:text-[#bda468]"}`}
          >{label}</button>
        ))}
      </div>

      {/* where it lands */}
      {tab !== "scene" && (
        <div className="border-b border-[#3a2c16] px-3 py-2">
          <div className="mb-1 flex items-baseline justify-between font-serif text-[8px] uppercase tracking-[0.2em] text-[#7d6c48]">
            <span>Drop it here</span>
            <span className="text-[#5c4f36]">{at ? `${at.x},${at.y}` : "middle"}</span>
          </div>
          {/*
            A picture of the floor, not a pair of number boxes. The squares
            that are taken are shown taken, so "put it next to Scott" is a
            click rather than arithmetic — and the server still searches
            outward from wherever this lands, so a near miss is fine.
          */}
          <div className="grid gap-[1px]" style={{ gridTemplateColumns: `repeat(${w}, minmax(0,1fr))` }}>
            {Array.from({ length: w * h }, (_, i) => {
              const x = i % w, y = Math.floor(i / w)
              const t = occupied.get(`${x},${y}`)
              const here = at?.x === x && at?.y === y
              return (
                <button
                  key={i}
                  title={t ? `${t.label} (${t.hp_current ?? "?"}/${t.hp_max ?? "?"})` : `${x},${y}`}
                  onClick={() => setAt(here ? null : { x, y })}
                  className="aspect-square border-[0.5px] border-[#2a2118]"
                  style={{
                    background: t ? (SIDE_TINT[t.allegiance ?? ""] ?? "#8a7952") : here ? GOLD : "#120e09",
                    opacity: t ? 0.85 : 1,
                    outline: here ? `1px solid ${GOLD}` : undefined,
                  }}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* which side */}
      {tab !== "scene" && (
        <div className="flex items-center gap-1 border-b border-[#3a2c16] px-3 py-1.5">
          <span className="mr-1 font-serif text-[8px] uppercase tracking-[0.2em] text-[#7d6c48]">Side</span>
          <button
            onClick={() => setSide(null)}
            className={`border px-1.5 py-0.5 font-serif text-[9px] ${side === null ? "border-[#f0cd7a] text-[#f0cd7a]" : "border-[#3a2c16] text-[#6a5a3c]"}`}
            title="Use whatever the catalogue says"
          >auto</button>
          {SIDES.map((sd) => (
            <button
              key={sd}
              onClick={() => setSide(sd)}
              className={`border px-1.5 py-0.5 font-serif text-[9px] capitalize ${side === sd ? "" : "border-[#3a2c16] text-[#6a5a3c]"}`}
              style={side === sd ? { borderColor: SIDE_TINT[sd], color: SIDE_TINT[sd] } : undefined}
            >{sd}</button>
          ))}
        </div>
      )}

      {/* search */}
      {tab !== "scene" && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search…"
          className="border-b border-[#3a2c16] bg-transparent px-3 py-1.5 font-serif text-[11px] text-[#e6d6ac] outline-none placeholder:text-[#5c4f36]"
        />
      )}

      {/* the roster */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!roster && <div className="p-3 font-serif text-[10px] text-[#7d6c48]">reading the roster…</div>}

        {roster && tab === "bestiary" && roster.bestiary.filter((b) => match(b.name)).map((b) => (
          <Row
            key={b.id}
            title={b.name}
            sub={[b.size, b.cr ? `CR ${b.cr}` : null, b.hp ? `${b.hp} hp` : null, b.ac ? `AC ${b.ac}` : null].filter(Boolean).join(" · ")}
            // The one thing worth knowing before you place it: 34 of the 43
            // creatures have no model and will stand there as a pawn. Better
            // said on the button than discovered on the board.
            flag={b.model_url ? null : "pawn"}
            // The dot is the side it will actually land on, worked out by the
            // same rule the server uses. Discovering that a hook horror came
            // in as an ally three turns into a rehearsal is the whole reason
            // this is on the button.
            side={side ?? sideForRole(b.role)}
            disabled={busy}
            onClick={() => spawn("bestiary", b.id, b.name)}
          />
        ))}

        {roster && tab === "npcs" && roster.npcs.filter((n) => match(n.name)).map((n) => (
          <Row
            key={n.id}
            title={n.name}
            sub={[n.monster_type, n.challenge_rating ? `CR ${n.challenge_rating}` : null, n.hp_max ? `${n.hp_max} hp` : null].filter(Boolean).join(" · ")}
            // An NPC with neither a character nor a species cannot stand on a
            // square - Malachar is the only one, and he is the DM.
            flag={n.bestiary_id || n.character_id ? null : "no body"}
            side={side ?? undefined}
            disabled={busy || (!n.bestiary_id && !n.character_id)}
            onClick={() => spawn("npc", n.id, n.name)}
          />
        ))}

        {roster && tab === "characters" && roster.characters.filter((c) => match(c.name)).map((c) => (
          <Row
            key={c.id}
            title={c.name}
            sub={[c.class, c.level ? `lvl ${c.level}` : null, c.hp_max ? `${c.hp_max} hp` : null, c.character_type !== "player" ? c.character_type : null].filter(Boolean).join(" · ")}
            side={side ?? (c.character_type === "player" ? "party" : undefined)}
            disabled={busy}
            onClick={() => spawn("character", c.id, c.name)}
          />
        ))}

        {roster && tab === "scene" && (
          <>
            <Row
              title="No dressing"
              sub="the board's own default"
              active={!roster.map.environment_id}
              disabled={busy}
              onClick={() => void post({ action: "scene", environment_id: null })}
            />
            {roster.environments.map((e) => (
              <Row
                key={e.id}
                title={e.name}
                sub={[e.time_of_day, e.scene_key].filter(Boolean).join(" · ")}
                active={roster.map.environment_id === e.id}
                disabled={busy}
                onClick={() => void post({ action: "scene", environment_id: e.id })}
              />
            ))}
          </>
        )}
      </div>

      {/* what is standing there */}
      {roster && (
        <div className="max-h-[26%] shrink-0 overflow-y-auto border-t border-[#3a2c16]">
          <div className="px-3 pt-2 font-serif text-[8px] uppercase tracking-[0.2em] text-[#7d6c48]">
            On the board — {roster.tokens.length}
          </div>
          {roster.tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-1">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SIDE_TINT[t.allegiance ?? ""] ?? "#8a7952" }} />
              <span className="min-w-0 flex-1 truncate font-serif text-[11px] text-[#cbbb92]">{t.label}</span>
              <span className="font-mono text-[9px] text-[#5c4f36]">{t.grid_x},{t.grid_y}</span>
              <button
                disabled={busy}
                onClick={() => void post({ action: "remove", token_id: t.id })}
                className="px-1 font-serif text-[11px] text-[#6a5a3c] hover:text-[#e0654f]"
                title="take it off the board"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* footer */}
      <div className="flex items-center justify-between gap-2 border-t border-[#3a2c16] px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-serif text-[9px] text-[#7d6c48]">{note ?? "nothing here is canon"}</span>
        {/*
          BACK ON YOUR FEET. Sam, after the first trial: "Should be able to
          restart stats to full on all creatures" — and the board proved the
          point, with all four players sitting at 0 and two of them holding
          death-save tallies. A rehearsal room you can only use once is not a
          rehearsal room.
        */}
        <button
          disabled={busy}
          onClick={() => void post({ action: "reset" }).then((r) => {
            if (!r) return
            // SAY IT WHEN IT ONLY HALF WORKED. The first version printed
            // "healed 6" whether or not the character sheets had been
            // written, so a reset that left everyone unconscious with their
            // actions spent looked exactly like one that worked.
            if (Array.isArray(r.failures) && r.failures.length) {
              setNote(`healed ${r.healed}, but ${r.failures.length} refused — ${String(r.failures[0])}`)
              return
            }
            setNote(`healed ${r.healed}, ${r.sheets} sheets${r.slotsRestored ? `, ${r.slotsRestored} slots` : ""}${r.combatEnded ? ", fight ended" : ""}`)
          })}
          className="shrink-0 border border-[#5a4526] px-2 py-1 font-serif text-[9px] uppercase tracking-[0.2em] text-[#a08a5c] hover:border-[#5fd3a0] hover:text-[#5fd3a0]"
          title="Every creature here back to full hit points, slots and conditions — and any fight ended"
        >Reset</button>
        <button
          disabled={busy}
          onClick={() => void post({ action: "clear" }).then((r) => { if (r) setNote(`swept ${r.removed}`) })}
          className="shrink-0 border border-[#5a4526] px-2 py-1 font-serif text-[9px] uppercase tracking-[0.2em] text-[#a08a5c] hover:border-[#a94a3a] hover:text-[#e0654f]"
          // Only what this drawer put there. The eight hand-seeded tokens on
          // the sandbox map survive a sweep, which is what makes the button
          // safe to press without reading it twice.
          title="Remove everything spawned from this drawer"
        >Sweep</button>
      </div>
    </div>
  )
}

function Row({ title, sub, onClick, disabled, active, flag, side }: {
  title: string; sub?: string; onClick: () => void; disabled?: boolean; active?: boolean
  flag?: string | null; side?: Side
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-baseline gap-2 border-b border-[#241b12] px-3 py-1.5 text-left disabled:opacity-40 ${active ? "bg-[#2a1f10]" : "hover:bg-[#1c1610]"}`}
    >
      {side && (
        <span
          className="h-2 w-2 shrink-0 self-center rounded-full"
          style={{ background: SIDE_TINT[side] }}
          title={`spawns ${side}`}
        />
      )}
      <span className="min-w-0 flex-1 truncate font-serif text-[12px] text-[#e6d6ac]">{title}</span>
      {flag && <span className="shrink-0 font-serif text-[8px] uppercase tracking-[0.15em] text-[#6a5a3c]">{flag}</span>}
      {sub && <span className="shrink-0 font-serif text-[9px] text-[#7d6c48]">{sub}</span>}
    </button>
  )
}
