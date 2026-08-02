"use client"

import { useState } from "react"
import { Compass, Dices, Map, Mic, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDice } from "@/components/dice/dice-provider"
import { DiceRoller } from "@/components/dashboard/dice-roller"
import type { Character, EquipmentItem, InventoryItem } from "@/lib/types/database"

type DialogueEntry = { id?: string; speaker: string; text: string }
type NpcEncounter = {
  id: string
  name: string
  description: string | null
  portrait_url: string | null
  face_url?: string | null
  idle_url?: string | null
  is_active: boolean
  hp_current?: number | null
  hp_max?: number | null
  conditions?: string[] | null
  challenge_rating?: number | null
}

interface V4DashboardProps {
  environment: {
    name: string
    region: string
    timeOfDay: string
    imageUrl: string
    description?: string | null
  }
  dialogue: DialogueEntry[]
  dialogueInput: string
  setDialogueInput: (value: string) => void
  onDialogueSubmit: () => void
  onQuickReply?: (value: string) => void
  characters: Character[]
  selectedCharacter?: Character
  selectedCharacterId: string | null
  onCharacterSelect?: (id: string) => void
  inventory: InventoryItem[]
  equipment: EquipmentItem[]
  onEquipItem?: (itemId: string, slot: EquipmentItem["slot"]) => void | Promise<void>
  onUnequipItem?: (slot: EquipmentItem["slot"]) => void | Promise<void>
  npcEncounters: NpcEncounter[]
  isThinking?: boolean
}

const previewDialogue: DialogueEntry[] = [
  { speaker: "Malachar", text: "The stone is cold against your cheek. That is the first thing. The second is the smell — fungus, sweat, the particular perfume of people wearing the same clothes for days." },
  { speaker: "Sam", text: "I check the others for wounds before anything else." },
  { speaker: "DM", text: "Roll Medicine." },
  { speaker: "Sam", text: "🎲 Medicine — 16 (d20: 12 +4)" },
  { speaker: "Fifi of Copperas Cove", text: "Save the bedside manner. Get these manacles off." },
  { speaker: "Jimjar", text: "I’ll bet you two gold the bald one prays first." },
  { speaker: "Malachar", text: "Somewhere above, a whip cracks. The drow are awake." },
]

const previewCharacters = [
  { id: "preview-kenta", name: "Kenta", class: "Sorcerer", level: 1, hp_current: 7, hp_max: 9, ac: 10, initiative: 1, avatar_image_url: null },
  { id: "preview-fifi", name: "Fifi", class: "Rogue", level: 1, hp_current: 9, hp_max: 10, ac: 10, initiative: 0, avatar_image_url: null },
  { id: "preview-sam", name: "Sam", class: "Cleric", level: 1, hp_current: 10, hp_max: 10, ac: 10, initiative: 0, avatar_image_url: null },
  { id: "preview-scott", name: "Scott", class: "Bard", level: 1, hp_current: 9, hp_max: 9, ac: 10, initiative: 0, avatar_image_url: null },
]

const previewSelectedCharacter: Character = {
  id: "preview-sam", name: "Sam", level: 1, class: "Cleric", xp: 0, xp_to_next: 300,
  avatar_image_url: null, portrait_image_url: null, hp_current: 10, hp_max: 10, ac: 10,
  initiative: 0, proficiency_bonus: 2, passive_perception: 12,
  str_score: 13, str_modifier: 1, dex_score: 10, dex_modifier: 0, con_score: 14, con_modifier: 2,
  int_score: 8, int_modifier: -1, wis_score: 15, wis_modifier: 2, cha_score: 12, cha_modifier: 1,
  weight_current: 0, weight_max: 105, is_player: true, character_type: "player", speed: "30 ft.",
  senses: null, skills: null, size: null, cr: null, languages: null, damage_resistances: null,
  damage_immunities: null, condition_immunities: null, conditions: ["Poisoned", "Exhaustion 1"],
  created_at: "", updated_at: "",
}

const abilityKeys = ["str", "dex", "con", "int", "wis", "cha"] as const
const conditionColor: Record<string, string> = {
  poisoned: "border-emerald-700 bg-emerald-950/70 text-emerald-400",
  exhaustion: "border-amber-700 bg-amber-950/60 text-amber-400",
  frightened: "border-purple-700 bg-purple-950/60 text-purple-300",
  prone: "border-red-800 bg-red-950/60 text-red-300",
}

function Frame({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={cn("aop-ornate-panel min-h-0 overflow-hidden", className)}>
    <header className="aop-ornate-title flex h-8 items-center px-3 font-serif text-[10px] font-semibold uppercase tracking-[.2em] text-[#e0b765]">
      <span>{title}</span><span className="ml-auto text-[#675638]">— ×</span>
    </header>{children}
  </section>
}

export function V4Dashboard(props: V4DashboardProps) {
  const [logFilter, setLogFilter] = useState("All")
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  const [characterSheetOpen, setCharacterSheetOpen] = useState(false)
  const [diceOpen, setDiceOpen] = useState(false)
  const [stageMode, setStageMode] = useState<"scene" | "tactical">("scene")
  const [statDetail, setStatDetail] = useState<"ac" | "initiative" | "proficiency" | "speed" | null>(null)
  const dialogue = props.dialogue.length ? props.dialogue : previewDialogue
  const livePlayers = props.characters.filter((character) => character.is_player)
  const party = livePlayers.length ? livePlayers : previewCharacters
  const selected = props.selectedCharacter ?? livePlayers[0] ?? previewSelectedCharacter
  const equipmentBonus = props.equipment.reduce<Record<string, number>>((totals, item) => {
    Object.entries(item.stats_bonus ?? {}).forEach(([key, value]) => { totals[key.toLowerCase()] = (totals[key.toLowerCase()] ?? 0) + Number(value || 0) })
    return totals
  }, {})
  const displayedAc = (selected?.ac ?? 10) + (equipmentBonus.ac ?? 0)
  const displayedInitiative = (selected?.initiative ?? 0) + (equipmentBonus.initiative ?? 0)
  const activeNpc = props.npcEncounters.find((npc) => npc.is_active) ?? props.npcEncounters[0]
  const npcName = activeNpc?.name ?? "Eldeth Feldrun"
  const npcPortrait = activeNpc?.idle_url || activeNpc?.face_url || activeNpc?.portrait_url
  const characterPortrait = selected?.portrait_image_url || selected?.avatar_image_url
  const inCombat = props.npcEncounters.some((npc) => npc.is_active && (npc.challenge_rating ?? 0) > 0)
  const conditions = ((selected as Character & { conditions?: string[] | null })?.conditions ?? ["Poisoned", "Exhaustion 1"])
  const quickReplies = [
    "Who else is being held here?",
    "(Faith) Offer a quiet prayer over the wounded",
    "(Persuasion) Help us and we all get out.",
    "(Medicine) Tend to Kenta’s arm",
  ]
  const abilities = abilityKeys.map((key) => ({
    key,
    score: (selected?.[`${key}_score` as keyof Character] as number ?? ({ str: 13, dex: 10, con: 14, int: 8, wis: 15, cha: 12 }[key])) + (equipmentBonus[key] ?? equipmentBonus[`${key}_score`] ?? 0),
    mod: (selected?.[`${key}_modifier` as keyof Character] as number ?? ({ str: 1, dex: 0, con: 2, int: -1, wis: 2, cha: 1 }[key])) + (equipmentBonus[`${key}_modifier`] ?? 0),
  }))

  return <main className="aop-lich-dashboard grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-2 lg:grid-cols-[252px_minmax(490px,1fr)_310px] xl:grid-cols-[252px_minmax(620px,1fr)_310px]">
    <div className="flex min-h-0 flex-col gap-2">
      <Frame title="Current Environment" className="shrink-0">
        <div className="p-2.5">
          <h2 className="font-serif text-sm font-bold text-[#e8dcc4]">{props.environment.name}</h2>
          <p className="text-[10px] text-[#9b8b6b]">{props.environment.region} · {props.environment.timeOfDay}</p>
          <div className="relative mt-2 h-[202px] overflow-hidden rounded border border-[#4b3a19]">
            <img src={props.environment.imageUrl} alt={props.environment.name} className="h-full w-full object-cover" />
            <div className="absolute left-2 top-2 rounded-sm border border-[#4b3a19] bg-[#0a0907]/90 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#cdb276]">{props.environment.name}</div>
          </div>
          <div className="mt-2 flex gap-1.5 text-[9px] text-[#aa9874]"><span className="rounded-full border border-[#4b3a19] px-2">◐ Dim Light</span><span className="rounded-full border border-[#4b3a19] px-2">◒ Stone Floor</span><span className="rounded-full border border-[#4b3a19] px-2">💧 Damp</span></div>
        </div>
      </Frame>
      <Frame title="Interactive Log" className="flex min-h-[330px] flex-1 flex-col">
        <div className="flex gap-1 px-2 pt-2">{["All", "Narration", "Dialogue", "Combat", "System"].map((filter) => <button key={filter} onClick={() => setLogFilter(filter)} className={cn("rounded px-2 py-0.5 text-[9px]", logFilter === filter ? "bg-[#a8272e] text-white" : "border border-[#4b3a19] text-[#8f8061]")}>{filter}</button>)}</div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5 text-[11px] leading-[1.45]">{dialogue.map((entry, index) => <p key={entry.id ?? index}><strong className={cn(entry.speaker === "Malachar" ? "text-[#a879e1]" : entry.speaker === "Sam" ? "text-[#52a5d4]" : entry.speaker === "Jimjar" ? "text-[#61b978]" : entry.speaker === "Fifi of Copperas Cove" ? "text-[#d2b04f]" : "text-[#b7a683]")}>{entry.speaker}:</strong> <span className="text-[#ddd2bc]">{entry.text}</span></p>)}{props.isThinking && <p className="animate-pulse text-[#a879e1]">Malachar is considering your suffering…</p>}</div>
      </Frame>
    </div>

    <Frame title="NPC / Dungeon Master Window" className="flex min-h-[690px] flex-col">
      <div className="grid h-[205px] shrink-0 grid-cols-[160px_minmax(220px,1fr)_140px] gap-3 p-3 pb-4">
        <div><h2 className="font-serif text-sm font-bold text-white">{npcName}</h2><p className="text-[9px] text-[#a4916d]">Shield Dwarf Scout · Lawful Good</p><blockquote className="mt-3 border-l-2 border-red-700 pl-2 text-[11px] italic leading-[1.45] text-[#e4d8bf]">“Don’t gamble with him. He cheats. …Eldeth. Gauntlgrym’s where I belong. Not here.”</blockquote></div>
        <div className="relative overflow-hidden rounded border border-[#6b5123] bg-[radial-gradient(circle_at_50%_30%,#302314,#050403_70%)]">{npcPortrait ? <img src={npcPortrait} alt={npcName} className="h-full w-full object-contain object-top" /> : <div className="flex h-full flex-col items-center justify-end"><div className="h-28 w-20 rounded-t-[45%] bg-gradient-to-b from-[#9b7846] via-[#45341e] to-[#171008] shadow-[0_0_30px_#b3874033]" /><span className="absolute bottom-2 rounded bg-black/70 px-2 py-1 text-[8px] uppercase tracking-wider text-[#cdb276]">Portrait loads from NPC canon</span></div>}<div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#c49b4e]/20" /></div>
        <div className="space-y-2 text-[10px]"><div className="rounded border border-[#695326] p-2 text-[#d9c492]">Speaking… ▮▮▯▯</div><div className="rounded border border-[#4b3a19] p-2"><span className="block text-[#847557]">Disposition</span>Wary</div><div className="rounded border border-[#4b3a19] p-2"><span className="block text-[#847557]">Attitude</span>Guarded</div><button className="w-full rounded border border-[#695326] py-2 text-[#cdb276]">View NPC Sheet</button></div>
      </div>
      <div className="relative mx-3 mt-3 min-h-[205px] flex-1 overflow-hidden rounded border border-[#4b3a19] bg-black">
        <img src={props.environment.imageUrl} alt="Current scene" className={cn("h-full w-full object-cover transition-all duration-500", stageMode === "tactical" && "brightness-[.38] saturate-[.65]")} />
        <div className="absolute left-3 top-3 flex gap-1 rounded border border-[#6b5123] bg-[#080705]/85 p-1 text-[8px] uppercase tracking-wider">
          <button onClick={() => setStageMode("scene")} className={cn("flex items-center gap-1 rounded px-2 py-1", stageMode === "scene" ? "bg-[#8b6427] text-white" : "text-[#b7a47d]")}><Compass className="h-3 w-3" />Character View</button>
          <button onClick={() => setStageMode("tactical")} className={cn("flex items-center gap-1 rounded px-2 py-1", stageMode === "tactical" ? "bg-[#8b6427] text-white" : "text-[#b7a47d]")}><Map className="h-3 w-3" />Tactical Map{inCombat ? " · Live" : ""}</button>
        </div>
        {stageMode === "scene" ? <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/15" />
          {characterPortrait ? <img src={characterPortrait} alt={selected?.name ?? "Active character"} className="absolute bottom-0 left-1/2 h-[88%] max-w-[48%] -translate-x-1/2 object-contain object-bottom drop-shadow-[0_12px_18px_#000]" /> : <div className="absolute bottom-0 left-1/2 h-[78%] w-[23%] -translate-x-1/2 rounded-t-[48%] bg-gradient-to-b from-[#6d5531] via-[#2c2115] to-[#080604] opacity-90 shadow-[0_0_35px_#c5993d22]" />}
          <div className="absolute bottom-3 left-3 rounded border border-[#6b5123] bg-[#080705]/85 px-2 py-1"><span className="block text-[8px] uppercase tracking-wider text-[#8f8061]">Point of view</span><b className="font-serif text-[10px] text-[#e1d0a8]">{selected?.name ?? "Active character"} · {props.environment.name}</b></div>
        </> : <TacticalOverlay characters={party} enemies={props.npcEncounters.filter((npc) => npc.is_active)} />}
      </div>
      <div className="flex flex-wrap gap-1.5 px-3 pt-2">{quickReplies.map((reply) => <button key={reply} onClick={() => props.onQuickReply?.(reply)} className="rounded-full border border-[#695326] bg-[#171109] px-3 py-1 text-[9px] text-[#cdb276] hover:bg-[#251a0d]">{reply}</button>)}</div>
      <div className="flex items-center gap-2 px-3 py-2"><button className="aop-square-action h-8 w-8"><Plus className="m-auto h-3 w-3" /></button><input value={props.dialogueInput} onChange={(event) => props.setDialogueInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && props.onDialogueSubmit()} placeholder="Type your response or action…" className="aop-lich-input h-8 min-w-0 flex-1 px-3 text-[11px]" /><button disabled className="aop-square-action h-8 w-8 opacity-50" title="Voice input coming soon"><Mic className="m-auto h-3 w-3" /></button><button onClick={() => setDiceOpen(true)} className="aop-square-action h-10 w-10" title="Open Dice Roller"><Dices className="m-auto h-4 w-4" /></button><button onClick={() => setStatDetail("initiative")} className="aop-initiative-button flex h-10 items-center gap-1.5 whitespace-nowrap pr-3 text-[10px]" title="Roll for initiative and view initiative details"><span className="h-9 w-11 shrink-0 bg-[url('/images/ui/character-stat-shields.png')] bg-[length:400%_auto] bg-no-repeat" style={{ backgroundPosition: "66.666% 40%", clipPath: "polygon(50% 0, 94% 14%, 91% 72%, 78% 90%, 50% 100%, 22% 90%, 9% 72%, 6% 14%)" }} /><span><b className="block font-serif text-[#ead39e]">Roll Initiative</b><small className="block text-[7px] text-[#9f875d]">{signed(displayedInitiative)} modifier</small></span></button></div>
      <div className="border-t border-[#4b3a19] px-3 py-2"><h3 className="mb-3 text-center font-serif text-[10px] uppercase tracking-[.2em] text-[#cdb276]">Party Status</h3><div className="flex items-stretch gap-2">{party.slice(0,4).map((member) => { const active = member.id === props.selectedCharacterId || (!props.selectedCharacterId && member.name === "Sam"); const portrait = "avatar_image_url" in member ? member.avatar_image_url : null; return <button key={member.id} onClick={() => livePlayers.length && props.onCharacterSelect?.(member.id)} className={cn("min-w-0 flex-1 rounded border bg-[#12100b] p-2 text-center", active ? "border-[#bd9143] shadow-[0_0_10px_#8b642744]" : "border-[#4b3a19]")}><div className="mx-auto h-11 w-11 overflow-hidden rounded-full border-2 border-[#8d6d35] bg-[#20180d]">{portrait ? <img src={portrait} alt={member.name} className="h-full w-full object-cover object-[center_14%]" /> : <div className="flex h-full items-center justify-center font-serif text-lg text-[#cdb276]">{member.name[0]}</div>}</div><div className="mt-1 truncate font-serif text-[10px] text-[#ddd2bc]">{member.name}</div><div className="text-[8px] text-[#8f8061]">{member.class} {member.level}</div><div className="mt-1 text-[8px] text-[#b9a986]">♥ {member.hp_current}/{member.hp_max}　⌾ {member.ac}　↟ +{member.initiative}</div><div className="mt-1 h-1 bg-[#281315]"><div className="h-full bg-[#b62d38]" style={{ width: `${Math.max(0, member.hp_current / member.hp_max * 100)}%` }} /></div></button>})}</div><button className="mx-auto mt-2 block rounded border border-[#695326] px-3 py-1 text-[9px] text-[#cdb276]">View All Characters</button></div>
    </Frame>

    <div className="flex min-h-0 flex-col gap-2">
      <Frame title="Character Stats" className="shrink-0">
        <div className="p-2.5 text-[10px]">
          <div className="flex items-center gap-2"><div className="h-12 w-12 overflow-hidden rounded border border-[#a88745] bg-[#241b0e]">{selected?.avatar_image_url ? <img src={selected.avatar_image_url} alt={selected.name} className="h-full w-full object-cover object-[center_14%]" /> : <div className="flex h-full items-center justify-center text-xl text-[#cdb276]">{selected?.name?.[0] ?? "S"}</div>}</div><div className="min-w-0"><h2 className="font-serif text-sm font-bold text-white">{selected?.name ?? "Sam"}</h2><p className="truncate text-[9px] text-[#a4916d]">Human {selected?.class ?? "Cleric"} · Acolyte</p></div><span className="ml-auto rounded border border-[#695326] px-2 py-1 text-[#cdb276]">Level {selected?.level ?? 1}</span></div>
          <div className="mt-2 flex justify-between text-[8px] text-[#8f8061]"><span>Level {selected?.level ?? 1} progress</span><span>{selected?.xp ?? 0} / {selected?.xp_to_next ?? 300} XP</span></div><div className="mt-1 h-1 bg-[#251a12]"><div className="h-full w-[2%] bg-[#b62d38]" /></div>
          <div className="mt-2 flex items-center gap-2"><b className="text-[#ddd2bc]">HP {selected?.hp_current ?? 10} / {selected?.hp_max ?? 10}</b><div className="h-2 flex-1 bg-[#281315]"><div className="h-full bg-[#bd3039]" style={{ width: `${((selected?.hp_current ?? 10)/(selected?.hp_max ?? 10))*100}%` }} /></div><button className="rounded border border-[#4b3a19] px-1.5 text-[8px]">HEAL</button><button className="rounded border border-[#4b3a19] px-1.5 text-[8px]">DMG</button></div>
          <div className="mt-1 flex gap-1">{conditions.map((condition) => { const key = condition.toLowerCase().split(" ")[0]; return <span key={condition} className={cn("rounded-full border px-2 py-0.5 text-[8px]", conditionColor[key] ?? "border-[#4b3a19] text-[#a4916d]")}>{condition}</span>})}<span className="rounded-full border border-dashed border-[#4b3a19] px-2 text-[#8f8061]">+</span></div>
          <div className="mt-2 flex items-center rounded border border-[#4b3a19] px-2 py-1 text-[8px]"><span className="text-purple-400">SPELL SLOTS · LV 1　◉ ◉</span><span className="ml-auto text-[#8f8061]">2 / 2</span></div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <StatShield kind="ac" label="Armor Class" value={String(displayedAc)} onClick={() => setStatDetail("ac")} />
            <StatShield kind="proficiency" label="Proficiency" value={`+${selected?.proficiency_bonus ?? 2}`} onClick={() => setStatDetail("proficiency")} />
            <StatShield kind="speed" label="Speed" value={selected?.speed || "30 ft"} onClick={() => setStatDetail("speed")} />
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1">{abilities.map((ability) => <AbilityScoreCard key={ability.key} ability={ability} />)}</div>
          <div className="mt-2 grid grid-cols-2 gap-3"><div><h3 className="font-serif text-[9px] font-bold uppercase tracking-wider text-[#cdb276]">Saving Throws</h3>{[["WIS",4],["CHA",3],["CON",2],["STR",1]].map(([name,value]) => <div key={name} className="flex justify-between text-[#b6a685]"><span>{name}</span><b className="text-white">+{value}</b></div>)}<h3 className="mt-2 font-serif text-[9px] font-bold uppercase tracking-wider text-[#cdb276]">Senses</h3><div className="flex justify-between text-[#b6a685]"><span>Passive Perception</span><b className="text-white">{selected?.passive_perception ?? 12}</b></div><div className="flex justify-between text-[#b6a685]"><span>Passive Insight</span><b className="text-white">14</b></div></div><div><h3 className="font-serif text-[9px] font-bold uppercase tracking-wider text-[#cdb276]">Skills</h3>{[["Insight",4],["Medicine",4],["Religion",1],["History",1]].map(([name,value], index) => <div key={name} className={cn("flex justify-between px-1 text-[#b6a685]", index < 2 && "border border-[#725c2f] bg-[#251c0d]")}><span>{name}</span><b className="text-white">+{value}</b></div>)}<p className="mt-1 text-[8px] text-[#8f8061]">□ Cleric class skill</p></div></div>
          <button onClick={() => setCharacterSheetOpen(true)} className="mt-2 w-full rounded border border-[#a88745] py-2 font-serif text-[10px] text-[#d9c492] hover:bg-[#2a1e0e]">⌁ View Full Character Sheet</button>
        </div>
      </Frame>
      <button onClick={() => setInventoryOpen(true)} className="flex h-8 items-center rounded-lg border border-[#4b3a19] bg-[#100e09] px-3 font-serif text-[10px] font-bold uppercase tracking-[.14em] text-[#cdb276]">Basic Inventory <span className="ml-auto font-sans text-[9px] normal-case tracking-normal text-[#8f8061]">{props.inventory.reduce((sum, item) => sum + Number(item.weight ?? 0) * item.quantity, 0).toFixed(1)} / {selected?.weight_max ?? 105} lb　▶</span></button>
      <button onClick={() => setEquipmentOpen(true)} className="flex h-8 items-center rounded-lg border border-[#4b3a19] bg-[#100e09] px-3 font-serif text-[10px] font-bold uppercase tracking-[.14em] text-[#cdb276]">Equipped Items <span className="ml-auto font-sans text-[9px] normal-case tracking-normal text-[#8f8061]">{props.equipment.length} equipped　▶</span></button>
    </div>
    {statDetail ? <StatDetailModal kind={statDetail} character={selected} onClose={() => setStatDetail(null)} /> : null}
    {diceOpen ? <DiceRoller presentation="modal" onClose={() => setDiceOpen(false)} characterName={selected?.name ?? "Player"} /> : null}
    {characterSheetOpen ? <CharacterSheetModal character={selected} abilities={abilities} inventory={props.inventory} equipment={props.equipment} displayedAc={displayedAc} displayedInitiative={displayedInitiative} onClose={() => setCharacterSheetOpen(false)} /> : null}
    {(inventoryOpen || equipmentOpen) ? <EquipmentManager character={selected} inventory={props.inventory} equipment={props.equipment} bonuses={equipmentBonus} onEquip={props.onEquipItem} onUnequip={props.onUnequipItem} onClose={() => { setInventoryOpen(false); setEquipmentOpen(false) }} /> : null}
  </main>
}

const equipmentSlots: Array<{ id: EquipmentItem["slot"]; label: string; position: string }> = [
  { id: "head", label: "Head", position: "left-[4%] top-[5%]" },
  { id: "neck", label: "Neck", position: "right-[4%] top-[5%]" },
  { id: "torso", label: "Torso", position: "right-[4%] top-[30%]" },
  { id: "main_hand", label: "Main Hand", position: "left-[4%] top-[31%]" },
  { id: "off_hand", label: "Off Hand", position: "right-[4%] top-[56%]" },
  { id: "legs", label: "Legs", position: "left-[4%] top-[58%]" },
  { id: "feet", label: "Feet", position: "left-[28%] bottom-[2%]" },
  { id: "ring1", label: "Ring I", position: "right-[28%] bottom-[2%]" },
  { id: "ring2", label: "Ring II", position: "right-[4%] bottom-[2%]" },
]

function ModalShell({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section role="dialog" aria-modal="true" aria-label={title} className={cn("flex max-h-[94vh] w-full flex-col overflow-hidden rounded-xl border border-[#8a672d] bg-[radial-gradient(circle_at_top,#2a1d0c,#090705_62%)] shadow-[0_25px_90px_#000]", wide ? "max-w-6xl" : "max-w-4xl")}>
      <header className="flex h-12 shrink-0 items-center border-b border-[#5a421d] bg-black/35 px-5"><h2 className="font-serif text-base uppercase tracking-[.16em] text-[#ead39e]">{title}</h2><button aria-label={`Close ${title}`} onClick={onClose} className="ml-auto rounded border border-[#58421f] p-1.5 text-[#aa9162] hover:border-[#bd9143] hover:text-white"><X className="h-4 w-4" /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  </div>
}

type SheetTab = "actions" | "spells" | "inventory" | "features" | "background" | "notes"

function CharacterSheetModal({ character, abilities, inventory, equipment, displayedAc, displayedInitiative, onClose }: { character: Character; abilities: Array<{ key: string; score: number; mod: number }>; inventory: InventoryItem[]; equipment: EquipmentItem[]; displayedAc: number; displayedInitiative: number; onClose: () => void }) {
  const [tab, setTab] = useState<SheetTab>("actions")
  const [notes, setNotes] = useState("")
  const { roll, busy } = useDice()
  const portrait = character.portrait_image_url || character.avatar_image_url
  const extra = character as Character & { race?: string; background?: string; subclass?: string; alignment?: string; personality_traits?: string; ideals?: string; bonds?: string; flaws?: string; faith?: string }
  const speed = character.speed || "30 ft."
  const carriedWeight = inventory.reduce((sum, item) => sum + Number(item.weight || 0) * item.quantity, 0)
  const abilityRoll = (ability: { key: string; mod: number }) => void roll({ die: "d20", numDice: 1, modifier: ability.mod, label: `${abilityNames[ability.key]} Check` })
  const initiativeRoll = () => void roll({ die: "d20", numDice: 1, modifier: displayedInitiative, label: "Initiative" })
  return <ModalShell title="Full Character Sheet" onClose={onClose} wide>
    <div className="p-4">
      <header className="flex flex-wrap items-center gap-4 rounded-xl border border-[#765a2a] bg-[linear-gradient(100deg,#25170b,#090705_68%)] p-4 shadow-[inset_0_0_20px_#000]">
        <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-[#ad8341] bg-black/50">{portrait ? <img src={portrait} alt={character.name} className="h-full w-full object-cover object-[center_14%]" /> : <div className="flex h-full items-center justify-center font-serif text-4xl text-[#b78b45]">{character.name[0]}</div>}</div>
        <div><h3 className="font-serif text-3xl text-[#f2dfb7]">{character.name}</h3><p className="text-xs text-[#ac966d]">Level {character.level} {extra.race || "Human"} {character.class}{extra.subclass ? ` · ${extra.subclass}` : ""}</p><p className="mt-1 text-[9px] uppercase tracking-wider text-[#76694f]">{extra.background || "Background not recorded"} · {extra.alignment || "Alignment not recorded"}</p></div>
        <div className="ml-auto min-w-52"><div className="flex justify-between text-[9px] uppercase text-[#887653]"><span>Experience</span><span>{character.xp} / {character.xp_to_next}</span></div><div className="mt-1 h-2 rounded bg-black"><div className="h-full rounded bg-[#aa2a34]" style={{ width: `${Math.min(100, character.xp / Math.max(1, character.xp_to_next) * 100)}%` }} /></div><div className="mt-2 flex gap-2"><button disabled title="Rest management is not connected to the dashboard database yet" className="rounded border border-[#604821] px-2 py-1 text-[9px] text-[#6f624b]">Short Rest</button><button disabled title="Rest management is not connected to the dashboard database yet" className="rounded border border-[#604821] px-2 py-1 text-[9px] text-[#6f624b]">Long Rest</button></div></div>
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-[260px_minmax(390px,1fr)_250px]">
        <section className="rounded border border-[#4f3c1d] bg-black/25 p-3"><h3 className="mb-3 font-serif text-xs uppercase tracking-[.14em] text-[#d7b56f]">Ability Scores</h3><div className="grid grid-cols-2 gap-2">{abilities.map((ability) => <AbilityScoreCard key={ability.key} ability={ability} sheet onClick={() => abilityRoll(ability)} />)}</div><p className="mt-2 text-center text-[8px] text-[#75674d]">Click an ability to roll a check</p></section>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2"><SheetCoreStat label="Armor Class" value={String(displayedAc)} /><button disabled={busy} onClick={initiativeRoll}><SheetCoreStat label="Initiative · Roll" value={signed(displayedInitiative)} /></button><SheetCoreStat label="Speed" value={speed} /></div>
          <div className="grid gap-3 md:grid-cols-2"><SheetList title="Saving Throws" rows={abilities.map((ability) => [abilityNames[ability.key], signed(ability.mod)])} /><SheetList title="Senses" rows={[["Passive Perception", String(character.passive_perception)], ["Senses", character.senses || "Not recorded"], ["Languages", character.languages || "Not recorded"]]} /></div>
          <section className="overflow-hidden rounded border border-[#4f3c1d] bg-black/25"><h3 className="border-b border-[#4f3c1d] px-3 py-2 font-serif text-[11px] uppercase tracking-[.14em] text-[#d7b56f]">Skills & Proficiencies</h3><p className="min-h-24 whitespace-pre-wrap p-3 text-[11px] leading-relaxed text-[#c9b895]">{character.skills || "No skill proficiency records are attached to this character."}</p></section>
        </div>

        <aside className="space-y-3">
          <section className="rounded border border-[#6a4d22] bg-[radial-gradient(circle_at_top,#402411,#110b07_70%)] p-4 text-center"><h4 className="text-[9px] uppercase tracking-wider text-[#a58a5b]">Hit Points</h4><b className="font-serif text-4xl text-[#f1dcae]">{character.hp_current}<span className="text-xl text-[#887653]"> / {character.hp_max}</span></b><div className="mt-2 h-2 bg-black"><div className="h-full bg-[#b72f3c]" style={{ width: `${Math.min(100, character.hp_current / Math.max(1, character.hp_max) * 100)}%` }} /></div></section>
          <div className="grid grid-cols-2 gap-2"><SheetCoreStat label="Proficiency" value={signed(character.proficiency_bonus)} /><SheetCoreStat label="Hit Dice" value="Not recorded" /></div>
          <section className="rounded border border-[#4f3c1d] bg-black/25 p-3"><h4 className="mb-2 font-serif text-[10px] uppercase tracking-wider text-[#d7b56f]">Conditions</h4><div className="flex flex-wrap gap-1">{character.conditions?.length ? character.conditions.map((condition) => <span key={condition} className="rounded-full border border-[#755429] px-2 py-1 text-[9px] text-[#d6c29a]">{condition}</span>) : <span className="text-[10px] text-[#786b52]">No active conditions</span>}</div></section>
          <SheetList title="Defenses" rows={[["Resistances", character.damage_resistances || "None recorded"], ["Immunities", character.damage_immunities || "None recorded"], ["Condition Immunities", character.condition_immunities || "None recorded"]]} />
        </aside>
      </div>

      <section className="mt-4 overflow-hidden rounded border border-[#5c431e] bg-black/25">
        <nav className="flex overflow-x-auto border-b border-[#5c431e] bg-black/30">{([['actions','Actions'],['spells','Spells'],['inventory','Inventory'],['features','Features & Traits'],['background','Background'],['notes','Notes']] as Array<[SheetTab,string]>).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={cn("whitespace-nowrap border-b-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider", tab === id ? "border-[#c59443] bg-[#2b1e0d] text-[#f1d59e]" : "border-transparent text-[#837354] hover:text-[#c9ad77]")}>{label}</button>)}</nav>
        <div className="min-h-52 p-4">{tab === "actions" ? <SheetActions equipment={equipment} /> : tab === "spells" ? <SheetEmpty title="Spellcasting" text="No spell records are attached to this character in the current dashboard data." /> : tab === "inventory" ? <div className="grid gap-3 md:grid-cols-2"><SheetList title={`Inventory · ${carriedWeight.toFixed(1)} / ${character.weight_max} lb`} rows={inventory.length ? inventory.map((item) => [item.name, `×${item.quantity} · ${item.weight} lb`]) : [["Inventory", "Nothing carried"]]} /><SheetList title="Equipped" rows={equipment.length ? equipment.map((item) => [equipmentSlots.find((slot) => slot.id === item.slot)?.label || item.slot, item.name]) : [["Equipment", "Nothing equipped"]]} /></div> : tab === "features" ? <div className="grid gap-3 md:grid-cols-2"><SheetList title="Proficiencies" rows={[["Skills", character.skills || "Not recorded"], ["Languages", character.languages || "Not recorded"]]} /><SheetList title="Traits & Defenses" rows={[["Senses", character.senses || "Not recorded"], ["Resistances", character.damage_resistances || "None recorded"], ["Immunities", character.damage_immunities || "None recorded"]]} /></div> : tab === "background" ? <div className="grid gap-3 md:grid-cols-2"><SheetList title="Identity" rows={[["Race", extra.race || "Not recorded"], ["Background", extra.background || "Not recorded"], ["Alignment", extra.alignment || "Not recorded"], ["Faith", extra.faith || "Not recorded"]]} /><SheetList title="Personality" rows={[["Traits", extra.personality_traits || "Not recorded"], ["Ideals", extra.ideals || "Not recorded"], ["Bonds", extra.bonds || "Not recorded"], ["Flaws", extra.flaws || "Not recorded"]]} /></div> : <div><label className="mb-2 block text-[10px] uppercase tracking-wider text-[#b29461]">Session Notes · local draft</label><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-44 w-full rounded border border-[#5b431f] bg-[#0b0906] p-3 text-sm text-[#d7c7a5] outline-none focus:border-[#c29040]" placeholder="Record temporary session notes here…" /></div>}</div>
      </section>
    </div>
  </ModalShell>
}

function SheetActions({ equipment }: { equipment: EquipmentItem[] }) { const weapons = equipment.filter((item) => item.slot === "main_hand" || item.slot === "off_hand"); return <div><h3 className="mb-3 font-serif text-sm uppercase tracking-wider text-[#d7b56f]">Actions in Combat</h3><div className="grid gap-2 md:grid-cols-2">{weapons.length ? weapons.map((weapon) => <div key={weapon.id} className="rounded border border-[#49371b] bg-[#120e08] p-3"><b className="font-serif text-[#e1c995]">{weapon.name}</b><p className="mt-1 text-[10px] text-[#817154]">{weapon.description || "Equipped weapon · attack details not recorded"}</p></div>) : <SheetEmpty title="Attacks" text="No equipped weapon records are available." />}<div className="rounded border border-[#49371b] bg-[#120e08] p-3"><b className="font-serif text-[#e1c995]">Standard Actions</b><p className="mt-1 text-[10px] leading-relaxed text-[#9d8b68]">Attack · Dash · Disengage · Dodge · Help · Hide · Ready · Search · Use an Object</p></div></div></div> }

function SheetEmpty({ title, text }: { title: string; text: string }) { return <div className="rounded border border-[#49371b] bg-[#120e08] p-4"><h3 className="font-serif text-[#d7b56f]">{title}</h3><p className="mt-2 text-xs text-[#817154]">{text}</p></div> }

function SheetCoreStat({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-[#80602b] bg-[radial-gradient(circle_at_top,#493316,#130d07_70%)] p-3 text-center shadow-[inset_0_0_12px_#000]"><b className="block font-serif text-2xl text-[#f1deb2]">{value}</b><span className="text-[9px] uppercase tracking-[.13em] text-[#b59a66]">{label}</span></div> }

function SheetList({ title, rows }: { title: string; rows: Array<Array<string>> }) { return <section className="overflow-hidden rounded border border-[#4f3c1d] bg-black/25"><h3 className="border-b border-[#4f3c1d] px-3 py-2 font-serif text-[11px] uppercase tracking-[.14em] text-[#d7b56f]">{title}</h3>{rows.map(([label, value], index) => <div key={`${label}-${index}`} className="flex gap-3 border-b border-[#2d2416] px-3 py-2 text-[11px] last:border-0"><span className="text-[#8f8061]">{label}</span><b className="ml-auto text-right text-[#d9c9a8]">{value}</b></div>)}</section> }

function EquipmentManager({ character, inventory, equipment, bonuses, onEquip, onUnequip, onClose }: { character: Character; inventory: InventoryItem[]; equipment: EquipmentItem[]; bonuses: Record<string, number>; onEquip?: V4DashboardProps["onEquipItem"]; onUnequip?: V4DashboardProps["onUnequipItem"]; onClose: () => void }) {
  const [selectedSlot, setSelectedSlot] = useState<EquipmentItem["slot"] | null>(null)
  const [busySlot, setBusySlot] = useState<EquipmentItem["slot"] | null>(null)
  const [message, setMessage] = useState("Drag an eligible item onto a slot, or click Equip.")
  const portrait = character.portrait_image_url || character.avatar_image_url
  const equippedAt = (slot: EquipmentItem["slot"]) => equipment.find((item) => item.slot === slot && item.equipped !== false)
  const equip = async (item: InventoryItem, slot: EquipmentItem["slot"]) => {
    if (!item.equippable_slot || item.equippable_slot !== slot) { setMessage(`${item.name} cannot be equipped in ${equipmentSlots.find((entry) => entry.id === slot)?.label || slot}.`); return }
    if (!onEquip) { setMessage("Equipment changes are unavailable for this character."); return }
    setBusySlot(slot); setMessage(`Equipping ${item.name}…`)
    try { await onEquip(item.id, slot); setMessage(`${item.name} equipped. Live stats refresh from the campaign database.`) } finally { setBusySlot(null) }
  }
  const unequip = async (slot: EquipmentItem["slot"]) => { if (!onUnequip) return; setBusySlot(slot); try { await onUnequip(slot); setMessage(`${equipmentSlots.find((entry) => entry.id === slot)?.label || slot} cleared.`) } finally { setBusySlot(null) } }
  const eligible = selectedSlot ? inventory.filter((item) => item.equippable_slot === selectedSlot) : inventory
  return <ModalShell title={`${character.name} · Inventory & Equipped Items`} onClose={onClose} wide>
    <div className="grid min-h-[650px] gap-4 p-4 lg:grid-cols-[minmax(400px,1.05fr)_minmax(330px,.95fr)]">
      <section className="relative min-h-[610px] overflow-hidden rounded-xl border border-[#5e471f] bg-[radial-gradient(circle_at_50%_32%,#27302e,#0a0907_67%)]">
        <div className="absolute inset-x-[21%] bottom-4 top-8 overflow-hidden border-x border-[#4f3c1d] bg-black/20">{portrait ? <img src={portrait} alt={character.name} className="h-full w-full object-contain object-bottom" /> : <div className="flex h-full items-center justify-center font-serif text-8xl text-[#765a2b]">{character.name[0]}</div>}</div>
        {equipmentSlots.map((slot) => { const item = equippedAt(slot.id); const active = selectedSlot === slot.id; return <button key={slot.id} onClick={() => setSelectedSlot(active ? null : slot.id)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move" }} onDrop={(event) => { event.preventDefault(); const itemId = event.dataTransfer.getData("application/aop-inventory-item"); const dropped = inventory.find((entry) => entry.id === itemId); if (dropped) void equip(dropped, slot.id) }} className={cn("absolute z-10 flex h-[68px] w-[68px] flex-col items-center justify-center overflow-hidden rounded-xl border-2 bg-[#0b0906]/95 p-1 shadow-[0_4px_14px_#000] transition", slot.position, active ? "border-[#e1b75e] ring-2 ring-[#dba64255]" : item ? "border-emerald-700/80" : "border-dashed border-[#75572b] hover:border-[#c99a49]", busySlot === slot.id && "animate-pulse")} title={item ? `${slot.label}: ${item.name}` : slot.label}>{item?.icon_url ? <img src={item.icon_url} alt="" className="h-10 w-10 object-contain" /> : <span className="text-xl text-[#9b7740]">◇</span>}<span className="max-w-full truncate text-[7px] uppercase tracking-wide text-[#c7ae7d]">{item?.name || slot.label}</span></button> })}
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap gap-1">{Object.entries(bonuses).length ? Object.entries(bonuses).map(([key, value]) => <span key={key} className="rounded-full border border-emerald-800 bg-emerald-950/80 px-2 py-1 text-[8px] uppercase text-emerald-300">{key} {signed(value)}</span>) : <span className="rounded border border-[#4d3a1d] bg-black/70 px-2 py-1 text-[8px] text-[#8e7b57]">No recorded equipment stat bonuses</span>}</div>
      </section>
      <section className="flex min-h-0 flex-col rounded-xl border border-[#5e471f] bg-[#0d0b07]">
        <div className="border-b border-[#49371c] p-3"><div className="flex items-center"><div><h3 className="font-serif text-sm uppercase tracking-[.14em] text-[#e0bf7c]">{selectedSlot ? `Eligible for ${equipmentSlots.find((slot) => slot.id === selectedSlot)?.label}` : "Basic Inventory"}</h3><p className="mt-1 text-[9px] text-[#817154]">{message}</p></div>{selectedSlot && <button onClick={() => setSelectedSlot(null)} className="ml-auto rounded border border-[#4f3b1d] px-2 py-1 text-[9px] text-[#aa9162]">Show all</button>}</div></div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">{eligible.length ? eligible.map((item) => { const slot = item.equippable_slot; const equipped = slot ? equippedAt(slot)?.name === item.name : false; return <article key={item.id} draggable={Boolean(slot)} onDragStart={(event) => { event.dataTransfer.setData("application/aop-inventory-item", item.id); event.dataTransfer.effectAllowed = "move" }} className={cn("flex items-center gap-3 rounded border p-2", slot ? "cursor-grab border-[#51401f] bg-[#171109] active:cursor-grabbing" : "border-[#2e281e] bg-[#100e0b] opacity-70")}><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-[#55411f] bg-black/50">{item.icon_url ? <img src={item.icon_url} alt="" className="h-9 w-9 object-contain" /> : <span className="text-[#94713b]">◆</span>}</div><div className="min-w-0 flex-1"><h4 className="font-serif text-xs text-[#e1d0a8]">{item.name}</h4><p className="truncate text-[9px] text-[#817154]">{item.description || `${item.item_type} · ${item.weight} lb`}</p><span className="text-[8px] uppercase text-[#aa8b52]">{slot ? equipmentSlots.find((entry) => entry.id === slot)?.label : "Not equippable"}</span></div>{slot && <button disabled={equipped || busySlot === slot} onClick={() => void equip(item, slot)} className={cn("rounded border px-2 py-1 text-[9px]", equipped ? "border-emerald-700 bg-emerald-900/60 text-emerald-200" : "border-[#8a672d] text-[#d8b873] hover:bg-[#2a1e0d]")}>{equipped ? "Equipped" : "Equip"}</button>}</article> }) : <p className="p-8 text-center text-xs italic text-[#76694f]">No eligible inventory items for this slot.</p>}</div>
        {selectedSlot && equippedAt(selectedSlot) ? <button onClick={() => void unequip(selectedSlot)} className="m-3 rounded border border-red-900/70 bg-red-950/30 py-2 text-[10px] uppercase tracking-wider text-red-300">Unequip {equippedAt(selectedSlot)?.name}</button> : null}
      </section>
    </div>
  </ModalShell>
}

function TacticalOverlay({ characters, enemies }: { characters: Array<{ id: string; name: string }>; enemies: NpcEncounter[] }) {
  return <div className="absolute inset-0 overflow-hidden">
    <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(30deg, transparent 24%, #b8944c55 25%, #b8944c55 26%, transparent 27%, transparent 74%, #b8944c55 75%, #b8944c55 76%, transparent 77%), linear-gradient(150deg, transparent 24%, #b8944c55 25%, #b8944c55 26%, transparent 27%, transparent 74%, #b8944c55 75%, #b8944c55 76%, transparent 77%)", backgroundSize: "56px 96px" }} />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent,#050403aa_80%)]" />
    <div className="absolute left-3 top-14 rounded border border-[#6b5123] bg-black/75 p-2 text-[8px] text-[#b7a47d]"><b className="block uppercase tracking-wider text-[#d8bd83]">Combat Position</b>Grid is spatial guidance only. Canon positions appear when the encounter supplies them.</div>
    {characters.slice(0, 4).map((character, index) => <div key={character.id} className="absolute flex h-8 w-8 items-center justify-center rounded-full border-2 border-sky-500 bg-sky-950 text-[9px] font-bold text-white shadow-[0_0_14px_#38bdf8]" style={{ left: `${28 + index * 12}%`, top: `${62 + (index % 2) * 10}%` }} title={character.name}>{character.name[0]}</div>)}
    {enemies.slice(0, 4).map((enemy, index) => <div key={enemy.id} className="absolute flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-500 bg-red-950 text-[9px] font-bold text-white shadow-[0_0_14px_#ef4444]" style={{ right: `${25 + index * 12}%`, top: `${25 + (index % 2) * 12}%` }} title={enemy.name}>{enemy.name[0]}</div>)}
    <div className="absolute bottom-3 right-3 flex gap-2 rounded border border-[#6b5123] bg-black/75 px-2 py-1 text-[8px]"><span className="text-sky-400">● Party</span><span className="text-red-400">● Hostile</span><span className="text-amber-300">◇ Terrain</span></div>
  </div>
}

type StatKind = "ac" | "initiative" | "proficiency" | "speed"

const abilityNames: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" }

function AbilityScoreCard({ ability, onClick, sheet = false }: { ability: { key: string; score: number; mod: number }; onClick?: () => void; sheet?: boolean }) {
  const order = ["str", "dex", "con", "int", "wis", "cha"]
  const index = Math.max(0, order.indexOf(ability.key.toLowerCase()))
  const x = index === 0 ? "0%" : index === 5 ? "100%" : `${index * 20}%`
  const name = abilityNames[ability.key.toLowerCase()] ?? ability.key
  return <button type="button" onClick={onClick} className={cn("group relative min-w-0 overflow-hidden rounded-sm border border-[#5e481f] bg-[#090807] shadow-[0_3px_7px_#000] transition-[transform,border-color,box-shadow] duration-200 delay-0 hover:z-20 hover:border-[#d8ad5c] hover:shadow-[0_8px_24px_#000,0_0_14px_#b7833844] hover:delay-500 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d7b369]", sheet ? "h-[190px] hover:scale-110 focus-visible:scale-110" : "h-[132px] hover:scale-125 focus-visible:scale-125")} title={`${name}: ${ability.score} (${ability.mod >= 0 ? "+" : ""}${ability.mod})`}>
    <span className="absolute inset-0 block bg-[url('/images/ui/ability-score-icons.png')] bg-[length:600%_auto] bg-no-repeat" style={{ backgroundPosition: `${x} 3%` }} />
    <span className="absolute inset-x-0 top-2 z-10 bg-black/0 px-0.5 py-1 text-center font-serif text-[6px] font-bold uppercase tracking-[.04em] text-[#d3ae6b]/0 transition-[color,background-color,text-shadow] duration-200 delay-0 group-hover:bg-black/80 group-hover:text-[#ffe4a8] group-hover:[text-shadow:0_0_7px_#d79b3a] group-hover:delay-500">{name}</span>
    <span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black via-black/90 to-transparent" />
    <span className="absolute inset-x-0 bottom-[19px] text-center font-serif text-[15px] leading-none text-[#f0d9aa] drop-shadow-[0_1px_2px_#000]">{ability.score}</span>
    <span className="absolute inset-x-0 bottom-[8px] text-center font-serif text-[9px] leading-none text-[#d7ab62]">{ability.mod >= 0 ? "+" : ""}{ability.mod}</span>
    <span className="absolute inset-x-0 bottom-0 truncate px-0.5 text-center text-[5px] font-bold uppercase tracking-[.05em] text-[#bfa36d]">{name}</span>
  </button>
}

function StatShield({ kind, label, value, onClick }: { kind: StatKind; label: string; value: string; onClick: () => void }) {
  const spritePosition: Record<StatKind, string> = {
    ac: "0% 40%",
    speed: "33.333% 40%",
    initiative: "66.666% 40%",
    proficiency: "100% 40%",
  }
  return <button type="button" onClick={onClick} className="group relative flex h-[82px] min-w-0 flex-col items-center justify-end rounded border border-transparent pb-0.5 transition hover:-translate-y-0.5 hover:border-[#8c6b32] hover:bg-[#21180b]/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d7b369]" title={`Open ${label} details`}>
    <span className="absolute inset-x-1 top-0 h-[66px] overflow-hidden drop-shadow-[0_4px_5px_#000]" style={{ clipPath: "polygon(50% 0, 94% 14%, 91% 72%, 78% 90%, 50% 100%, 22% 90%, 9% 72%, 6% 14%)" }}>
      <span className="block h-full w-full scale-[1.12] bg-[url('/images/ui/character-stat-shields.png')] bg-[length:400%_auto] bg-no-repeat" style={{ backgroundPosition: spritePosition[kind] }} />
    </span>
    <b className="absolute bottom-[14px] z-10 rounded-full border border-[#c49b4f] bg-[#080604]/90 px-1.5 py-0.5 font-serif text-[9px] leading-none text-[#f3dfb4] shadow-[0_1px_5px_#000]">{value}</b>
    <span className="relative z-10 max-w-full truncate px-0.5 text-[6px] font-bold uppercase tracking-[.08em] text-[#cdb276]">{label}</span>
  </button>
}

function StatDetailModal({ kind, character, onClose }: { kind: StatKind; character?: Character; onClose: () => void }) {
  const content: Record<StatKind, { title: string; summary: string; rows: Array<[string, string]> }> = {
    ac: { title: "Armor Class", summary: "How difficult this hero is to hit. The visible total must equal the active armor formula and legal bonuses.", rows: [["Current AC", String(character?.ac ?? 10)], ["Dexterity modifier", signed(character?.dex_modifier ?? 0)], ["Shield / equipment", "Read from equipped items"], ["When attacked", "Enemy roll must meet or exceed AC"]] },
    initiative: { title: "Initiative", summary: "Determines turn order when combat begins. Higher totals act first.", rows: [["Current modifier", signed(character?.initiative ?? 0)], ["Base ability", "Dexterity"], ["Roll", `1d20 ${signed(character?.initiative ?? 0)}`], ["Tie breaker", "Higher Dexterity, then DM ruling"]] },
    proficiency: { title: "Proficiency Bonus", summary: "Represents trained competence. It applies only when the character is proficient with the roll.", rows: [["Current bonus", signed(character?.proficiency_bonus ?? 2)], ["Character level", String(character?.level ?? 1)], ["Applies to", "Proficient saves, skills, attacks and spell DC"], ["Expertise", "Doubles the proficiency contribution"]] },
    speed: { title: "Movement Speed", summary: "The distance this hero can normally move during a turn before Dash or terrain modifiers.", rows: [["Walking speed", character?.speed || "30 ft."], ["Normal move", "Up to speed each turn"], ["Dash", "Adds another movement allowance"], ["Difficult terrain", "Costs 2 feet per foot moved"]] },
  }
  const detail = content[kind]
  return <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="w-full max-w-md rounded-xl border border-[#8a6a32] bg-[radial-gradient(circle_at_top,#2b2112,#0c0906_62%)] p-5 shadow-[0_20px_70px_#000]">
      <div className="flex items-start"><div><p className="text-[9px] uppercase tracking-[.2em] text-[#937b4c]">Character mechanic</p><h2 className="font-serif text-xl text-[#ead8af]">{detail.title}</h2></div><button onClick={onClose} className="ml-auto rounded border border-[#4b3a19] p-1 text-[#a4916d]"><X className="h-4 w-4" /></button></div>
      <p className="mt-3 text-sm leading-relaxed text-[#c7b99e]">{detail.summary}</p>
      <div className="mt-4 overflow-hidden rounded border border-[#4b3a19]">{detail.rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-[#2d2416] px-3 py-2 text-xs last:border-0"><span className="text-[#8f8061]">{label}</span><b className="text-right text-[#e1d0a8]">{value}</b></div>)}</div>
    </div>
  </div>
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`
}
