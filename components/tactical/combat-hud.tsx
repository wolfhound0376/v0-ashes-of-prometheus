"use client"

// ============================================================================
// THE COMBAT HUD — the frame around the battlefield.
//
// Built to Sam's reference image. What that image gets right, and what this
// reproduces, is that the CHROME carries the premium feel: unit plates down
// the left, an initiative rail of portraits across the top, a combat log and
// a carved END TURN down the right, and the globes and ability bar along the
// bottom. The battlefield inside the frame is the real V5 tile.
//
// Every number here is live. HP from the token rows, AC/level/speed from the
// character sheets, spell slots from sheet_spellcasting.slots, and the
// ability bar from each caster's ACTUAL cantrips and prepared spells — not
// decorative icons. A HUD that lies about the sheet is worse than no HUD.
// ============================================================================

import { useEffect, useMemo, useState } from "react"

export interface HudCharacter {
  id: string
  name: string
  class: string | null
  level: number | null
  ac: number | null
  hp_current: number | null
  hp_max: number | null
  speed: string | null
  proficiency_bonus: number | null
  portrait_image_url: string | null
  dex_modifier: number | null
  sheet_spellcasting: {
    slots?: Record<string, { max?: number; used?: number }>
    cantrips?: string[]
    prepared?: string[]
    save_dc?: number
    attack_bonus?: number
  } | null
}

export interface HudTurn {
  token_id: string
  label: string
  kind: "pc" | "npc"
  dex_mod: number
  roll: number
  total: number
}

export interface HudLogLine {
  id: string
  speaker: string
  text: string
}

interface Props {
  characters: HudCharacter[]
  /** token_id → character_id, so the initiative rail can find portraits. */
  tokenToCharacter: Record<string, string>
  turnOrder: HudTurn[]
  activeIndex: number
  round: number
  log: HudLogLine[]
  dm: boolean
  onEndTurn: () => void
  /** The character whose plate is "focused" — drives globes and ability bar. */
  focusId: string | null
  onFocus: (id: string) => void
}

/** Slot totals across every level, which is what a single globe can honestly show. */
function slotTally(c: HudCharacter): { used: number; max: number } | null {
  const slots = c.sheet_spellcasting?.slots
  if (!slots) return null
  let used = 0
  let max = 0
  for (const entry of Object.values(slots)) {
    max += entry?.max ?? 0
    used += entry?.used ?? 0
  }
  return max > 0 ? { used, max } : null
}

const CLASS_GLYPH: Record<string, string> = {
  cleric: "✧", rogue: "🗡", sorcerer: "✦", wizard: "✦", bard: "♪",
  fighter: "⚔", paladin: "✝", ranger: "➶", warlock: "◈", barbarian: "⚒",
  druid: "❋", monk: "☯",
}

export function CombatHud(props: Props) {
  const { characters, tokenToCharacter, turnOrder, activeIndex, round, log, dm, onEndTurn, focusId, onFocus } = props
  const [expanded, setExpanded] = useState<string | null>(null)
  const [ability, setAbility] = useState<string | null>(null)

  const focus = useMemo(
    () => characters.find((c) => c.id === focusId) ?? characters[0] ?? null,
    [characters, focusId],
  )

  // The ability bar is the focused caster's real spells: cantrips first (always
  // available), then prepared. A martial with neither simply gets an empty rack
  // rather than invented buttons.
  const abilities = useMemo(() => {
    const sc = focus?.sheet_spellcasting
    const cantrips = (sc?.cantrips ?? []).map((n) => ({ name: n, kind: "cantrip" as const }))
    const prepared = (sc?.prepared ?? []).map((n) => ({ name: n, kind: "prepared" as const }))
    return [...cantrips, ...prepared].slice(0, 10)
  }, [focus])

  useEffect(() => { setAbility(null) }, [focusId])

  const hpFrac = (c: HudCharacter) =>
    c.hp_max && c.hp_max > 0 ? Math.max(0, Math.min(1, (c.hp_current ?? c.hp_max) / c.hp_max)) : 0
  const hpColour = (f: number) => (f > 0.5 ? "#7a1410" : f > 0.25 ? "#8a5410" : "#5a0d08")

  const tally = focus ? slotTally(focus) : null

  return (
    <>
      {/* ─── LEFT: unit plates ─────────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 flex w-[190px] flex-col gap-2">
        {characters.map((c) => {
          const frac = hpFrac(c)
          const open = expanded === c.id
          const focused = focus?.id === c.id
          return (
            <button
              key={c.id}
              onMouseEnter={() => setExpanded(c.id)}
              onMouseLeave={() => setExpanded(null)}
              onClick={() => onFocus(c.id)}
              className={
                "pointer-events-auto overflow-hidden rounded-sm border text-left transition-colors " +
                (focused ? "border-[#a88745] bg-[#14100a]/95" : "border-[#3a2f1e] bg-[#0c0a06]/90 hover:border-[#6b5123]")
              }
              style={{ boxShadow: focused ? "0 0 18px #00000099, inset 0 0 24px #c9a2270f" : "0 0 14px #000000aa" }}
            >
              <div className="flex gap-2 p-2">
                {/* Portrait: a carved frame, or the class glyph when the sheet has no art. */}
                <div className="relative h-[54px] w-[46px] shrink-0 overflow-hidden rounded-[2px] border border-[#4a3a1e] bg-gradient-to-b from-[#241a0c] to-[#0a0805]">
                  {c.portrait_image_url ? (
                    <img src={c.portrait_image_url} alt="" className="h-full w-full object-cover object-top" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-[20px] text-[#6b5a34]">
                      {CLASS_GLYPH[(c.class ?? "").toLowerCase()] ?? "✧"}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-serif text-[12px] uppercase tracking-[0.1em] text-[#e8dcc0]">{c.name}</div>
                  <div className="truncate text-[9px] uppercase tracking-wider text-[#8a7952]">{c.class ?? "Adventurer"}</div>

                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-serif text-[10px] text-[#c9bca0]">HP</span>
                    <span className="font-serif text-[11px] font-semibold text-[#f0e6cc]">
                      {c.hp_current ?? c.hp_max ?? "—"} <span className="text-[#7a6c50]">/ {c.hp_max ?? "—"}</span>
                    </span>
                  </div>
                  {/* The bar is thin on purpose: a plate, not a form. */}
                  <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-sm bg-[#1a0e0a]">
                    <div className="h-full transition-[width] duration-300" style={{ width: `${frac * 100}%`, background: `linear-gradient(90deg, ${hpColour(frac)}, #c23b2e)` }} />
                  </div>
                </div>
              </div>

              {/* Three numbers, evenly weighted — AC, INIT, LVL. */}
              <div className="flex border-t border-[#2a2216] text-center">
                {[
                  ["AC", c.ac ?? "—"],
                  ["INIT", c.dex_modifier == null ? "—" : `${c.dex_modifier >= 0 ? "+" : ""}${c.dex_modifier}`],
                  ["LVL", c.level ?? "—"],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex-1 py-1">
                    <div className="text-[7px] uppercase tracking-[0.16em] text-[#6b5a34]">{label}</div>
                    <div className="font-serif text-[11px] text-[#e0d2ae]">{value}</div>
                  </div>
                ))}
              </div>

              {/* Everything else waits for a hover, so the collapsed plate stays clean. */}
              {open && (
                <div className="border-t border-[#2a2216] bg-black/40 px-2 py-1.5 text-[9px] leading-relaxed text-[#a89468]">
                  <div>Speed <span className="text-[#e0d2ae]">{c.speed ?? "—"}</span></div>
                  <div>Proficiency <span className="text-[#e0d2ae]">{c.proficiency_bonus == null ? "—" : `+${c.proficiency_bonus}`}</span></div>
                  {c.sheet_spellcasting?.save_dc ? <div>Spell save <span className="text-[#e0d2ae]">DC {c.sheet_spellcasting.save_dc}</span></div> : null}
                  {slotTally(c) ? <div>Slots <span className="text-[#e0d2ae]">{(slotTally(c)!.max - slotTally(c)!.used)} / {slotTally(c)!.max}</span></div> : null}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ─── TOP: initiative rail of portraits ─────────────────────────── */}
      {turnOrder.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <div className="flex items-end gap-1.5">
            {turnOrder.map((entry, i) => {
              const c = characters.find((x) => x.id === tokenToCharacter[entry.token_id])
              const active = i === activeIndex
              return (
                <div
                  key={entry.token_id}
                  title={`${entry.label} — d20 ${entry.roll} ${entry.dex_mod >= 0 ? "+" : ""}${entry.dex_mod} = ${entry.total}`}
                  className={
                    "relative w-[44px] overflow-hidden rounded-sm border transition-all " +
                    (active
                      ? "border-[#d8b25a] shadow-[0_0_16px_#c9a22766]"
                      : entry.kind === "pc"
                        ? "border-[#3f5068] opacity-80"
                        : "border-[#5a2420] opacity-80")
                  }
                  style={{ transform: active ? "translateY(-3px)" : undefined }}
                >
                  <div className="h-[40px] bg-gradient-to-b from-[#1b1610] to-[#080604]">
                    {c?.portrait_image_url ? (
                      <img src={c.portrait_image_url} alt="" className="h-full w-full object-cover object-top" />
                    ) : (
                      <span className={"grid h-full w-full place-items-center font-serif text-[15px] " + (entry.kind === "pc" ? "text-[#7d94b4]" : "text-[#a8635c]")}>
                        {entry.label.slice(0, 1)}
                      </span>
                    )}
                  </div>
                  <div className={"py-[1px] text-center font-serif text-[10px] " + (active ? "bg-[#8b6427] text-white" : "bg-black/70 text-[#c9bca0]")}>
                    {entry.total}
                  </div>
                  {active && <div className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 text-[10px] text-[#d8b25a]">▼</div>}
                </div>
              )
            })}
          </div>
          <div className="mt-2 text-center font-serif text-[9px] uppercase tracking-[0.28em] text-[#a89468]">Round {round}</div>
        </div>
      )}

      {/* ─── RIGHT: combat log + END TURN ──────────────────────────────── */}
      <div className="pointer-events-none absolute right-3 top-3 z-20 flex w-[176px] flex-col gap-2">
        <div className="rounded-sm border border-[#3a2f1e] bg-[#0c0a06]/92 shadow-[0_0_14px_#000a]">
          <div className="border-b border-[#2a2216] px-2 py-1 font-serif text-[9px] uppercase tracking-[0.2em] text-[#a89468]">Combat Log</div>
          <div className="max-h-[210px] overflow-y-auto px-2 py-1.5">
            {log.length === 0 ? (
              <div className="py-2 text-center text-[9px] italic text-[#5f5540]">The dark is quiet.</div>
            ) : (
              log.map((line) => (
                <div key={line.id} className="mb-1.5 text-[10px] leading-snug">
                  <span className={line.speaker === "Malachar" ? "text-[#c9a227]" : "text-[#9fc3e8]"}>{line.speaker}</span>
                  <span className="text-[#bdb298]"> {line.text}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {dm && (
          <button
            onClick={onEndTurn}
            className="pointer-events-auto rounded-sm border-2 border-[#6b5123] bg-gradient-to-b from-[#2a1f10] to-[#120c06] py-2 font-serif text-[11px] uppercase tracking-[0.2em] text-[#f0cd7a] shadow-[0_2px_0_#000,inset_0_1px_0_#c9a22733] transition-colors hover:border-[#c99a49] hover:text-[#fff3cf] active:translate-y-[1px]"
          >
            End Turn
          </button>
        )}
      </div>

      {/* ─── BOTTOM: globes + ability rack ─────────────────────────────── */}
      {focus && (
        <div className="pointer-events-none absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 items-end gap-3 pb-2">
          {/* Life */}
          <Globe
            value={focus.hp_current ?? focus.hp_max ?? 0}
            max={focus.hp_max ?? 0}
            label="Life"
            inner="radial-gradient(circle at 40% 22%, #e04838, #8f1810 55%, #4d0b06)"
            rim="#e0483833"
          />

          {/* The ability rack, from the sheet. */}
          <div className="mb-2 flex gap-1">
            {abilities.length === 0 ? (
              <div className="rounded-sm border border-[#2a2216] bg-black/60 px-3 py-3 text-[9px] italic text-[#5f5540]">
                No spells on this sheet
              </div>
            ) : (
              abilities.map((a, i) => (
                <button
                  key={a.name}
                  onClick={() => setAbility(ability === a.name ? null : a.name)}
                  title={`${a.name} — ${a.kind === "cantrip" ? "cantrip, always available" : "prepared spell"}`}
                  className={
                    "pointer-events-auto relative h-[44px] w-[44px] rounded-sm border text-[8px] leading-tight transition-all " +
                    (ability === a.name
                      ? "border-[#f4e0a8] bg-[#2e2210] shadow-[0_0_12px_#c9a22788]"
                      : "border-[#4a3a1e] bg-gradient-to-b from-[#1a1409] to-[#0a0805] hover:border-[#8b6427]")
                  }
                >
                  <span className="absolute left-[3px] top-[2px] text-[7px] text-[#6b5a34]">{i + 1}</span>
                  <span className={"block px-1 pt-[13px] font-serif " + (a.kind === "cantrip" ? "text-[#c9b3e0]" : "text-[#e0d2ae]")}>
                    {a.name.split(" ").slice(0, 2).join(" ")}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Spell power — slots, because D&D has no mana. An empty rack means
              a martial: the globe stays dark rather than inventing a resource. */}
          <Globe
            value={tally ? tally.max - tally.used : 0}
            max={tally ? tally.max : 0}
            label="Slots"
            inner="radial-gradient(circle at 40% 22%, #6f5ce0, #2c1d8f 55%, #120a4d)"
            rim="#6f5ce033"
          />
        </div>
      )}
    </>
  )
}

/** A glass sphere in a blackened mount. Drawn, not sourced. */
function Globe({ value, max, label, inner, rim }: { value: number; max: number; label: string; inner: string; rim: string }) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return (
    <div className="relative">
      <div
        className="relative h-[86px] w-[86px] overflow-hidden rounded-full border-[3px] border-[#3a2c1a]"
        style={{ background: "radial-gradient(circle at 35% 28%, #171014, #060306 72%)", boxShadow: `0 0 22px #000, inset 0 0 20px #000, 0 0 30px ${rim}` }}
      >
        <div className="absolute inset-x-0 bottom-0 transition-[height] duration-500" style={{ height: `${frac * 100}%`, background: inner, boxShadow: "inset 0 4px 12px #ffffff44, inset 0 -8px 14px #00000088" }} />
        <div className="absolute left-3 top-2 h-4 w-7 rounded-full bg-white/15 blur-[3px]" />
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-serif text-[13px] font-semibold text-[#f4ecd8] [text-shadow:0_1px_3px_#000,0_0_8px_#000]">
            {max > 0 ? `${value} / ${max}` : "—"}
          </span>
        </div>
      </div>
      <div className="mt-0.5 text-center font-serif text-[8px] uppercase tracking-[0.22em] text-[#8a7952]">{label}</div>
    </div>
  )
}
