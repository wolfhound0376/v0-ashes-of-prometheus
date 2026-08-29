"use client"

import { useEffect, useMemo, useState } from "react"
import { CORE_ACTIONS, iconFor } from "@/lib/action-icons"
import { conditionColor, normalizeConditions } from "@/lib/conditions"
import { blurbFor } from "@/lib/ability-blurbs"
import { rackFor, type RackItem } from "@/lib/spellbook"
import { Globe } from "./essence-globe"
import { CharacterCard } from "./character-card"
import { ClassMedallion } from "./class-medallion"
import { CharacterSheetOverlay } from "./character-sheet-overlay"

export interface HudCharacter {
  id: string
  name: string
  class: string | null
  subclass?: string | null
  level: number | null
  ac: number | null
  hp_current: number | null
  hp_max: number | null
  speed: string | null
  proficiency_bonus: number | null
  portrait_image_url: string | null
  face_image_url?: string | null
  dex_modifier: number | null
  str_score?: number | null
  dex_score?: number | null
  con_score?: number | null
  int_score?: number | null
  wis_score?: number | null
  cha_score?: number | null
  sheet_features?: unknown
  avatar_image_url?: string | null
  hero_image_url?: string | null
  initiative?: number | null
  xp?: number | null
  xp_to_next?: number | null
  sheet_species?: string | null
  sheet_background?: string | null
  sheet_save_proficiencies?: unknown
  sheet_skill_proficiencies?: unknown
  sheet_attacks?: unknown
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
  tokenToCharacter: Record<string, string>
  tokenPortrait?: Record<string, string>
  tokenConditions?: Record<string, unknown>
  turnOrder: HudTurn[]
  activeIndex: number
  round: number
  log: HudLogLine[]
  dm: boolean
  onEndTurn: () => void
  focusId: string | null
  onFocus: (id: string) => void
  /** The rack fires with the character it is ACTUALLY showing. It passes the
   *  id rather than letting the caller re-derive it: the board used to cast
   *  with its own `focusId` while this component displayed `focus`, and those
   *  two disagree the moment focusId fails to resolve — at which point the
   *  rack shows one character's spells and a different miniature moves. */
  onCast?: (characterId: string, ability: string, kind: string) => void
  /** Set while a spell waits for a target, so the rack can say so. */
  armedSpell?: { name: string; rangeFt: number } | null
  onCancelArm?: () => void
}

// Spells whose CASTING TIME is a bonus action (PHB). Everything else on the
// rack - core actions, cantrips, prepared spells - costs the action. Extend
// this as the party learns new tricks; unknown names default to the action,
// which is the common case and the safe one.
const BONUS_ACTION_SPELLS = new Set([
  "healing word", "spiritual weapon", "misty step", "shield of faith",
  "sanctuary", "expeditious retreat", "hex", "hunter's mark", "shillelagh",
  "divine favor", "magic weapon", "searing smite", "thunderous smite",
  "wrathful smite", "compelled duel", "ensnaring strike", "hail of thorns",
])
const phaseOf = (name: string): "action" | "bonus" =>
  BONUS_ACTION_SPELLS.has(name.toLowerCase().trim()) ? "bonus" : "action"

/**
 * The hover panel. Sam's brief: balloon the icon about 30%, and say clearly
 * what the thing actually does — in a face that belongs to this game rather
 * than to a browser's default tooltip.
 *
 * It renders ABOVE the rack and is pointer-events-none, so the panel can
 * never eat the click that casts the spell.
 */
function AbilityTip({ name, kind }: { name: string; kind: string }) {
  const b = blurbFor(name)
  const kindLabel =
    kind === "action" ? "Action" : kind === "cantrip" ? "Cantrip · at will" : "Prepared spell"
  const facts: [string, string][] = []
  if (b?.range) facts.push(["Range", b.range])
  if (b?.duration) facts.push(["Duration", b.duration])
  if (b?.save) facts.push(["Save", b.save])
  if (b?.damage) facts.push(["Effect", b.damage])

  return (
    <div
      className="pointer-events-none absolute bottom-[calc(100%+18px)] left-1/2 z-50 w-[290px] -translate-x-1/2"
      style={{ animation: "aopTipIn 140ms ease-out both" }}
    >
      <div
        className="relative border-2 px-4 pb-3 pt-3"
        style={{
          borderColor: "#a88745",
          background: "linear-gradient(180deg,#1b1408 0%,#0d0906 60%,#150e07 100%)",
          boxShadow: "0 10px 30px #000d, 0 0 22px #c9a2271f, inset 0 0 26px #00000099",
        }}
      >
        {/* hairlines, the same carved trim the turn plate uses */}
        <div className="absolute inset-x-4 top-[3px] h-px bg-gradient-to-r from-transparent via-[#f0cd7a] to-transparent" />
        <div className="absolute inset-x-4 bottom-[3px] h-px bg-gradient-to-r from-transparent via-[#f0cd7a] to-transparent" />

        <div
          className="text-center text-[16px] leading-tight text-[#f4e6c4]"
          style={{ fontFamily: "var(--font-display), var(--font-serif), serif", letterSpacing: "0.04em", textShadow: "0 2px 6px #000, 0 0 16px #c9a22755" }}
        >
          {name}
        </div>
        <div className="mt-[3px] text-center font-serif text-[8px] uppercase tracking-[0.28em] text-[#a89468]">
          {kindLabel}
        </div>

        {b ? (
          <>
            <div className="mx-auto my-2 h-px w-2/3 bg-gradient-to-r from-transparent via-[#6b5123] to-transparent" />
            <p className="text-center text-[12px] leading-[1.5] text-[#cdbfa0]" style={{ fontFamily: "var(--font-sans), Georgia, serif" }}>
              {b.text}
            </p>
            {facts.length > 0 && (
              <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
                {facts.map(([k, v]) => (
                  <span key={k} className="text-[9px] uppercase tracking-wider text-[#8a7952]">
                    {k} <span className="text-[#e0d2ae] normal-case tracking-normal">{v}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-center text-[11px] italic text-[#8a7952]">Ask Malachar what it does.</p>
        )}

        {/* the little pointer down toward the icon */}
        <div
          className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-[7px] rotate-45 border-b-2 border-r-2"
          style={{ borderColor: "#a88745", background: "#120c06" }}
        />
      </div>
      <style>{`@keyframes aopTipIn { from { opacity: 0; transform: translate(-50%, 6px) } to { opacity: 1; transform: translate(-50%, 0) } }`}</style>
    </div>
  )
}

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

function InitiativeToken({
  entry,
  character,
  portrait,
  conditions,
  active,
}: {
  entry: HudTurn
  character?: HudCharacter
  portrait: string | null
  conditions: string[]
  active: boolean
}) {
  const hostile = entry.kind === "npc"
  const ring = active ? "#f2cb63" : hostile ? "#8b2621" : "#536a86"
  const glow = active
    ? "0 0 18px rgba(226,177,65,.8),0 4px 14px rgba(0,0,0,.9)"
    : hostile
      ? "0 0 10px rgba(125,28,24,.42),0 3px 10px rgba(0,0,0,.85)"
      : "0 0 10px rgba(55,83,116,.36),0 3px 10px rgba(0,0,0,.85)"

  return (
    <div
      title={
        `${entry.label} — d20 ${entry.roll} ${entry.dex_mod >= 0 ? "+" : ""}${entry.dex_mod} = ${entry.total}` +
        (conditions.length ? `\n${conditions.join(" · ")}` : "")
      }
      className="relative w-[62px] shrink-0 transition-transform duration-200"
      style={{ transform: active ? "translateY(-7px) scale(1.05)" : undefined }}
    >
      <div
        className="relative mx-auto h-[61px] w-[58px] overflow-visible rounded-[16px]"
        style={{
          filter: active ? "brightness(1.08)" : "brightness(.86)",
          boxShadow: glow,
        }}
      >
        <div
          className="absolute inset-[2px] overflow-hidden rounded-[14px] bg-[#090806]"
          style={{ boxShadow: `inset 0 0 0 1px ${ring}, inset 0 0 12px rgba(0,0,0,.9)` }}
        >
          <ClassMedallion
            faceUrl={character?.face_image_url}
            portraitUrl={portrait}
            characterClass={character?.class}
            className="scale-[1.12]"
            fallback={
              <span className={`font-serif text-[18px] ${hostile ? "text-[#c46a5e]" : "text-[#91a8c8]"}`}>
                {entry.label.slice(0, 1)}
              </span>
            }
          />
        </div>

        <div
          className="pointer-events-none absolute inset-0 rounded-[16px] border"
          style={{
            borderColor: ring,
            boxShadow: `inset 0 0 0 1px rgba(228,190,104,.24), 0 0 0 1px rgba(0,0,0,.9)`,
          }}
        />
        <span
          className="pointer-events-none absolute left-1/2 top-[-5px] h-[9px] w-[9px] -translate-x-1/2 rotate-45 border bg-[#171006]"
          style={{ borderColor: ring, boxShadow: active ? `0 0 8px ${ring}` : undefined }}
        />
        <span
          className="pointer-events-none absolute bottom-[-4px] left-1/2 h-[8px] w-[8px] -translate-x-1/2 rotate-45 border bg-[#171006]"
          style={{ borderColor: ring }}
        />

        {conditions.length > 0 && (
          <div className="absolute left-1 right-1 top-1 flex justify-center gap-[2px] rounded-full bg-black/55 px-1 py-[2px]">
            {conditions.slice(0, 4).map((cond) => (
              <span
                key={cond}
                title={cond}
                className={"h-[5px] w-[5px] rounded-full bg-current " + conditionColor(cond)}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className="mx-auto mt-[3px] flex h-[20px] w-[42px] items-center justify-center border-x border-b bg-gradient-to-b from-[#171109] to-[#080604] font-serif text-[12px] font-semibold"
        style={{
          borderColor: ring,
          color: active ? "#fff0b2" : "#d4c5a2",
          clipPath: "polygon(8% 0,92% 0,100% 35%,100% 100%,0 100%,0 35%)",
          boxShadow: "0 2px 7px rgba(0,0,0,.8)",
        }}
      >
        {entry.total}
      </div>

      {active && (
        <div className="mt-[2px] text-center font-serif text-[7px] uppercase tracking-[0.18em] text-[#e3bd56]">
          Active
        </div>
      )}
    </div>
  )
}

export function CombatHud(props: Props) {
  const {
    characters,
    tokenToCharacter,
    tokenPortrait = {},
    tokenConditions = {},
    turnOrder,
    activeIndex,
    round,
    log,
    dm,
    onEndTurn,
    focusId,
    onFocus,
    onCast,
    armedSpell,
    onCancelArm,
  } = props

  const [ability, setAbility] = useState<string | null>(null)
  // Which rack slot the cursor is over. Hover is a VIEW state and never
  // touches the turn — looking at a spell must never cost you one.
  const [hovered, setHovered] = useState<string | null>(null)
  // The turn economy as the banner knows it. The banner and this rack hang
  // from different parents, so the state crosses as a DOM event rather than
  // through a shared ancestor - the board file is deliberately untouched
  // (another session is live in it).
  const [econ, setEcon] = useState<{ action: boolean; bonus: boolean; armed: "action" | "bonus" | null; live: boolean } | null>(null)
  useEffect(() => {
    const h = (e: Event) => setEcon((e as CustomEvent).detail)
    window.addEventListener("aop:economy", h)
    // Ask for the current state in case the banner mounted (and spoke) first.
    window.dispatchEvent(new CustomEvent("aop:economy-request"))
    return () => window.removeEventListener("aop:economy", h)
  }, [])
  const [sheetFor, setSheetFor] = useState<string | null>(null)

  const activeCharacterId = useMemo(() => {
    const entry = turnOrder[activeIndex]
    if (!entry) return null
    return tokenToCharacter[entry.token_id] ?? null
  }, [turnOrder, activeIndex, tokenToCharacter])

  const focus = useMemo(() => {
    const exact = characters.find((c) => c.id === focusId)
    if (exact) return exact
    // Falling back is right — a HUD with no plate is worse than a HUD showing
    // the wrong one — but doing it SILENTLY is what hid this bug: the rack
    // rendered characters[0]'s spells while the board animated focusId's
    // miniature, so pressing one of Samson's spells moved the bard.
    if (focusId && characters.length) {
      console.warn(`[hud] focusId ${focusId} is not in the loaded sheets — showing ${characters[0]?.name} instead`)
    }
    return characters[0] ?? null
  }, [characters, focusId])

  // Sam: "The spell and actions need to be specific to the character, only
  // available spells based on DND 5E, inventory for that character."
  //
  // rackFor() reads THIS character's weapons out of sheet_attacks — the
  // inventory gate, so a cleric with a mace gets Mace rather than a nameless
  // "Attack" — then their own cantrips, then their prepared spells with the
  // slots actually remaining. A spell with no slots left is DIMMED, not
  // removed: a player needs to see that Guiding Bolt exists and is spent,
  // rather than wonder where it went.
  const abilities = useMemo<RackItem[]>(() => {
    if (!focus) return []
    return rackFor({
      spellcasting: focus.sheet_spellcasting as Parameters<typeof rackFor>[0]["spellcasting"],
      attacks: (focus as unknown as { sheet_attacks?: Parameters<typeof rackFor>[0]["attacks"] }).sheet_attacks,
      coreActions: CORE_ACTIONS.slice(0, 5).map((a) => a.name),
    }).slice(0, 14)
  }, [focus])

  useEffect(() => {
    setAbility(null)
  }, [focusId])

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

      <div className="pointer-events-none absolute left-2 top-2 z-20 flex flex-col gap-[3px]">
        {characters.map((c) => (
          <div key={c.id} className="pointer-events-auto">
            <CharacterCard
              character={{ ...c, conditions: normalizeConditions(c.conditions) }}
              tone="blue"
              active={focus?.id === c.id}
              isTurn={activeCharacterId === c.id}
              gems={
                econ && econ.live && activeCharacterId === c.id
                  ? { action: econ.action ? "spent" : "lit", bonus: econ.bonus ? "spent" : "lit" }
                  : { action: "dormant", bonus: "dormant" }
              }
              onClick={() => onFocus(c.id)}
              width={236}
            />
            {focus?.id === c.id && (
              <button
                onClick={() => setSheetFor(c.id)}
                className="mt-[-3px] w-full border border-t-0 border-[#7b5d28] bg-gradient-to-b from-[#20160a]/95 to-[#0b0704]/95 py-[4px] font-serif text-[8px] uppercase tracking-[0.22em] text-[#d8b45b] shadow-[0_3px_10px_#000b] transition hover:border-[#c99a49] hover:text-[#fff0bd]"
              >
                Open Character Sheet
              </button>
            )}
          </div>
        ))}
      </div>

      {turnOrder.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2">
          <div className="relative rounded-[10px] border border-[#3f3020]/80 bg-[linear-gradient(180deg,rgba(15,11,7,.88),rgba(5,4,3,.68))] px-3 pb-2 pt-3 shadow-[0_8px_26px_#000b,inset_0_1px_0_#b98c3d33] backdrop-blur-[2px]">
            <div className="pointer-events-none absolute left-4 right-4 top-[5px] h-px bg-gradient-to-r from-transparent via-[#9c7635]/65 to-transparent" />
            <div className="flex items-end gap-1.5">
              {turnOrder.map((entry, i) => {
                const c = characters.find((x) => x.id === tokenToCharacter[entry.token_id])
                const art = c?.portrait_image_url ?? tokenPortrait[entry.token_id] ?? null
                const conds = normalizeConditions(c ? c.conditions : tokenConditions[entry.token_id])
                return (
                  <InitiativeToken
                    key={entry.token_id}
                    entry={entry}
                    character={c}
                    portrait={art}
                    conditions={conds}
                    active={i === activeIndex}
                  />
                )
              })}
            </div>
            <div className="mt-1 text-center font-serif text-[8px] uppercase tracking-[0.34em] text-[#a98c55]">
              Round {round}
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute right-3 top-[72px] z-20 flex w-[194px] flex-col gap-2">
        <div className="relative overflow-hidden rounded-[3px] border border-[#5a4426] bg-[linear-gradient(180deg,rgba(18,13,8,.95),rgba(7,5,3,.92))] shadow-[0_7px_24px_#000c,inset_0_0_0_1px_#c99a4920]">
          <div className="pointer-events-none absolute left-[5px] top-[5px] h-[7px] w-[7px] rotate-45 border border-[#80612c] bg-[#100b06]" />
          <div className="pointer-events-none absolute right-[5px] top-[5px] h-[7px] w-[7px] rotate-45 border border-[#80612c] bg-[#100b06]" />
          <div className="border-b border-[#4b3820] bg-gradient-to-b from-[#261a0d] to-[#110b06] px-3 py-1.5 text-center font-serif text-[9px] uppercase tracking-[0.23em] text-[#c6a25a]">
            Combat Log
          </div>
          <div className="max-h-[226px] overflow-y-auto px-2.5 py-2">
            {log.length === 0 ? (
              <div className="py-3 text-center font-serif text-[9px] italic text-[#675d49]">The dark is quiet.</div>
            ) : (
              log.map((line) => (
                <div key={line.id} className="mb-1.5 border-b border-[#3a2c1a]/40 pb-1 text-[10px] leading-snug last:border-0">
                  <span className={line.speaker === "Malachar" ? "font-serif text-[#d6ad49]" : "font-serif text-[#a8c8e8]"}>
                    {line.speaker}
                  </span>
                  <span className="text-[#c7bda5]"> {line.text}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {dm && (
          <button
            onClick={onEndTurn}
            className="pointer-events-auto relative overflow-hidden border-2 border-[#7b5524] bg-[linear-gradient(180deg,#3a1d10,#170a06_60%,#0b0504)] py-2.5 font-serif text-[11px] uppercase tracking-[0.24em] text-[#f0ce79] shadow-[0_4px_0_#050201,0_7px_18px_#000a,inset_0_1px_0_#f5cf7b33] transition hover:border-[#c78d38] hover:text-[#fff1c2] active:translate-y-[1px]"
            style={{ clipPath: "polygon(5% 0,95% 0,100% 25%,100% 75%,95% 100%,5% 100%,0 75%,0 25%)" }}
          >
            End Turn
          </button>
        )}
      </div>

      {/* ARMED. The windup is already looping; this is the half you can see.
          It sits above the rack so it never covers the icons you are about to
          choose from, and it names the range because "out of range" is the
          most common reason a cast does nothing. */}
      {armedSpell && (
        <div className="pointer-events-none absolute bottom-[124px] left-1/2 z-30 -translate-x-1/2">
          <div
            className="flex items-center gap-3 border-2 px-5 py-2"
            style={{
              borderColor: "#7cc0ff",
              background: "linear-gradient(180deg,#0b1420 0%,#060a10 100%)",
              boxShadow: "0 0 26px #4fa8ff55, inset 0 0 22px #00000099",
              animation: "aopArmPulse 1.6s ease-in-out infinite",
            }}
          >
            <span
              className="text-[15px] text-[#dbeeff]"
              style={{ fontFamily: "var(--font-display), var(--font-serif), serif", letterSpacing: "0.05em" }}
            >
              {armedSpell.name}
            </span>
            <span className="font-serif text-[9px] uppercase tracking-[0.24em] text-[#7cc0ff]">
              click a target{armedSpell.rangeFt ? ` · ${armedSpell.rangeFt} ft` : ""}
            </span>
            <button
              onClick={() => onCancelArm?.()}
              className="pointer-events-auto border border-[#3a556e] px-2 py-[2px] font-serif text-[8px] uppercase tracking-wider text-[#8fa8c0] hover:border-[#7cc0ff] hover:text-[#dbeeff]"
            >
              Esc
            </button>
          </div>
          <style>{`@keyframes aopArmPulse { 0%,100% { box-shadow: 0 0 18px #4fa8ff44, inset 0 0 22px #00000099 } 50% { box-shadow: 0 0 34px #4fa8ff88, inset 0 0 22px #00000099 } }`}</style>
        </div>
      )}

      {focus && (
        <div className="pointer-events-none absolute bottom-1 left-1/2 z-20 flex -translate-x-1/2 items-end gap-1.5">
          <Globe
            value={focus.hp_current ?? focus.hp_max ?? 0}
            max={focus.hp_max ?? 0}
            label="Life"
            variant="life"
            size={96}
          />

          <div className="mb-[13px]">
            <div className="mb-[3px] text-center font-serif text-[8px] uppercase tracking-[0.24em] text-[#9f8656]">
              {focus.name} · {focus.class ?? "Adventurer"}
            </div>
            <div className="relative flex gap-[3px] border-y border-[#624820] bg-[linear-gradient(180deg,rgba(28,20,10,.94),rgba(7,5,3,.96))] px-[7px] py-[6px] shadow-[0_8px_22px_#000c,inset_0_1px_0_#c99a4930]">
              <span className="pointer-events-none absolute -left-[5px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rotate-45 border border-[#755726] bg-[#100b06]" />
              <span className="pointer-events-none absolute -right-[5px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rotate-45 border border-[#755726] bg-[#100b06]" />

              {abilities.map((a, i) => {
                const art = iconFor(a.name)
                const phase = phaseOf(a.name)
                const armedNow = econ?.armed ?? null
                const armedMatch = armedNow !== null && phase === armedNow
                const armedMute = armedNow !== null && phase !== armedNow
                const kindLabel =
                  a.kind === "action" ? "action"
                  : a.kind === "weapon" ? `${a.toHit ?? ""} ${a.damage ?? ""}`.trim() || "weapon"
                  : a.kind === "cantrip" ? "cantrip, always available"
                  : a.usable ? `level ${a.entry.level} spell` : (a.why ?? "no slots left")
                const selected = ability === a.name
                const isHovered = hovered === a.name

                return (
                  <button
                    key={a.name}
                    onMouseEnter={() => setHovered(a.name)}
                    onMouseLeave={() => setHovered((h) => (h === a.name ? null : h))}
                    onFocus={() => setHovered(a.name)}
                    onBlur={() => setHovered((h) => (h === a.name ? null : h))}
                    disabled={!a.usable}
                    onClick={() => {
                      if (!a.usable) return
                      const selecting = !selected
                      setAbility(selecting ? a.name : null)
                      if (selecting) {
                        if (focus) onCast?.(focus.id, a.name, a.kind)
                        // Tell the banner what this cast cost; the phase is
                        // spent there, where the spend callback lives.
                        // Spend it HERE only for things that fire the moment they are pressed.
                        // A spell that ARMS is paid for by the server when it is
                        // actually thrown — spending on the press meant opening a
                        // spell and pressing Escape cost you your whole action.
                        // Caught in a live rehearsal: the tray read ACTION · USED
                        // before a target had been chosen.
                        const armsFirst = a.kind !== "action" && a.entry.target !== "self" && a.entry.target !== "none"
                        if (!armsFirst) {
                          window.dispatchEvent(new CustomEvent("aop:ability-used", { detail: { phase } }))
                        }
                      }
                    }}
                    aria-label={`${a.name} — ${kindLabel}`}
                    className={
                      // Sam: balloon it about 30% on hover. Scaling from the
                      // BOTTOM keeps the row's baseline still — a rack that
                      // grows upward reads as the icon rising to meet you,
                      // where centre-scaling just looks like the bar jitters.
                      // z-40 so the growing tile passes over its neighbours
                      // rather than being clipped by them.
                      "pointer-events-auto group relative h-[58px] w-[58px] shrink-0 bg-[#080604] transition-transform duration-150 ease-out origin-bottom" +
                      (isHovered ? " scale-[1.3] z-40" : " hover:-translate-y-[2px] z-0") +
                      (armedMute ? " opacity-35 saturate-50" : "") +
                      // Spent, not gone: grey and unclickable so the player
                      // can see what they no longer have.
                      (!a.usable ? " opacity-30 grayscale cursor-not-allowed" : "")
                    }
                    style={{
                      boxShadow: selected
                        ? "0 0 0 2px #f0d38b,0 0 16px #d6a63caa,0 4px 10px #000"
                        : armedMatch
                          ? phase === "action"
                            ? "0 0 0 2px #7cc0ff,0 0 18px #4fa8ffcc,0 4px 10px #000"
                            : "0 0 0 2px #ff8a76,0 0 18px #ff5a44cc,0 4px 10px #000"
                          : "0 0 0 1px #59401f,0 3px 8px #000c",
                    }}
                  >
                    {isHovered && <AbilityTip name={a.name} kind={a.kind} />}
                    {art ? (
                      <img
                        src={art}
                        alt={a.name}
                        className={`h-full w-full object-cover transition ${selected ? "brightness-110 saturate-110" : "brightness-[.9] group-hover:brightness-105"}`}
                      />
                    ) : (
                      <span
                        className={
                          "grid h-full w-full place-items-center bg-gradient-to-b from-[#191208] to-[#080604] px-1 text-center font-serif text-[8px] leading-tight " +
                          (a.kind === "cantrip" ? "text-[#c9b3e0]" : "text-[#e0d2ae]")
                        }
                      >
                        {a.name.split(" ").slice(0, 2).join(" ")}
                      </span>
                    )}

                    <span className="absolute left-[3px] top-[3px] grid h-[14px] min-w-[14px] place-items-center border border-[#9c7431] bg-black/80 px-[2px] font-serif text-[7px] text-[#f0d27f] shadow-[0_1px_3px_#000]">
                      {i + 1}
                    </span>

                    <span
                      className={
                        "absolute bottom-[3px] right-[3px] h-[6px] w-[6px] rotate-45 border border-black/70 " +
                        (a.kind === "action"
                          ? "bg-[#9b2f24]"
                          : a.kind === "cantrip"
                            ? "bg-[#4e78a8]"
                            : "bg-[#8d4eb8]")
                      }
                    />
                  </button>
                )
              })}
            </div>
          </div>

          <Globe
            value={tally ? tally.max - tally.used : 0}
            max={tally ? tally.max : 0}
            label="Slots"
            variant="mana"
            size={96}
          />
        </div>
      )}
    </>
  )
}
