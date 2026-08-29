"use client"

import { useEffect, type ReactNode } from "react"
import { iconFor } from "@/lib/action-icons"
import { frameForClass } from "@/lib/class-frames"
import type { HudCharacter, HudLogLine } from "./combat-hud"
import { Globe } from "./essence-globe"
import { ClassMedallion } from "./class-medallion"

const ABIL = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" } as const
type AbilKey = keyof typeof ABIL

const SKILLS: [string, AbilKey][] = [
  ["Acrobatics", "dex"], ["Animal Handling", "wis"], ["Arcana", "int"],
  ["Athletics", "str"], ["Deception", "cha"], ["History", "int"],
  ["Insight", "wis"], ["Intimidation", "cha"], ["Investigation", "int"],
  ["Medicine", "wis"], ["Nature", "int"], ["Perception", "wis"],
  ["Performance", "cha"], ["Persuasion", "cha"], ["Religion", "int"],
  ["Sleight of Hand", "dex"], ["Stealth", "dex"], ["Survival", "wis"],
]

const sign = (n: number) => `${n >= 0 ? "+" : ""}${n}`

function DarkPanel({
  title,
  children,
  className = "",
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={
        "relative overflow-hidden border border-[#5c4525] bg-[linear-gradient(180deg,rgba(16,12,9,.98),rgba(5,4,3,.98))] " +
        "shadow-[0_9px_24px_#000b,inset_0_0_0_1px_#d6ab5720] " +
        className
      }
    >
      <span className="pointer-events-none absolute left-[5px] top-[5px] z-10 h-[7px] w-[7px] rotate-45 border border-[#8b6b32] bg-[#0c0906]" />
      <span className="pointer-events-none absolute right-[5px] top-[5px] z-10 h-[7px] w-[7px] rotate-45 border border-[#8b6b32] bg-[#0c0906]" />
      {title && (
        <div className="border-b border-[#4a371f] bg-[linear-gradient(180deg,#26190d,#100a06)] px-3 py-1.5 text-center font-serif text-[10px] uppercase tracking-[0.22em] text-[#d2ae63]">
          {title}
        </div>
      )}
      <div className="p-2">{children}</div>
    </section>
  )
}

function CoreStat({
  label,
  value,
  icon,
}: {
  label: string
  value: string | number
  icon?: string
}) {
  return (
    <div className="min-w-0 flex-1 border-x border-[#49371e] bg-[#070605]/65 px-3 py-2 text-center">
      <div className="text-[8px] uppercase tracking-[0.19em] text-[#9c865b]">{label}</div>
      <div className="mt-0.5 flex items-center justify-center gap-1.5 font-serif text-[20px] text-[#ead9b4]">
        {icon && <span className="text-[#d3ad5f]">{icon}</span>}
        <span>{value}</span>
      </div>
    </div>
  )
}

function AbilityCell({
  label,
  score,
  mod,
}: {
  label: string
  score: number | null | undefined
  mod: number
}) {
  return (
    <div className="relative border-r border-[#49361d] px-1 py-1.5 text-center last:border-r-0">
      <div className="font-serif text-[9px] tracking-[0.13em] text-[#bca678]">{label}</div>
      <div className="font-serif text-[21px] leading-tight text-[#f0dfba]">{sign(mod)}</div>
      <div className="font-serif text-[10px] text-[#75694f]">{score ?? "—"}</div>
    </div>
  )
}

function SpellRow({ name, hotkey }: { name: string; hotkey?: number }) {
  const art = iconFor(name)
  return (
    <div className="group flex min-h-[48px] items-center gap-2 border-b border-[#352818] px-1 py-1.5 last:border-0">
      <div className="relative h-[40px] w-[40px] shrink-0 overflow-hidden border border-[#755527] bg-[#070504] shadow-[0_2px_8px_#000]">
        {art ? (
          <img src={art} alt={name} className="h-full w-full object-cover brightness-[.95] transition group-hover:brightness-110" />
        ) : (
          <div className="grid h-full w-full place-items-center px-1 text-center font-serif text-[6px] leading-tight text-[#cbb98f]">
            {name}
          </div>
        )}
        {hotkey != null && (
          <span className="absolute left-0 top-0 grid h-[13px] min-w-[13px] place-items-center border-r border-b border-[#856329] bg-black/85 px-[2px] font-serif text-[7px] text-[#efcf77]">
            {hotkey}
          </span>
        )}
      </div>
      <span className="min-w-0 truncate font-serif text-[11px] uppercase tracking-[0.03em] text-[#ded0af]">{name}</span>
    </div>
  )
}

function MiniMedallion({
  label,
  score,
  mod,
  accent,
}: {
  label: string
  score: number | string
  mod?: number | null
  accent: string
}) {
  return (
    <div className="relative w-[78px] text-center">
      {mod != null && (
        <span
          className="absolute -left-1 top-0 z-20 grid h-[25px] w-[25px] place-items-center rounded-full border bg-[#0b0806] font-serif text-[10px] text-[#f2dfb4]"
          style={{ borderColor: accent, boxShadow: `0 0 8px ${accent}55` }}
        >
          {sign(mod)}
        </span>
      )}
      <div
        className="mx-auto grid h-[62px] w-[62px] place-items-center rounded-full border-2 bg-[radial-gradient(circle_at_45%_30%,#20222a,#080706_65%)] font-serif text-[21px] text-[#efe0bd]"
        style={{ borderColor: "#806331", boxShadow: `inset 0 0 18px #000,0 0 10px ${accent}33` }}
      >
        {score}
      </div>
      <div className="-mt-1 border border-[#58431f] bg-[#090705]/95 px-1 py-1 font-serif text-[7px] uppercase tracking-[0.08em] text-[#b8a57c]">
        {label}
      </div>
    </div>
  )
}

function CombatLogPanel({ log }: { log: HudLogLine[] }) {
  return (
    <DarkPanel title="Combat Log" className="h-full">
      <div className="max-h-[370px] overflow-y-auto pr-1">
        {log.length === 0 ? (
          <div className="py-5 text-center font-serif text-[9px] italic text-[#695f4a]">The dark is quiet.</div>
        ) : (
          log.slice(-10).map((line) => {
            const hostile = /takes|damage|critical|wounded|misses/i.test(line.text)
            return (
              <div key={line.id} className="border-b border-[#2c2115] py-2 text-[10px] leading-[1.45] last:border-0">
                <span className={line.speaker === "Malachar" ? "font-serif text-[#b68add]" : "font-serif text-[#d7c6a2]"}>
                  {line.speaker}
                </span>
                <span className={hostile ? " text-[#c85543]" : " text-[#aaa087]"}> {line.text}</span>
              </div>
            )
          })
        )}
      </div>
    </DarkPanel>
  )
}

export function CharacterSheetOverlay({
  character: c,
  onClose,
  onEndTurn,
  log = [],
}: {
  character: HudCharacter
  onClose: () => void
  onEndTurn?: () => void
  log?: HudLogLine[]
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const cls = frameForClass(c.class)
  const accent = cls.accent

  const scores: Record<AbilKey, number | null | undefined> = {
    str: c.str_score,
    dex: c.dex_score,
    con: c.con_score,
    int: c.int_score,
    wis: c.wis_score,
    cha: c.cha_score,
  }
  const modOf = (k: AbilKey) => {
    const v = scores[k]
    return v == null ? 0 : Math.floor((v - 10) / 2)
  }

  const prof = c.proficiency_bonus ?? 2
  const saveProf = new Set(
    (Array.isArray(c.sheet_save_proficiencies) ? c.sheet_save_proficiencies : [])
      .map((x) => String(x).toLowerCase()),
  )
  const skillProfRaw = (c.sheet_skill_proficiencies ?? {}) as Record<string, unknown>
  const skillProf = new Set(Object.keys(skillProfRaw).map((k) => k.toLowerCase()))
  const saveMod = (k: AbilKey) => modOf(k) + (saveProf.has(k) ? prof : 0)
  const skillMod = (name: string, k: AbilKey) => modOf(k) + (skillProf.has(name.toLowerCase()) ? prof : 0)

  const sc = c.sheet_spellcasting ?? {}
  const cantrips = sc.cantrips ?? []
  const prepared = sc.prepared ?? []
  const slotRows = Object.entries(sc.slots ?? {}).sort(([a], [b]) => Number(a) - Number(b))
  const slotsMax = slotRows.reduce((n, [, v]) => n + (v?.max ?? 0), 0)
  const slotsUsed = slotRows.reduce((n, [, v]) => n + (v?.used ?? 0), 0)
  const slotsRemaining = Math.max(0, slotsMax - slotsUsed)

  const attacks = Array.isArray(c.sheet_attacks) ? c.sheet_attacks : []
  const rack = [...cantrips, ...prepared].slice(0, 6)
  const xp = c.xp ?? 0
  const xpNext = c.xp_to_next ?? 0
  const xpPct = xpNext > 0 ? Math.min(100, Math.round((xp / xpNext) * 100)) : 0
  const hero = c.hero_image_url || c.avatar_image_url || c.portrait_image_url
  const hpCur = c.hp_current ?? c.hp_max ?? 0
  const hpMax = c.hp_max ?? 0
  const initiative = c.initiative ?? c.dex_modifier ?? 0

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-2 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[98vh] w-full max-w-[1640px] flex-col overflow-hidden border-2 border-[#6c5127] bg-[#050403] shadow-[0_0_90px_#000]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 38%,rgba(43,22,58,.22),transparent 40%),linear-gradient(180deg,#0b0806,#050403 52%,#020202)",
        }}
      >
        <div className="pointer-events-none absolute inset-[5px] z-50 border border-[#b18a4226]" />
        <div className="pointer-events-none absolute inset-[9px] z-50 border border-[#2f2415]" />

        <header className="relative z-10 grid shrink-0 grid-cols-[140px_540px_1fr] border-b border-[#594221] bg-black/55">
          <div className="relative h-[132px] overflow-hidden border-r border-[#594221] bg-[#060403] p-1.5">
            <ClassMedallion
              faceUrl={c.face_image_url}
              portraitUrl={c.portrait_image_url}
              characterClass={c.class}
              className="scale-[1.06]"
              fallback={<span className="font-serif text-4xl" style={{ color: accent }}>{c.name.slice(0, 1)}</span>}
            />
          </div>

          <div className="min-w-0 px-4 py-3">
            <h2 className="truncate font-serif text-[31px] font-semibold uppercase tracking-[0.08em] text-[#efe3c8] [text-shadow:0_2px_10px_#000]">
              {c.name}
            </h2>
            <div className="font-serif text-[13px] uppercase tracking-[0.22em]" style={{ color: accent }}>
              Level {c.level ?? "—"} {c.class ?? "Adventurer"}{c.subclass ? ` · ${c.subclass}` : ""}
            </div>
            <div className="mt-3 flex border-y border-[#49371e]">
              <CoreStat label="HP" value={`${hpCur}/${hpMax || "—"}`} icon="♥" />
              <CoreStat label="AC" value={c.ac ?? "—"} icon="◈" />
              <CoreStat label="Initiative" value={sign(initiative)} />
              <CoreStat label="Speed" value={c.speed || "—"} />
            </div>
          </div>

          <div className="flex min-w-0 items-start justify-end gap-2 px-3 py-3">
            <div className="w-[130px] border border-[#594221] bg-[#090706]/90 px-3 py-2 text-center">
              <div className="text-[7px] uppercase tracking-[0.19em] text-[#8f7a51]">Race</div>
              <div className="mt-1 truncate font-serif text-[16px] text-[#e3d3af]">{c.sheet_species ?? "—"}</div>
            </div>
            <div className="w-[150px] border border-[#594221] bg-[#090706]/90 px-3 py-2 text-center">
              <div className="text-[7px] uppercase tracking-[0.19em] text-[#8f7a51]">Background</div>
              <div className="mt-1 truncate font-serif text-[16px] text-[#e3d3af]">{c.sheet_background ?? "—"}</div>
            </div>
            <div className="w-[190px] border border-[#594221] bg-[#090706]/90 px-3 py-2">
              <div className="text-center text-[7px] uppercase tracking-[0.19em] text-[#8f7a51]">Experience Points</div>
              <div className="mt-1 text-center font-serif text-[14px] text-[#e3d3af]">{xp} / {xpNext || "—"}</div>
              <div className="mt-2 h-[5px] overflow-hidden bg-[#17101e]">
                <div
                  className="h-full shadow-[0_0_10px_currentColor]"
                  style={{
                    width: `${xpPct}%`,
                    color: accent,
                    background: `linear-gradient(90deg,${accent}88,${accent})`,
                  }}
                />
              </div>
            </div>
            <button
              onClick={onClose}
              className="border border-[#644923] bg-[#0b0704] px-4 py-2 font-serif text-[9px] uppercase tracking-[0.22em] text-[#d4b36d] hover:border-[#a67d38] hover:text-[#fff0c0]"
            >
              Close
            </button>
          </div>
        </header>

        <main className="relative z-10 grid min-h-0 flex-1 grid-cols-[350px_minmax(520px,1fr)_450px] gap-2 overflow-hidden p-2">
          <aside className="min-h-0 space-y-2 overflow-y-auto pr-1">
            <DarkPanel>
              <div className="grid grid-cols-6">
                {(Object.keys(ABIL) as AbilKey[]).map((k) => (
                  <AbilityCell key={k} label={ABIL[k]} score={scores[k]} mod={modOf(k)} />
                ))}
              </div>
            </DarkPanel>

            <DarkPanel title="Saving Throws">
              <div className="grid grid-cols-6 gap-1">
                {(Object.keys(ABIL) as AbilKey[]).map((k) => (
                  <div key={k} className="text-center">
                    <div className="font-serif text-[8px] text-[#a79676]">{ABIL[k]}</div>
                    <div className={saveProf.has(k) ? "font-serif text-[13px] text-[#e9c96f]" : "font-serif text-[13px] text-[#b8aa8d]"}>
                      {sign(saveMod(k))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1 text-center text-[7px] text-[#6f654f]">Saving throw modifiers · proficiency {sign(prof)}</div>
            </DarkPanel>

            <DarkPanel title="Skills">
              <div className="space-y-[1px]">
                {SKILLS.map(([name, k]) => {
                  const isProf = skillProf.has(name.toLowerCase())
                  return (
                    <div key={name} className="flex items-center gap-2 border-b border-[#2a2014] px-1 py-[3px] last:border-0">
                      <span
                        className={
                          "h-[7px] w-[7px] rotate-45 border " +
                          (isProf
                            ? "border-[#d0a34d] bg-[#8a4eb5] shadow-[0_0_5px_#8a4eb5]"
                            : "border-[#54442c] bg-[#080604]")
                        }
                      />
                      <span className={isProf ? "min-w-0 flex-1 truncate text-[9px] text-[#ddd0b3]" : "min-w-0 flex-1 truncate text-[9px] text-[#8d8370]"}>
                        {name} <span className="text-[7px] text-[#6f6654]">({ABIL[k]})</span>
                      </span>
                      <span className="font-serif text-[10px] text-[#d2b97d]">{sign(skillMod(name, k))}</span>
                    </div>
                  )
                })}
              </div>
            </DarkPanel>
          </aside>

          <section className="relative min-h-[565px] overflow-hidden border border-[#5a4322] bg-[#030304] shadow-[inset_0_0_90px_#000,0_8px_28px_#000d]">
            {hero && (
              <>
                <img
                  src={hero}
                  alt=""
                  className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-xl"
                  style={{ filter: "saturate(1.25) brightness(.55) contrast(1.15)" }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      `radial-gradient(circle at 63% 44%,${accent}55,transparent 24%),` +
                      "radial-gradient(circle at 50% 38%,rgba(83,44,120,.42),transparent 42%)," +
                      "linear-gradient(180deg,rgba(3,3,5,.12),rgba(2,2,3,.8))",
                  }}
                />
                <img
                  src={hero}
                  alt={c.name}
                  className="absolute inset-x-[8%] bottom-0 h-[96%] w-[84%] object-contain object-bottom"
                  style={{
                    filter: "contrast(1.12) saturate(.92) brightness(.83) drop-shadow(0 18px 28px rgba(0,0,0,.95))",
                    WebkitMaskImage: "linear-gradient(to bottom,black 0%,black 76%,transparent 100%)",
                    maskImage: "linear-gradient(to bottom,black 0%,black 76%,transparent 100%)",
                  }}
                />
              </>
            )}
            {!hero && (
              <div className="grid h-full w-full place-items-center font-serif text-7xl" style={{ color: accent }}>
                {c.name.slice(0, 1)}
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#030304dd_0%,transparent_16%,transparent_84%,#030304dd_100%)]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#030304] via-[#030304aa] to-transparent" />
            <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-gradient-to-b from-transparent via-[#a77a3a22] to-transparent" />

            <div className="absolute left-3 top-10 z-20 flex flex-col gap-3">
              <MiniMedallion label="Proficiency Bonus" score={sign(prof)} accent={accent} />
              <MiniMedallion label="Intelligence" score={scores.int ?? "—"} mod={modOf("int")} accent={accent} />
              <MiniMedallion label="Wisdom" score={scores.wis ?? "—"} mod={modOf("wis")} accent={accent} />
              <MiniMedallion label="Charisma" score={scores.cha ?? "—"} mod={modOf("cha")} accent={accent} />
            </div>

            <div className="absolute inset-x-[17%] bottom-3 z-20 space-y-1.5">
              {attacks.slice(0, 2).map((a, i) => {
                const atk = a as { name?: string; type?: string; hit?: string; damage?: string; range?: string }
                return (
                  <div key={i} className="grid grid-cols-[1.3fr_.55fr_.8fr] border border-[#55401f] bg-black/82 shadow-[0_4px_14px_#000b]">
                    <div className="border-r border-[#3c2d1a] px-3 py-2">
                      <div className="font-serif text-[12px] uppercase tracking-[0.08em] text-[#ead9b5]">{atk.name ?? "Attack"}</div>
                      <div className="text-[8px] text-[#8e8169]">{atk.type ?? ""}{atk.range ? ` · ${atk.range}` : ""}</div>
                    </div>
                    <div className="border-r border-[#3c2d1a] px-2 py-2 text-center">
                      <div className="text-[7px] uppercase tracking-[0.13em] text-[#7f725d]">Hit</div>
                      <div className="font-serif text-[14px] text-[#e7c56d]">{atk.hit ?? "—"}</div>
                    </div>
                    <div className="px-2 py-2">
                      <div className="text-[7px] uppercase tracking-[0.13em] text-[#7f725d]">Damage</div>
                      <div className="font-serif text-[13px] text-[#d8c8a7]">{atk.damage ?? "—"}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <aside className="grid min-h-0 grid-cols-[250px_1fr] gap-2 overflow-hidden">
            <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
              <DarkPanel title="Spellcasting">
                <div className="mb-2 flex items-center justify-between border-b border-[#352817] pb-2">
                  <div>
                    <div className="text-[7px] uppercase tracking-[0.18em] text-[#786a50]">Spell DC</div>
                    <div className="font-serif text-[13px] text-[#dfceaa]">{sc.save_dc ?? "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[7px] uppercase tracking-[0.18em] text-[#786a50]">Attack</div>
                    <div className="font-serif text-[13px] text-[#dfceaa]">{sc.attack_bonus == null ? "—" : sign(sc.attack_bonus)}</div>
                  </div>
                </div>

                {slotRows.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {slotRows.map(([lvl, s]) => {
                      const max = s?.max ?? 0
                      const used = s?.used ?? 0
                      const remaining = Math.max(0, max - used)
                      return (
                        <div key={lvl} className="flex items-center justify-between">
                          <span className="font-serif text-[10px] uppercase tracking-[0.09em] text-[#a59370]">Level {lvl}</span>
                          <span className="flex gap-1.5">
                            {Array.from({ length: max }).map((_, i) => (
                              <span
                                key={i}
                                className="h-[13px] w-[13px] rotate-45 border"
                                style={{
                                  borderColor: i < remaining ? accent : "#3e3346",
                                  background: i < remaining ? accent : "#0c0910",
                                  boxShadow: i < remaining ? `0 0 8px ${accent}` : undefined,
                                }}
                              />
                            ))}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {cantrips.length > 0 && (
                  <div className="mb-2">
                    <div className="mb-1 text-[8px] uppercase tracking-[0.18em] text-[#8a7650]">Cantrips</div>
                    {cantrips.map((n) => <SpellRow key={n} name={n} />)}
                  </div>
                )}

                {prepared.length > 0 && (
                  <div>
                    <div className="mb-1 text-[8px] uppercase tracking-[0.18em] text-[#8a7650]">Known / Prepared Spells</div>
                    {prepared.map((n) => <SpellRow key={n} name={n} />)}
                  </div>
                )}
              </DarkPanel>

              <DarkPanel title="Equipment">
                {attacks.length > 0 ? (
                  <div className="space-y-1">
                    {attacks.slice(0, 3).map((a, i) => {
                      const atk = a as { name?: string; type?: string }
                      return (
                        <div key={i} className="flex items-center justify-between border-b border-[#2d2215] py-1 last:border-0">
                          <span className="font-serif text-[10px] text-[#cfc0a2]">{atk.name ?? "Weapon"}</span>
                          <span className="text-[7px] text-[#756b57]">{atk.type ?? ""}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="font-serif text-[9px] italic text-[#6d624e]">No attack equipment recorded.</div>
                )}
              </DarkPanel>
            </div>

            <div className="flex min-h-0 flex-col gap-2">
              <CombatLogPanel log={log} />

              {onEndTurn && (
                <button
                  onClick={onEndTurn}
                  className="shrink-0 border-2 border-[#75431f] bg-[linear-gradient(180deg,#40150d,#210805_55%,#0b0302)] px-2 py-3 font-serif text-[16px] uppercase tracking-[0.13em] text-[#dc9e48] shadow-[0_4px_0_#050201,0_8px_18px_#000c,inset_0_1px_0_#f2b45e33] hover:border-[#b5672c] hover:text-[#f3bd68]"
                  style={{ clipPath: "polygon(7% 0,93% 0,100% 22%,100% 78%,93% 100%,7% 100%,0 78%,0 22%)" }}
                >
                  End Turn
                </button>
              )}

              <DarkPanel title="Bonus Action">
                <div className="flex justify-center gap-2 py-2">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className="h-[13px] w-[13px] rotate-45 border"
                      style={{
                        borderColor: i === 0 ? accent : "#4a3a27",
                        background: i === 0 ? accent : "#090705",
                        boxShadow: i === 0 ? `0 0 8px ${accent}` : undefined,
                      }}
                    />
                  ))}
                </div>
              </DarkPanel>
            </div>
          </aside>
        </main>

        <footer className="relative z-20 grid shrink-0 grid-cols-[225px_minmax(0,1fr)_225px] items-end border-t border-[#58401f] bg-[linear-gradient(180deg,#080604,#020202)] px-5 py-2 shadow-[0_-12px_28px_#000c]">
          <div className="relative flex justify-center">
            <div className="absolute bottom-[-6px] h-[88px] w-[200px] rounded-[50%] border-b-2 border-[#59411e] opacity-70" />
            <Globe value={hpCur} max={hpMax} label="Hit Points" variant="life" size={118} />
          </div>

          <div className="mb-2 min-w-0">
            <div className="mb-1 text-center font-serif text-[8px] uppercase tracking-[0.23em] text-[#86744e]">Combat Abilities</div>
            <div className="relative mx-auto flex w-fit max-w-full gap-1 border-y border-[#5a421f] bg-[#080604]/95 px-2 py-2 shadow-[inset_0_1px_0_#c69a4622]">
              {rack.length > 0 ? (
                rack.map((name, i) => (
                  <div key={name} className="w-[112px]">
                    <SpellRow name={name} hotkey={i + 1} />
                  </div>
                ))
              ) : (
                <div className="px-8 py-5 font-serif text-[10px] italic text-[#655b48]">No prepared abilities</div>
              )}
            </div>
          </div>

          <div className="relative flex justify-center">
            <div className="absolute bottom-[-6px] h-[88px] w-[200px] rounded-[50%] border-b-2 border-[#59411e] opacity-70" />
            <Globe value={slotsRemaining} max={slotsMax} label="Spell Slots" variant="mana" size={118} />
          </div>
        </footer>
      </div>
    </div>
  )
}
