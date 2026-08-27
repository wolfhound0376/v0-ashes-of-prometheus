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
import { CORE_ACTIONS, iconFor } from "@/lib/action-icons"
import { conditionColor, normalizeConditions } from "@/lib/conditions"
import { Globe } from "./essence-globe"
import { CharacterCard } from "./character-card"
import { ClassMedallion } from "./class-medallion"
import { CharacterSheetOverlay } from "./character-sheet-overlay"

export interface HudCharacter {
  id: string
  name: string
  class: string | null
  /** Not a column on `characters` — verified before shipping this query.
   *  Kept optional so a future sheet field can fill it without a migration. */
  subclass?: string | null
  level: number | null
  ac: number | null
  hp_current: number | null
  hp_max: number | null
  speed: string | null
  proficiency_bonus: number | null
  portrait_image_url: string | null
  /** The unframed face. Null on anyone whose art has not been separated yet;
   *  the card falls back to the baked medallion in `portrait_image_url`. */
  face_image_url?: string | null
  dex_modifier: number | null
  str_score?: number | null
  dex_score?: number | null
  con_score?: number | null
  int_score?: number | null
  wis_score?: number | null
  cha_score?: number | null
  sheet_features?: unknown
  /** Full-body standee — the sheet shows the figure, not the medallion face. */
  avatar_image_url?: string | null
  /** Feature art for the sheet: the character in their finery. */
  hero_image_url?: string | null
  initiative?: number | null
  xp?: number | null
  xp_to_next?: number | null
  sheet_species?: string | null
  sheet_background?: string | null
  /** jsonb: array of ability keys, e.g. ["wis","cha"] */
  sheet_save_proficiencies?: unknown
  /** jsonb: object keyed by skill name, e.g. {"Insight":"proficient"} */
  sheet_skill_proficiencies?: unknown
  /** jsonb: [{name, type, hit, damage, range}] */
  sheet_attacks?: unknown
  /** jsonb string[] on `characters`. Malachar writes this column mid-fight from
   *  the chat route, so it arrives as raw jsonb and goes through
   *  `normalizeConditions` before anything renders it. */
  conditions?: unknown
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
  /** token_id → portrait URL for NPCs, whose art lives in npc_encounters. */
  tokenPortrait?: Record<string, string>
  /** token_id → conditions for NPCs, from the same encounter rows. A PC's
   *  conditions come off their sheet instead and never pass through here. */
  tokenConditions?: Record<string, unknown>
  turnOrder: HudTurn[]
  activeIndex: number
  round: number
  log: HudLogLine[]
  dm: boolean
  onEndTurn: () => void
  /** The character whose plate is "focused" — drives globes and ability bar. */
  focusId: string | null
  onFocus: (id: string) => void
  /** Pressing an ability performs it on the board — the focused character's
   *  miniature plays the matching cast and throws the spell from its hand.
   *  Optional so the HUD still renders anywhere the board is not mounted. */
  onCast?: (ability: string, kind: string) => void
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

export function CombatHud(props: Props) {
  const { characters, tokenToCharacter, tokenPortrait = {}, tokenConditions = {}, turnOrder, activeIndex, round, log, dm, onEndTurn, focusId, onFocus, onCast } = props
  const [ability, setAbility] = useState<string | null>(null)
  const [sheetFor, setSheetFor] = useState<string | null>(null)

  // Whose turn it is, resolved from the SAME turn order the rail draws from —
  // one source, so the lamp on the card and the raised portrait on the rail can
  // never disagree. Null between combats: no fight, no lamp.
  const activeCharacterId = useMemo(() => {
    const entry = turnOrder[activeIndex]
    if (!entry) return null
    return tokenToCharacter[entry.token_id] ?? null
  }, [turnOrder, activeIndex, tokenToCharacter])

  const focus = useMemo(
    () => characters.find((c) => c.id === focusId) ?? characters[0] ?? null,
    [characters, focusId],
  )

  // The ability bar is the focused caster's real spells: cantrips first (always
  // available), then prepared. A martial with neither simply gets an empty rack
  // rather than invented buttons.
  const abilities = useMemo(() => {
    // The universal actions come first — every combatant has Attack, Dash,
    // Dodge, and they are the ones a table reaches for most. Then this
    // character's real cantrips and prepared spells.
    const sc = focus?.sheet_spellcasting
    const core = CORE_ACTIONS.slice(0, 5).map((a) => ({ name: a.name, kind: "action" as const }))
    const cantrips = (sc?.cantrips ?? []).map((n) => ({ name: n, kind: "cantrip" as const }))
    const prepared = (sc?.prepared ?? []).map((n) => ({ name: n, kind: "prepared" as const }))
    return [...core, ...cantrips, ...prepared].slice(0, 12)
  }, [focus])

  useEffect(() => { setAbility(null) }, [focusId])

  const hpFrac = (c: HudCharacter) =>
    c.hp_max && c.hp_max > 0 ? Math.max(0, Math.min(1, (c.hp_current ?? c.hp_max) / c.hp_max)) : 0
  const hpColour = (f: number) => (f > 0.5 ? "#7a1410" : f > 0.25 ? "#8a5410" : "#5a0d08")

  const tally = focus ? slotTally(focus) : null

  return (
    <>
      {sheetFor && characters.find((c) => c.id === sheetFor) && (
        <CharacterSheetOverlay
          character={characters.find((c) => c.id === sheetFor)!}
          onClose={() => setSheetFor(null)}
          onEndTurn={dm ? undefined : () => { onEndTurn(); setSheetFor(null) }}
        />
      )}

      {/* ─── LEFT: the commissioned character cards ────────────────────
          Sam's frame art carries the design; the card component only lays
          live values into the sockets the artist left. Hover no longer
          expands anything — the frame has no room for it, and the party
          panels along the foot already carry the detail. */}
      <div className="pointer-events-none absolute left-2 top-2 z-20 flex flex-col gap-1">
        {characters.map((c) => (
          <div key={c.id} className="pointer-events-auto">
            <CharacterCard
              character={{ ...c, conditions: normalizeConditions(c.conditions) }}
              tone="blue"
              active={focus?.id === c.id}
              isTurn={activeCharacterId === c.id}
              onClick={() => onFocus(c.id)}
              width={228}
            />
            {/* The focused card grows a tab to the full sheet. Explicit rather
                than a hidden double-click: a feature nobody can find is a
                feature that does not exist. */}
            {focus?.id === c.id && (
              <button
                onClick={() => setSheetFor(c.id)}
                className="mt-[-2px] w-full rounded-b-sm border border-t-0 border-[#6b5123] bg-gradient-to-b from-[#1c1408] to-[#100b05] py-[3px] font-serif text-[8px] uppercase tracking-[0.2em] text-[#c9a227] hover:border-[#c99a49] hover:text-[#f0cd7a]"
              >
                Open Sheet
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ─── TOP: initiative rail of portraits ─────────────────────────── */}
      {turnOrder.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <div className="flex items-end gap-1.5">
            {turnOrder.map((entry, i) => {
              const c = characters.find((x) => x.id === tokenToCharacter[entry.token_id])
              // A player's portrait comes from their sheet; an NPC's from
              // their encounter row. Either way the rail shows a face.
              const art = c?.portrait_image_url ?? tokenPortrait[entry.token_id] ?? null
              const active = i === activeIndex
              // A PC's conditions ride on their sheet; an NPC's on their
              // encounter row, which the board looks up by label.
              const conds = normalizeConditions(c ? c.conditions : tokenConditions[entry.token_id])
              return (
                <div
                  key={entry.token_id}
                  title={
                    `${entry.label} — d20 ${entry.roll} ${entry.dex_mod >= 0 ? "+" : ""}${entry.dex_mod} = ${entry.total}` +
                    (conds.length ? `\n${conds.join(" · ")}` : "")
                  }
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
                    {/* A PC gets the class-assembled medallion; an NPC has no
                        class, so ClassMedallion falls through to their
                        encounter portrait untouched. */}
                    <ClassMedallion
                      faceUrl={c?.face_image_url}
                      portraitUrl={art}
                      characterClass={c?.class}
                      fallback={
                        <span className={"font-serif text-[15px] " + (entry.kind === "pc" ? "text-[#7d94b4]" : "text-[#a8635c]")}>
                          {entry.label.slice(0, 1)}
                        </span>
                      }
                    />
                  </div>
                  {conds.length > 0 && (
                    <div className="absolute left-0 right-0 top-0 flex justify-center gap-[2px] bg-gradient-to-b from-black/80 to-transparent px-[2px] pt-[2px] pb-[3px]">
                      {conds.slice(0, 4).map((cond) => (
                        <span
                          key={cond}
                          title={cond}
                          className={"h-[5px] w-[5px] rounded-full bg-current " + conditionColor(cond)}
                        />
                      ))}
                    </div>
                  )}
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

      {/* The four party summary panels that used to sit here are GONE.
          Sam: "redundant". They showed the same six ability scores for all
          four characters at all times — four times the ink for something a
          player checks twice a session. The card is the always-on view; the
          full sheet opens from it on demand. */}

      {/* ─── BOTTOM: globes + ability rack ─────────────────────────────── */}
      {focus && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-end gap-3">
          {/* Life */}
          <Globe
            value={focus.hp_current ?? focus.hp_max ?? 0}
            max={focus.hp_max ?? 0}
            label="Life"
            variant="life"
          />

          {/* The ability rack, from the sheet. */}
          <div className="mb-2 flex gap-1">
            {abilities.map((a, i) => {
              const art = iconFor(a.name)
              const kindLabel =
                a.kind === "action" ? "action" : a.kind === "cantrip" ? "cantrip, always available" : "prepared spell"
              return (
                <button
                  key={a.name}
                  onClick={() => {
                    const selecting = ability !== a.name
                    setAbility(selecting ? a.name : null)
                    // Selecting an ability performs it on the board: the
                    // miniature casts, and the spell leaves his hand on the
                    // release frame. Deselecting is just deselecting.
                    if (selecting) onCast?.(a.name, a.kind)
                  }}
                  title={`${a.name} — ${kindLabel}`}
                  className={
                    "pointer-events-auto relative h-[46px] w-[46px] overflow-hidden rounded-sm border transition-all " +
                    (ability === a.name
                      ? "border-[#f4e0a8] shadow-[0_0_14px_#c9a227aa]"
                      : "border-[#4a3a1e] hover:border-[#8b6427]")
                  }
                >
                  {art ? (
                    // The commissioned art fills the button; its own gold frame
                    // is the border, which is why the chrome here stays thin.
                    <img src={art} alt={a.name} className="h-full w-full object-cover" />
                  ) : (
                    <span
                      className={
                        "grid h-full w-full place-items-center bg-gradient-to-b from-[#1a1409] to-[#0a0805] px-1 text-center font-serif text-[8px] leading-tight " +
                        (a.kind === "cantrip" ? "text-[#c9b3e0]" : "text-[#e0d2ae]")
                      }
                    >
                      {a.name.split(" ").slice(0, 2).join(" ")}
                    </span>
                  )}
                  <span className="absolute left-[2px] top-[1px] rounded-sm bg-black/70 px-[3px] text-[7px] text-[#d8b25a]">{i + 1}</span>
                </button>
              )
            })}
          </div>

          {/* Spell power — slots, because D&D has no mana. An empty rack means
              a martial: the globe stays dark rather than inventing a resource. */}
          <Globe
            value={tally ? tally.max - tally.used : 0}
            max={tally ? tally.max : 0}
            label="Slots"
            variant="mana"
          />
        </div>
      )}
    </>
  )
}
