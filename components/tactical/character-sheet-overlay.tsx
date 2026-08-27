"use client"

// ============================================================================
// THE FULL SHEET — opened from a character card, in the card's own language.
//
// This replaces the four summary panels that used to sit along the foot of
// the board. Sam's call, and the right one: those panels showed the same six
// ability scores for all four characters at all times, which is four times
// the ink for information a player checks perhaps twice a session. The card
// on the left is the always-on view; this is the "tell me everything" view,
// and it only exists when asked for.
//
// Same materials as the card frame: blackened steel, bronze rules, gold
// small-caps, recessed near-black fields. Nothing new invented.
// ============================================================================

import { useEffect } from "react"
import { iconFor } from "@/lib/action-icons"
import { ConditionBadges } from "@/components/conditions/condition-badges"
import type { HudCharacter } from "./combat-hud"

const RULE = "linear-gradient(90deg,transparent,#a88745,transparent)"

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-sm border border-[#2a2216] bg-black/45 px-2 py-1 text-center">
      <div className="text-[7px] uppercase tracking-[0.18em] text-[#6b5a34]">{label}</div>
      <div className="font-serif text-[13px] text-[#e8dcc0]">{value}</div>
    </div>
  )
}

export function CharacterSheetOverlay({
  character: c,
  onClose,
}: {
  character: HudCharacter
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const mod = (score: number | null | undefined) =>
    score == null ? "—" : `${Math.floor((score - 10) / 2) >= 0 ? "+" : ""}${Math.floor((score - 10) / 2)}`

  const abilities: [string, number | null | undefined][] = [
    ["STR", c.str_score], ["DEX", c.dex_score], ["CON", c.con_score],
    ["INT", c.int_score], ["WIS", c.wis_score], ["CHA", c.cha_score],
  ]

  const sc = c.sheet_spellcasting ?? {}
  const cantrips = sc.cantrips ?? []
  const prepared = sc.prepared ?? []
  const slots = sc.slots ?? {}
  const feats = Array.isArray(c.sheet_features)
    ? (c.sheet_features as unknown[])
        .map((f) => (typeof f === "string" ? f : (f as { name?: string })?.name))
        .filter((n): n is string => Boolean(n))
    : []

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[86vh] w-[620px] overflow-y-auto"
        style={{
          background: "linear-gradient(180deg,#171009 0%,#0b0805 60%,#120d07 100%)",
          border: "2px solid #a88745",
          boxShadow: "0 0 50px #000, inset 0 0 40px #00000099",
        }}
      >
        {/* Head: portrait, name, the numbers a player checks mid-turn. */}
        <div className="flex gap-3 p-4">
          <div className="h-[112px] w-[96px] shrink-0 overflow-hidden rounded-sm border border-[#4a3a1e] bg-gradient-to-b from-[#241a0c] to-[#0a0805]">
            {c.portrait_image_url ? (
              <img src={c.portrait_image_url} alt="" className="h-full w-full object-contain object-top" />
            ) : (
              <div className="grid h-full w-full place-items-center text-[28px] text-[#6b5a34]">✧</div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="font-serif text-[19px] uppercase tracking-[0.16em] text-[#f4e6c4]">{c.name}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#a89468]">
              Level {c.level ?? "—"} {c.class ?? ""}
            </div>

            <div className="mt-2 grid grid-cols-4 gap-1.5">
              <Field label="HP" value={`${c.hp_current ?? c.hp_max ?? "—"}/${c.hp_max ?? "—"}`} />
              <Field label="AC" value={c.ac ?? "—"} />
              <Field label="Init" value={c.dex_modifier == null ? "—" : `${c.dex_modifier >= 0 ? "+" : ""}${c.dex_modifier}`} />
              <Field label="Speed" value={(c.speed ?? "—").replace(/\s*\(.*$/, "")} />
            </div>

            {/* Directly under the numbers, because conditions are what make
                those numbers wrong. Restrained is a speed of 0 and advantage
                against you; prone halves your movement. A sheet that shows AC
                and hides Poisoned is telling half the truth. */}
            <div className="mt-2">
              <ConditionBadges conditions={c.conditions} size="xs" emptyLabel="No conditions" />
            </div>
          </div>
        </div>

        <div className="mx-4 h-[1px]" style={{ background: RULE }} />

        {/* Abilities, with their modifiers — the modifier is what gets rolled,
            so it is the larger number, not a footnote. */}
        <div className="grid grid-cols-6 gap-1.5 p-4">
          {abilities.map(([label, score]) => (
            <div key={label} className="rounded-sm border border-[#3a2f1e] bg-black/40 py-1.5 text-center">
              <div className="text-[7px] uppercase tracking-[0.18em] text-[#6b5a34]">{label}</div>
              <div className="font-serif text-[16px] leading-tight text-[#f0e6cc]">{mod(score)}</div>
              <div className="text-[9px] text-[#7a6c50]">{score ?? "—"}</div>
            </div>
          ))}
        </div>

        {/* Spellcasting, when there is any — with the commissioned art. */}
        {(cantrips.length > 0 || prepared.length > 0) && (
          <>
            <div className="mx-4 h-[1px]" style={{ background: RULE }} />
            <div className="p-4">
              <div className="flex items-baseline justify-between">
                <div className="font-serif text-[10px] uppercase tracking-[0.24em] text-[#a89468]">Spellcasting</div>
                <div className="text-[9px] text-[#8a7952]">
                  {sc.save_dc ? `Save DC ${sc.save_dc}` : ""}
                  {sc.attack_bonus != null ? `  ·  Attack +${sc.attack_bonus}` : ""}
                </div>
              </div>

              {Object.keys(slots).length > 0 && (
                <div className="mt-1.5 flex gap-2 text-[9px] text-[#8a7952]">
                  {Object.entries(slots).map(([lvl, s]) => (
                    <span key={lvl} className="rounded-sm border border-[#3a2f1e] bg-black/40 px-2 py-0.5">
                      Level {lvl}: <span className="text-[#e0d2ae]">{(s?.max ?? 0) - (s?.used ?? 0)}/{s?.max ?? 0}</span>
                    </span>
                  ))}
                </div>
              )}

              {[["Cantrips", cantrips], ["Prepared", prepared]].map(([title, list]) => {
                const items = list as string[]
                if (!items.length) return null
                return (
                  <div key={title as string} className="mt-2.5">
                    <div className="text-[8px] uppercase tracking-[0.18em] text-[#6b5a34]">{title as string}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {items.map((name) => {
                        const art = iconFor(name)
                        return (
                          <div
                            key={name}
                            title={name}
                            className="flex items-center gap-1.5 rounded-sm border border-[#3a2f1e] bg-black/40 py-1 pl-1 pr-2"
                          >
                            {art ? (
                              <img src={art} alt="" className="h-6 w-6 rounded-sm object-cover" />
                            ) : (
                              // No commissioned art yet — say so quietly rather
                              // than showing a broken frame.
                              <span className="grid h-6 w-6 place-items-center rounded-sm border border-[#2a2216] text-[8px] text-[#5f5540]">—</span>
                            )}
                            <span className="font-serif text-[10px] text-[#d8c9a8]">{name}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {feats.length > 0 && (
          <>
            <div className="mx-4 h-[1px]" style={{ background: RULE }} />
            <div className="p-4">
              <div className="font-serif text-[10px] uppercase tracking-[0.24em] text-[#a89468]">Features</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {feats.map((f) => (
                  <span key={f} className="rounded-sm border border-[#3a2f1e] bg-black/40 px-2 py-1 text-[10px] text-[#d8c9a8]">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-[#2a2216] p-3">
          <button
            onClick={onClose}
            className="rounded-sm border border-[#6b5123] bg-gradient-to-b from-[#2a1f10] to-[#120c06] px-5 py-1.5 font-serif text-[10px] uppercase tracking-[0.2em] text-[#f0cd7a] hover:border-[#c99a49]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
