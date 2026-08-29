"use client"

import { useEffect, type ReactNode } from "react"
import { iconFor } from "@/lib/action-icons"
import type { HudCharacter } from "./combat-hud"
import { Globe } from "./essence-globe"
import { ClassMedallion } from "./class-medallion"

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

function FramePanel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={"relative overflow-hidden border border-[#6d5327] bg-[linear-gradient(180deg,rgba(24,18,11,.97),rgba(8,6,4,.96))] shadow-[0_8px_22px_#000b,inset_0_0_0_1px_#d0a85c18] " + className}>
      <span className="pointer-events-none absolute left-[5px] top-[5px] h-[7px] w-[7px] rotate-45 border border-[#8a6a32] bg-[#110c06]" />
      <span className="pointer-events-none absolute right-[5px] top-[5px] h-[7px] w-[7px] rotate-45 border border-[#8a6a32] bg-[#110c06]" />
      {title && <div className="border-b border-[#4b3820] bg-[linear-gradient(180deg,#2b1d0e,#130c06)] px-3 py-1.5 text-center font-serif text-[10px] uppercase tracking-[0.24em] text-[#d0ad62]">{title}</div>}
      <div className="p-2.5">{children}</div>
    </section>
  )
}

function CoreStat({ label, value, icon }: { label: string; value: string | number; icon?: string }) {
  return (
    <div className="relative min-w-[120px] flex-1 border border-[#5f4825] bg-[linear-gradient(180deg,#101721,#07090d)] px-3 py-2 text-center shadow-[inset_0_1px_0_#d2b06722,0_4px_10px_#0008]">
      <div className="text-[8px] uppercase tracking-[0.2em] text-[#9b8354]">{label}</div>
      <div className="mt-0.5 flex items-center justify-center gap-2 font-serif text-[21px] text-[#f1e1bb]">{icon && <span className="text-[#d0ad62]">{icon}</span>}<span>{value}</span></div>
    </div>
  )
}

function AbilityPlaque({ label, score, mod }: { label: string; score: number | null | undefined; mod: number }) {
  return (
    <div className="relative h-[86px] min-w-[112px] flex-1 px-2 pt-2 text-center">
      <div className="absolute inset-0 border border-[#9a7a3e] bg-[linear-gradient(180deg,#eadfbd,#c9b483)] shadow-[inset_0_0_0_2px_#fff5d733,inset_0_-10px_18px_#7d5e2520,0_4px_8px_#0008]" style={{ clipPath: "polygon(8% 0,92% 0,100% 16%,100% 84%,92% 100%,8% 100%,0 84%,0 16%)" }} />
      <div className="relative z-10"><div className="font-serif text-[10px] font-semibold tracking-[0.14em] text-[#40331f]">{label}</div><div className="mt-0.5 font-serif text-[27px] font-bold leading-none text-[#15120d]">{sign(mod)}</div><div className="mt-1 font-serif text-[13px] text-[#6c5731]">{score ?? "—"}</div></div>
    </div>
  )
}

function SpellTile({ name, hotkey }: { name: string; hotkey?: number }) {
  const art = iconFor(name)
  return (
    <div className="group relative flex items-center gap-2 border border-[#5c4523] bg-[linear-gradient(180deg,#181109,#090604)] p-1.5 shadow-[inset_0_1px_0_#c79a4720]">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden border border-[#80612e] bg-[#050403] shadow-[0_2px_7px_#000]">
        {art ? <img src={art} alt={name} className="h-full w-full object-cover brightness-[.96] transition group-hover:brightness-110" /> : <div className="grid h-full w-full place-items-center px-1 text-center font-serif text-[7px] leading-tight text-[#d8c59a]">{name}</div>}
        {hotkey != null && <span className="absolute left-0.5 top-0.5 grid h-4 min-w-4 place-items-center border border-[#8e692e] bg-black/80 px-0.5 font-serif text-[7px] text-[#f0cd79]">{hotkey}</span>}
      </div>
      <div className="min-w-0 font-serif text-[11px] uppercase tracking-[0.04em] text-[#e2d2ad]">{name}</div>
    </div>
  )
}

export function CharacterSheetOverlay({ character: c, onClose, onEndTurn }: { character: HudCharacter; onClose: () => void; onEndTurn?: () => void }) {
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey) }, [onClose])

  const scores: Record<AbilKey, number | null | undefined> = { str: c.str_score, dex: c.dex_score, con: c.con_score, int: c.int_score, wis: c.wis_score, cha: c.cha_score }
  const modOf = (k: AbilKey) => { const v = scores[k]; return v == null ? 0 : Math.floor((v - 10) / 2) }
  const prof = c.proficiency_bonus ?? 2
  const saveProf = new Set((Array.isArray(c.sheet_save_proficiencies) ? c.sheet_save_proficiencies : []).map((x) => String(x).toLowerCase()))
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
  const rack = [...cantrips, ...prepared].slice(0, 6)
  const attacks = Array.isArray(c.sheet_attacks) ? c.sheet_attacks : []
  const xp = c.xp ?? 0
  const xpNext = c.xp_to_next ?? 0
  const xpPct = xpNext > 0 ? Math.min(100, Math.round((xp / xpNext) * 100)) : 0
  const hero = c.hero_image_url || c.avatar_image_url || c.portrait_image_url
  const hpCur = c.hp_current ?? c.hp_max ?? 0
  const hpMax = c.hp_max ?? 0
  const initiative = c.initiative ?? c.dex_modifier ?? 0

  return (
    <div className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative flex max-h-[97vh] w-full max-w-[1560px] flex-col overflow-hidden border-2 border-[#745725] bg-[#080604] shadow-[0_0_80px_#000]" style={{ backgroundImage: "radial-gradient(ellipse at 55% 20%,#1b140b 0%,#090705 52%,#050403 100%)" }}>
        <div className="pointer-events-none absolute inset-[5px] border border-[#a9823a]/30" />
        <header className="relative z-10 grid shrink-0 grid-cols-[160px_minmax(0,1fr)_390px] gap-3 border-b border-[#5c4523] bg-[linear-gradient(180deg,rgba(16,12,8,.98),rgba(8,6,4,.95))] p-3">
          <div className="relative h-[142px] overflow-hidden border border-[#70542b] bg-[#070504] shadow-[0_5px_15px_#000b]">
            <ClassMedallion faceUrl={c.face_image_url} portraitUrl={c.portrait_image_url} characterClass={c.class} className="scale-[1.08]" fallback={<span className="font-serif text-4xl text-[#caa553]">{c.name.slice(0, 1)}</span>} />
          </div>
          <div className="min-w-0 py-1">
            <h2 className="truncate font-serif text-[32px] font-semibold uppercase tracking-[0.09em] text-[#f0e5ca] [text-shadow:0_2px_8px_#000]">{c.name}</h2>
            <div className="mt-1 font-serif text-[12px] uppercase tracking-[0.26em] text-[#d0ad62]">Level {c.level ?? "—"} {c.class ?? "Adventurer"}{c.subclass ? ` · ${c.subclass}` : ""}</div>
            <div className="mt-4 flex gap-2"><CoreStat label="HP" value={`${hpCur}/${hpMax || "—"}`} icon="♥" /><CoreStat label="AC" value={c.ac ?? "—"} icon="◈" /><CoreStat label="Initiative" value={sign(initiative)} /><CoreStat label="Speed" value={c.speed || "—"} /></div>
          </div>
          <div className="flex flex-col justify-between gap-2">
            <div className="grid grid-cols-2 gap-2"><CoreStat label="Race" value={c.sheet_species ?? "—"} /><CoreStat label="Background" value={c.sheet_background ?? "—"} /></div>
            <div className="border border-[#5f4825] bg-[#0e0a06] px-3 py-2"><div className="flex items-center justify-between text-[8px] uppercase tracking-[0.18em] text-[#9a8151]"><span>Experience</span><span className="font-serif text-[11px] normal-case tracking-normal text-[#dfcfaa]">{xp} / {xpNext || "—"}</span></div><div className="mt-2 h-2 overflow-hidden border border-[#34281a] bg-[#080604]"><div className="h-full bg-[linear-gradient(90deg,#5c3193,#9d62d6)] shadow-[0_0_10px_#7f45bc]" style={{ width: `${xpPct}%` }} /></div></div>
            <button onClick={onClose} className="self-end border border-[#725326] bg-[#120c06] px-5 py-2 font-serif text-[9px] uppercase tracking-[0.24em] text-[#d8b45d] hover:border-[#b88a40] hover:text-[#fff0c0]">Close</button>
          </div>
        </header>
        <div className="relative z-10 grid shrink-0 grid-cols-6 gap-2 border-b border-[#49361d] bg-[#0a0805] px-4 py-3">{(Object.keys(ABIL) as AbilKey[]).map((k) => <AbilityPlaque key={k} label={ABIL[k]} score={scores[k]} mod={modOf(k)} />)}</div>
        <main className="relative z-10 grid min-h-0 flex-1 grid-cols-[300px_minmax(420px,1fr)_300px] gap-3 overflow-hidden p-3">
          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            <FramePanel title="Saving Throws"><div className="grid grid-cols-3 gap-1.5">{(Object.keys(ABIL) as AbilKey[]).map((k) => <div key={k} className="flex items-center justify-between border border-[#47351d] bg-[#0b0805] px-2 py-1.5"><span className="font-serif text-[10px] text-[#b9aa8b]">{ABIL[k]}</span><span className={"font-serif text-[12px] " + (saveProf.has(k) ? "text-[#efcf77]" : "text-[#d7ccb3]")}>{sign(saveMod(k))}</span></div>)}</div><div className="mt-2 text-center text-[7px] uppercase tracking-[0.14em] text-[#74674d]">Proficiency bonus {sign(prof)}</div></FramePanel>
            <FramePanel title="Skills"><div className="space-y-[2px]">{SKILLS.map(([name, k]) => { const isProf = skillProf.has(name.toLowerCase()); return <div key={name} className="flex items-center gap-2 border-b border-[#2d2316]/70 px-1 py-[3px] last:border-0"><span className={"h-2 w-2 rotate-45 border " + (isProf ? "border-[#d0a24b] bg-[#b98a37] shadow-[0_0_5px_#b98a37]" : "border-[#5a492d] bg-[#0b0805]")} /><span className={"min-w-0 flex-1 truncate text-[9px] " + (isProf ? "text-[#e4d8bd]" : "text-[#998d76]")}>{name}</span><span className="font-serif text-[10px] text-[#d3be8c]">{sign(skillMod(name, k))}</span></div> })}</div></FramePanel>
            {attacks.length > 0 && <FramePanel title="Attacks"><div className="space-y-2">{attacks.slice(0, 4).map((a, i) => { const atk = a as { name?: string; type?: string; hit?: string; damage?: string; range?: string }; return <div key={i} className="border border-[#4b371d] bg-[#0c0906] px-2 py-2"><div className="flex items-baseline justify-between"><span className="font-serif text-[11px] uppercase tracking-[0.08em] text-[#e9ddc2]">{atk.name ?? "Attack"}</span><span className="font-serif text-[12px] text-[#e0b962]">{atk.hit ?? ""}</span></div><div className="mt-1 flex justify-between text-[8px] text-[#87795f]"><span>{atk.type ?? ""}{atk.range ? ` · ${atk.range}` : ""}</span><span className="text-[#c7b68f]">{atk.damage ?? ""}</span></div></div> })}</div></FramePanel>}
          </div>
          <div className="relative min-h-[500px] overflow-hidden border border-[#5c4524] bg-[#070504] shadow-[inset_0_0_70px_#000,0_8px_28px_#000c]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(98,70,30,.20),transparent_34%),linear-gradient(180deg,rgba(18,14,9,.15),rgba(2,2,2,.75))]" />
            {hero ? <img src={hero} alt={c.name} className="absolute inset-0 h-full w-full object-contain object-bottom [filter:drop-shadow(0_14px_24px_rgba(0,0,0,.85))]" /> : <div className="grid h-full w-full place-items-center font-serif text-6xl text-[#806533]">{c.name.slice(0, 1)}</div>}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#050403] via-[#050403aa] to-transparent" />
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2"><div className="border border-[#5d4727] bg-black/70 px-3 py-1.5 text-center"><div className="text-[7px] uppercase tracking-[0.18em] text-[#8f7b52]">Proficiency</div><div className="font-serif text-[16px] text-[#efd079]">{sign(prof)}</div></div><div className="border border-[#5d4727] bg-black/70 px-3 py-1.5 text-center"><div className="text-[7px] uppercase tracking-[0.18em] text-[#8f7b52]">Spell DC</div><div className="font-serif text-[16px] text-[#efd079]">{sc.save_dc ?? "—"}</div></div><div className="border border-[#5d4727] bg-black/70 px-3 py-1.5 text-center"><div className="text-[7px] uppercase tracking-[0.18em] text-[#8f7b52]">Spell Attack</div><div className="font-serif text-[16px] text-[#efd079]">{sc.attack_bonus == null ? "—" : sign(sc.attack_bonus)}</div></div></div>
          </div>
          <div className="min-h-0 space-y-3 overflow-y-auto pl-1">
            <FramePanel title="Spellcasting">
              {slotRows.length > 0 && <div className="mb-3 space-y-1.5">{slotRows.map(([lvl, s]) => { const max = s?.max ?? 0; const used = s?.used ?? 0; const remaining = Math.max(0, max - used); return <div key={lvl} className="flex items-center justify-between text-[9px] text-[#aa9b7e]"><span className="font-serif uppercase tracking-[0.08em]">Level {lvl}</span><span className="flex gap-1">{Array.from({ length: max }).map((_, i) => <span key={i} className={"h-3 w-3 rotate-45 border " + (i < remaining ? "border-[#8c5fc0] bg-[#653b92] shadow-[0_0_7px_#7f4fb3]" : "border-[#443452] bg-[#100d14]")} />)}</span></div> })}</div>}
              {cantrips.length > 0 && <div className="mb-3"><div className="mb-1.5 text-[8px] uppercase tracking-[0.2em] text-[#8d7950]">Cantrips</div><div className="space-y-1.5">{cantrips.map((n) => <SpellTile key={n} name={n} />)}</div></div>}
              {prepared.length > 0 && <div><div className="mb-1.5 text-[8px] uppercase tracking-[0.2em] text-[#8d7950]">Prepared</div><div className="space-y-1.5">{prepared.map((n) => <SpellTile key={n} name={n} />)}</div></div>}
            </FramePanel>
            {c.sheet_features && <FramePanel title="Features"><div className="text-[9px] leading-relaxed text-[#a99c83]">Class and background features are drawn from the live character sheet.</div></FramePanel>}
          </div>
        </main>
        <footer className="relative z-20 flex shrink-0 items-end justify-center gap-3 border-t border-[#5d4522] bg-[linear-gradient(180deg,#0d0905,#050302)] px-4 py-2 shadow-[0_-10px_26px_#000a]">
          <Globe value={hpCur} max={hpMax} label="Hit Points" variant="life" size={104} />
          <div className="mb-3"><div className="mb-1 text-center font-serif text-[8px] uppercase tracking-[0.24em] text-[#8e7950]">Combat Abilities</div><div className="relative flex gap-1 border-y border-[#60471f] bg-[#0d0905] px-3 py-2 shadow-[inset_0_1px_0_#c99a4926]">{rack.length > 0 ? rack.map((name, i) => <div key={name} className="h-[66px] w-[118px]"><SpellTile name={name} hotkey={i + 1} /></div>) : <div className="px-8 py-5 font-serif text-[10px] italic text-[#675c47]">No prepared abilities</div>}</div></div>
          <Globe value={Math.max(0, slotsMax - slotsUsed)} max={slotsMax} label="Spell Slots" variant="mana" size={104} />
          {onEndTurn && <button onClick={onEndTurn} className="mb-5 ml-2 border-2 border-[#7c5424] bg-[linear-gradient(180deg,#3a1c0f,#170a06_60%,#090403)] px-6 py-3 font-serif text-[11px] uppercase tracking-[0.25em] text-[#f0ce79] shadow-[0_4px_0_#050201,0_7px_18px_#000a,inset_0_1px_0_#f5cf7b33] hover:border-[#c38a38] hover:text-[#fff1c2]" style={{ clipPath: "polygon(6% 0,94% 0,100% 24%,100% 76%,94% 100%,6% 100%,0 76%,0 24%)" }}>End Turn</button>}
        </footer>
      </div>
    </div>
  )
}
