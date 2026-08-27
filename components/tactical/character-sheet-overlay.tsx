"use client"

// ============================================================================
// THE FULL SHEET — opened from a character card.
//
// Sam's reference is an illuminated page: a name banner across the top, the
// figure standing in the middle with ability medallions floating around him,
// saving throws and skills down the left, spellcasting down the right, and
// the globes and ability rack along the foot.
//
// EVERY NUMBER HERE IS DERIVED OR STORED — none is decorative. Saving throws
// and skills are computed the SRD way (ability modifier, plus proficiency
// only where the sheet says the character is proficient), so a sheet edit
// moves them and nothing has to be kept in sync by hand.
//
// Where the reference art and the campaign disagree, the campaign wins: the
// art shows a High Elf with a shortbow, Samson is a Human acolyte with a
// mace. The layout is the brief; the data is his own.
// ============================================================================

import { useEffect } from "react"
import { iconFor } from "@/lib/action-icons"
import { ConditionBadges } from "@/components/conditions/condition-badges"
import type { HudCharacter } from "./combat-hud"

const PARCHMENT =
  "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/ui/parchment.webp"

const GOLD = "#cdb276"
const BRONZE = "#a88745"

/** SRD skill list, each with the ability it keys off. */
const SKILLS: [string, keyof typeof ABIL][] = [
  ["Acrobatics", "dex"], ["Animal Handling", "wis"], ["Arcana", "int"],
  ["Athletics", "str"], ["Deception", "cha"], ["History", "int"],
  ["Insight", "wis"], ["Intimidation", "cha"], ["Investigation", "int"],
  ["Medicine", "wis"], ["Nature", "int"], ["Perception", "wis"],
  ["Performance", "cha"], ["Persuasion", "cha"], ["Religion", "int"],
  ["Sleight of Hand", "dex"], ["Stealth", "dex"], ["Survival", "wis"],
]
const ABIL = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" } as const
type AbilKey = keyof typeof ABIL

const sign = (n: number) => `${n >= 0 ? "+" : ""}${n}`

/** A gold-rimmed medallion — the ability scores and the standalone numbers. */
function Medallion({
  score, label, mod, size = 64,
}: { score: number | string; label: string; mod?: number | null; size?: number }) {
  return (
    <div className="relative" style={{ width: size }}>
      {mod != null && (
        <div className="absolute -top-1.5 right-0 z-10 rounded-full border border-[#8d6d35] bg-[#100d08] px-1.5 py-[1px] font-serif text-[10px] text-[#e8dcc0]">
          {sign(mod)}
        </div>
      )}
      <div
        className="flex items-center justify-center rounded-full border-2 border-[#8d6d35]"
        style={{ width: size, height: size, background: "radial-gradient(circle at 50% 35%, #f3ead4, #cbb98f)" }}
      >
        <span className="font-serif text-[22px] font-bold text-[#2a2013]">{score}</span>
      </div>
      <div className="mt-0.5 text-center text-[7px] uppercase tracking-[0.16em] text-[#a89468]">{label}</div>
    </div>
  )
}

/** A parchment plate — the boxed panels down the sides. */
function Plate({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"overflow-hidden rounded-sm border border-[#8d6d35] bg-[#e9dfc2]/92 shadow-[0_2px_6px_rgba(30,20,8,0.35)] " + className}>
      {title && (
        <div className="border-b border-[#8d6d35] bg-[#1a1409] px-2 py-1 text-center font-serif text-[9px] uppercase tracking-[0.2em] text-[#e6c77e]">
          {title}
        </div>
      )}
      <div className="p-2">{children}</div>
    </div>
  )
}

export function CharacterSheetOverlay({
  character: c,
  onClose,
  onEndTurn,
}: {
  character: HudCharacter
  onClose: () => void
  onEndTurn?: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const scores: Record<AbilKey, number | null | undefined> = {
    str: c.str_score, dex: c.dex_score, con: c.con_score,
    int: c.int_score, wis: c.wis_score, cha: c.cha_score,
  }
  const modOf = (k: AbilKey) => {
    const v = scores[k]
    return v == null ? 0 : Math.floor((v - 10) / 2)
  }
  const prof = c.proficiency_bonus ?? 2

  // Proficiency lists arrive as jsonb. Saves are an array of ability keys;
  // skills are an object keyed by skill name. Both are read defensively —
  // a missing list means "proficient in nothing", never a crash.
  const saveProf = new Set(
    (Array.isArray(c.sheet_save_proficiencies) ? c.sheet_save_proficiencies : [])
      .map((x) => String(x).toLowerCase()),
  )
  const skillProfRaw = (c.sheet_skill_proficiencies ?? {}) as Record<string, unknown>
  const skillProf = new Set(Object.keys(skillProfRaw).map((k) => k.toLowerCase()))

  const saveMod = (k: AbilKey) => modOf(k) + (saveProf.has(k) ? prof : 0)
  const skillMod = (name: string, k: AbilKey) =>
    modOf(k) + (skillProf.has(name.toLowerCase()) ? prof : 0)

  const sc = c.sheet_spellcasting ?? {}
  const cantrips = sc.cantrips ?? []
  const prepared = sc.prepared ?? []
  const slotRows = Object.entries(sc.slots ?? {}).sort(([a], [b]) => Number(a) - Number(b))
  const slotsMax = slotRows.reduce((n, [, v]) => n + (v?.max ?? 0), 0)
  const slotsUsed = slotRows.reduce((n, [, v]) => n + (v?.used ?? 0), 0)

  const attacks = Array.isArray(c.sheet_attacks) ? c.sheet_attacks : []
  const xp = c.xp ?? 0
  const xpNext = c.xp_to_next ?? 0
  const xpPct = xpNext > 0 ? Math.min(100, Math.round((xp / xpNext) * 100)) : 0

  // The rack: cantrips first, then prepared, capped at six — the same order
  // the HUD rack uses, so muscle memory carries between the two.
  const rack = [...cantrips, ...prepared].slice(0, 6)
  // Feature art for the page. hero_image_url is the character in their
  // finery; the standee is how they look right now (in rags, in the pen).
  // The sheet wants the hero, and falls back rather than rendering empty.
  const hero = c.hero_image_url || c.avatar_image_url || c.portrait_image_url

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[96vh] w-full max-w-[1020px] flex-col overflow-hidden rounded border-2 border-[#8d6d35] bg-[#0b0906] shadow-[0_0_60px_#000]"
        style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, #1b150c 0%, #0b0906 60%)" }}
      >
        {/* ─── HEADER: name banner, then race / background / experience ─── */}
        <div className="flex shrink-0 items-stretch gap-2 border-b-2 border-[#6b5123] p-2">
          <div className="flex min-w-0 flex-1 flex-col justify-center rounded-sm border border-[#7d2b28] bg-gradient-to-b from-[#5c1f1c] to-[#2c0f0d] px-4 py-2">
            <h2 className="truncate font-serif text-[26px] font-bold uppercase tracking-[0.06em] text-[#f4e9cf]">
              {c.name}
            </h2>
            <div className="font-serif text-[11px] uppercase tracking-[0.22em] text-[#d9b877]">
              Level {c.level ?? "—"} {c.class ?? ""}
            </div>
          </div>

          <div className="flex shrink-0 items-end gap-1.5">
            {[
              ["Race", c.sheet_species ?? "—"],
              ["Background", c.sheet_background ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="w-[118px] rounded-sm border border-[#6b5123] bg-[#17140d] px-2 py-1 text-center">
                <div className="text-[7px] uppercase tracking-[0.18em] text-[#8a7952]">{label}</div>
                <div className="truncate font-serif text-[12px] text-[#e8dcc0]">{value}</div>
              </div>
            ))}
            <div className="w-[150px] rounded-sm border border-[#6b5123] bg-[#17140d] px-2 py-1 text-center">
              <div className="text-[7px] uppercase tracking-[0.18em] text-[#8a7952]">Experience Points</div>
              <div className="font-serif text-[12px] text-[#e8dcc0]">{xp} / {xpNext || "—"}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#241a2e]">
                <div className="h-full bg-gradient-to-r from-[#7d4fd0] to-[#b58ef5]" style={{ width: `${xpPct}%` }} />
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="shrink-0 self-start rounded-sm border border-[#6b5123] px-2 py-1 font-serif text-[10px] uppercase tracking-[0.16em] text-[#cdb276] hover:border-[#a88745]"
          >
            Close
          </button>
        </div>

        {/* ─── BODY ───────────────────────────────────────────────────────
            Five columns, and the medallion gutters are the whole point of
            the shape. The first cut floated the ability scores over the
            portrait and covered the character; they now sit in their own
            narrow columns either side, so the figure is never crossed. */}
        <div
          className="grid min-h-0 flex-1 grid-cols-[264px_72px_1fr_72px_196px] gap-1.5 overflow-y-auto p-2"
          style={{ backgroundImage: `url(${PARCHMENT})`, backgroundSize: "512px" }}
        >
          {/* COLUMN 1 — saving throws, skills, attacks */}
          <div className="flex flex-col gap-1.5">
            <Plate title="Saving Throws">
              <div className="flex justify-between">
                {(Object.keys(ABIL) as AbilKey[]).map((k) => (
                  <div key={k} className="text-center">
                    <div
                      className={
                        "flex h-7 w-9 items-center justify-center rounded-sm border font-serif text-[13px] " +
                        (saveProf.has(k)
                          ? "border-[#8d6d35] bg-[#e6d9b6] text-[#2a2013]"
                          : "border-[#8d6d35]/50 bg-[#efe6cf]/70 text-[#4a3d24]")
                      }
                    >
                      {sign(saveMod(k))}
                    </div>
                    <div className="mt-0.5 text-[7px] uppercase tracking-wider text-[#6b5a34]">{ABIL[k]}</div>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-center text-[7px] leading-tight text-[#6b5a34]">
                Filled = proficient · includes the +{prof} proficiency bonus
              </p>
            </Plate>

            <Plate title="Skills">
              <div className="space-y-[1px]">
                {SKILLS.map(([name, k]) => {
                  const isProf = skillProf.has(name.toLowerCase())
                  return (
                    <div key={name} className="flex items-center gap-1.5 px-1">
                      <span
                        className={
                          "h-2 w-2 shrink-0 rounded-full border " +
                          (isProf ? "border-[#6b5a34] bg-[#8d6d35]" : "border-[#8d6d35]/50 bg-transparent")
                        }
                      />
                      <span className={"flex-1 truncate text-[9px] " + (isProf ? "font-semibold text-[#2a2013]" : "text-[#4a3d24]")}>
                        {name} <span className="text-[7px] text-[#6b5a34]">({ABIL[k]})</span>
                      </span>
                      <span className="w-8 rounded-sm border border-[#8d6d35]/50 bg-[#efe6cf]/80 text-center font-serif text-[10px] text-[#2a2013]">
                        {sign(skillMod(name, k))}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Plate>

            {attacks.length > 0 && (
              <Plate title="Attacks">
                <div className="space-y-1">
                  {attacks.slice(0, 4).map((a, i) => {
                    const atk = a as { name?: string; type?: string; hit?: string; damage?: string; range?: string }
                    return (
                      <div key={i} className="rounded-sm border border-[#4b3a19] bg-[#17130c]/92 px-2 py-1">
                        <div className="flex items-baseline justify-between">
                          <span className="font-serif text-[11px] uppercase tracking-wide text-[#f2e6c8]">{atk.name}</span>
                          <span className="font-serif text-[11px] text-[#e6c77e]">{atk.hit}</span>
                        </div>
                        <div className="flex items-baseline justify-between text-[8px] text-[#a89468]">
                          <span>{atk.type}{atk.range ? ` · ${atk.range}` : ""}</span>
                          <span className="text-[#d8c9a8]">{atk.damage}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Plate>
            )}
          </div>

          {/* COLUMN 2 — left medallion gutter */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <Medallion score={sign(prof)} label="Proficiency" size={58} />
            <Medallion score={scores.int ?? "—"} mod={modOf("int")} label="Intelligence" size={58} />
            <Medallion score={scores.wis ?? "—"} mod={modOf("wis")} label="Wisdom" size={58} />
            <Medallion score={scores.cha ?? "—"} mod={modOf("cha")} label="Charisma" size={58} />
          </div>

          {/* COLUMN 3 — the figure, uncovered */}
          <div className="relative min-h-[440px] overflow-hidden rounded-sm">
            {hero ? (
              <img
                src={hero}
                alt={c.name}
                className="absolute inset-0 h-full w-full object-contain object-bottom"
                style={{ filter: "drop-shadow(0 10px 26px rgba(40,28,10,0.55))" }}
              />
            ) : (
              <div className="flex h-full items-center justify-center font-serif text-7xl text-[#8d6d35]/35">
                {c.name[0]}
              </div>
            )}

            {c.conditions != null && (
              <div className="absolute left-1/2 top-2 -translate-x-1/2">
                <ConditionBadges conditions={c.conditions} />
              </div>
            )}

            <div className="absolute inset-x-0 bottom-1 flex items-end justify-center gap-5">
              <div className="text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#4a6b8d] bg-[#efe6cf] font-serif text-[15px] text-[#1d2a38]">
                  {sign(c.initiative ?? c.dex_modifier ?? 0)}
                </div>
                <div className="mt-0.5 text-[7px] uppercase tracking-wider text-[#3c556f]">Initiative</div>
              </div>
              <div className="text-center">
                <div className="flex h-16 w-14 items-center justify-center rounded-b-[45%] rounded-t-sm border-2 border-[#8d6d35] bg-gradient-to-b from-[#f3ead4] to-[#c2ae83] font-serif text-[24px] font-bold text-[#2a2013]">
                  {c.ac ?? "—"}
                </div>
                <div className="mt-0.5 text-[7px] uppercase tracking-wider text-[#6b5a34]">Armor Class</div>
              </div>
              <div className="text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#7d2b28] bg-[#efe6cf] font-serif text-[14px] text-[#3a1210]">
                  {(c.speed ?? "—").replace(/\s*ft\.?.*$/i, "")}
                </div>
                <div className="mt-0.5 text-[7px] uppercase tracking-wider text-[#7d2b28]">Speed</div>
              </div>
            </div>
          </div>

          {/* COLUMN 4 — right medallion gutter */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <Medallion score={scores.con ?? "—"} mod={modOf("con")} label="Constitution" size={58} />
            <Medallion score={scores.dex ?? "—"} mod={modOf("dex")} label="Dexterity" size={58} />
            <Medallion score={scores.str ?? "—"} mod={modOf("str")} label="Strength" size={58} />
          </div>

          {/* COLUMN 5 — spellcasting */}
          <div className="flex flex-col gap-1.5">
            <Plate title="Spellcasting">
              {(sc.save_dc != null || sc.attack_bonus != null) && (
                <div className="mb-1.5 text-center text-[9px] text-[#4a3d24]">
                  Save DC {sc.save_dc ?? "—"} · Attack {sign(sc.attack_bonus ?? 0)}
                </div>
              )}
              {slotRows.map(([lvl, v]) => (
                <div key={lvl} className="mb-1.5 rounded-sm border border-[#8d6d35] bg-[#3a2d18] py-[3px] text-center font-serif text-[10px] uppercase tracking-[0.14em] text-[#f6e9c6]">
                  Level {lvl}: {(v?.max ?? 0) - (v?.used ?? 0)}/{v?.max ?? 0}
                </div>
              ))}
              {cantrips.length > 0 && (
                <>
                  <div className="mb-1 mt-2 text-[8px] uppercase tracking-[0.18em] text-[#6b5a34]">Cantrips</div>
                  {cantrips.map((s) => <SpellRow key={s} name={s} />)}
                </>
              )}
              {prepared.length > 0 && (
                <>
                  <div className="mb-1 mt-2 text-[8px] uppercase tracking-[0.18em] text-[#6b5a34]">Prepared Spells</div>
                  {prepared.map((s) => <SpellRow key={s} name={s} />)}
                </>
              )}
            </Plate>
          </div>
        </div>

        {/* ─── FOOT: globes, the rack, and the turn ──────────────────────── */}
        <div className="flex shrink-0 items-center gap-3 border-t-2 border-[#6b5123] bg-[#0a0806] px-3 py-2">
          <Globe
            value={`${c.hp_current ?? 0}/${c.hp_max ?? 0}`}
            label="Hit Points"
            from="#c2352f" to="#5b100d" ring="#7d2b28"
          />

          <div className="flex flex-1 justify-center gap-1.5">
            {rack.map((name, i) => {
              const art = iconFor(name)
              return (
                <div key={name} className="relative w-[62px]">
                  <div className="absolute left-1 top-0.5 z-10 font-serif text-[8px] text-[#cdb276]">{i + 1}</div>
                  <div className="flex h-[62px] items-center justify-center overflow-hidden rounded-sm border border-[#6b5123] bg-[#12100b]">
                    {art
                      ? <img src={art} alt={name} className="h-full w-full object-contain" />
                      : <span className="px-1 text-center font-serif text-[8px] text-[#cdb276]">{name}</span>}
                  </div>
                  <div className="mt-0.5 truncate text-center text-[7px] uppercase tracking-wider text-[#a89468]" title={name}>
                    {name}
                  </div>
                </div>
              )
            })}
          </div>

          <Globe
            value={`${slotsMax - slotsUsed}/${slotsMax}`}
            label="Spell Slots"
            from="#8b5fd0" to="#2c1252" ring="#5b3a94"
          />

          {onEndTurn && (
            <button
              onClick={onEndTurn}
              className="shrink-0 rounded-sm border-2 border-[#7d2b28] bg-gradient-to-b from-[#5c1f1c] to-[#2c0f0d] px-5 py-3 font-serif text-[13px] uppercase tracking-[0.18em] text-[#f4e9cf] hover:border-[#a8413c]"
            >
              End Turn
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** One spell in the right-hand column, with its commissioned art if it has any. */
function SpellRow({ name }: { name: string }) {
  const art = iconFor(name)
  return (
    <div className="mb-[3px] flex items-center gap-1.5 rounded-sm border border-[#3a2f1e] bg-black/40 px-1.5 py-1">
      <div className="h-6 w-6 shrink-0 overflow-hidden rounded-sm border border-[#4b3a19] bg-[#0a0806]">
        {art
          ? <img src={art} alt="" className="h-full w-full object-contain" />
          : <div className="flex h-full items-center justify-center font-serif text-[9px] text-[#6b5a34]">◈</div>}
      </div>
      <span className="truncate text-[9px] text-[#ddd2bc]" title={name}>{name}</span>
    </div>
  )
}

/** The Diablo globe. Fill is proportional, so a hurt character reads at a glance. */
function Globe({
  value, label, from, to, ring,
}: { value: string; label: string; from: string; to: string; ring: string }) {
  const [cur, max] = value.split("/").map((n) => Number(n) || 0)
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0
  return (
    <div className="shrink-0 text-center">
      <div
        className="relative flex h-[68px] w-[68px] items-end justify-center overflow-hidden rounded-full border-2"
        style={{ borderColor: ring, background: "#0a0806" }}
      >
        <div
          className="absolute inset-x-0 bottom-0 transition-[height]"
          style={{ height: `${pct}%`, background: `linear-gradient(180deg, ${from}, ${to})` }}
        />
        <div className="relative z-10 flex h-full w-full items-center justify-center font-serif text-[15px] font-bold text-[#f4e9cf] drop-shadow-[0_1px_2px_#000]">
          {value}
        </div>
      </div>
      <div className="mt-0.5 text-[7px] uppercase tracking-[0.16em] text-[#a89468]">{label}</div>
    </div>
  )
}
