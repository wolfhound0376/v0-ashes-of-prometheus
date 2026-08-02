"use client"

import { useState } from "react"
import { BookOpen, Dices, Mic, Package, Plus, Shield, Users } from "lucide-react"
import { cn } from "@/lib/utils"
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

const abilityKeys = ["str", "dex", "con", "int", "wis", "cha"] as const
const conditionColor: Record<string, string> = {
  poisoned: "border-emerald-700 bg-emerald-950/70 text-emerald-400",
  exhaustion: "border-amber-700 bg-amber-950/60 text-amber-400",
  frightened: "border-purple-700 bg-purple-950/60 text-purple-300",
  prone: "border-red-800 bg-red-950/60 text-red-300",
}

function Frame({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={cn("min-h-0 overflow-hidden rounded-lg border border-[#4b3a19] bg-[#100e09] shadow-[inset_0_0_0_3px_#171208,0_6px_18px_#000]", className)}>
    <header className="flex h-7 items-center border-b border-[#4b3a19] px-3 font-serif text-[10px] font-semibold uppercase tracking-[.2em] text-[#cdb276]">
      <span>{title}</span><span className="ml-auto text-[#675638]">— ×</span>
    </header>{children}
  </section>
}

export function V4Dashboard(props: V4DashboardProps) {
  const [logFilter, setLogFilter] = useState("All")
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  const dialogue = props.dialogue.length ? props.dialogue : previewDialogue
  const livePlayers = props.characters.filter((character) => character.is_player)
  const party = livePlayers.length ? livePlayers : previewCharacters
  const selected = props.selectedCharacter ?? livePlayers[0]
  const activeNpc = props.npcEncounters.find((npc) => npc.is_active) ?? props.npcEncounters[0]
  const npcName = activeNpc?.name ?? "Eldeth Feldrun"
  const npcPortrait = activeNpc?.idle_url || activeNpc?.face_url || activeNpc?.portrait_url
  const conditions = ((selected as Character & { conditions?: string[] | null })?.conditions ?? ["Poisoned", "Exhaustion 1"])
  const quickReplies = [
    "Who else is being held here?",
    "(Faith) Offer a quiet prayer over the wounded",
    "(Persuasion) Help us and we all get out.",
    "(Medicine) Tend to Kenta’s arm",
  ]
  const abilities = abilityKeys.map((key) => ({
    key,
    score: selected?.[`${key}_score` as keyof Character] as number ?? ({ str: 13, dex: 10, con: 14, int: 8, wis: 15, cha: 12 }[key]),
    mod: selected?.[`${key}_modifier` as keyof Character] as number ?? ({ str: 1, dex: 0, con: 2, int: -1, wis: 2, cha: 1 }[key]),
  }))

  return <main className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-2 lg:grid-cols-[252px_minmax(520px,1fr)_282px] xl:grid-cols-[252px_minmax(650px,1fr)_282px]">
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
      <div className="grid h-[180px] shrink-0 grid-cols-[160px_minmax(220px,1fr)_140px] gap-3 p-3">
        <div><h2 className="font-serif text-sm font-bold text-white">{npcName}</h2><p className="text-[9px] text-[#a4916d]">Shield Dwarf Scout · Lawful Good</p><blockquote className="mt-3 border-l-2 border-red-700 pl-2 text-[11px] italic leading-[1.45] text-[#e4d8bf]">“Don’t gamble with him. He cheats. …Eldeth. Gauntlgrym’s where I belong. Not here.”</blockquote></div>
        <div className="overflow-hidden rounded border border-[#4b3a19] bg-black">{npcPortrait ? <img src={npcPortrait} alt={npcName} className="h-full w-full object-contain object-top" /> : <div className="flex h-full items-center justify-center text-6xl text-[#6d5a38]">♟</div>}</div>
        <div className="space-y-2 text-[10px]"><div className="rounded border border-[#695326] p-2 text-[#d9c492]">Speaking… ▮▮▯▯</div><div className="rounded border border-[#4b3a19] p-2"><span className="block text-[#847557]">Disposition</span>Wary</div><div className="rounded border border-[#4b3a19] p-2"><span className="block text-[#847557]">Attitude</span>Guarded</div><button className="w-full rounded border border-[#695326] py-2 text-[#cdb276]">View NPC Sheet</button></div>
      </div>
      <div className="mx-3 min-h-[220px] flex-1 overflow-hidden rounded border border-[#4b3a19]"><img src={props.environment.imageUrl} alt="Current scene" className="h-full w-full object-cover" /></div>
      <div className="flex flex-wrap gap-1.5 px-3 pt-2">{quickReplies.map((reply) => <button key={reply} onClick={() => props.onQuickReply?.(reply)} className="rounded-full border border-[#695326] bg-[#171109] px-3 py-1 text-[9px] text-[#cdb276] hover:bg-[#251a0d]">{reply}</button>)}</div>
      <div className="flex items-center gap-2 px-3 py-2"><button className="h-8 w-8 rounded border border-[#4b3a19] text-[#b69b63]"><Plus className="m-auto h-3 w-3" /></button><input value={props.dialogueInput} onChange={(event) => props.setDialogueInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && props.onDialogueSubmit()} placeholder="Type your response or action…" className="h-8 min-w-0 flex-1 rounded border border-[#4b3a19] bg-[#0b0906] px-3 text-[11px] outline-none focus:border-[#a88745]" /><button disabled className="h-8 w-8 rounded border border-[#4b3a19] text-[#62583f]" title="Voice input coming soon"><Mic className="m-auto h-3 w-3" /></button><button className="h-8 whitespace-nowrap rounded border border-[#a88745] px-3 text-[10px] text-[#d9c492]"><Dices className="mr-1 inline h-3 w-3" />Roll for Initiative</button></div>
      <div className="border-t border-[#4b3a19] px-3 py-2"><h3 className="mb-3 text-center font-serif text-[10px] uppercase tracking-[.2em] text-[#cdb276]">Party Status</h3><div className="flex items-stretch gap-2">{party.slice(0,4).map((member) => { const active = member.id === props.selectedCharacterId || (!props.selectedCharacterId && member.name === "Sam"); const portrait = "avatar_image_url" in member ? member.avatar_image_url : null; return <button key={member.id} onClick={() => livePlayers.length && props.onCharacterSelect?.(member.id)} className={cn("min-w-0 flex-1 rounded border bg-[#12100b] p-2 text-center", active ? "border-[#bd9143] shadow-[0_0_10px_#8b642744]" : "border-[#4b3a19]")}><div className="mx-auto h-11 w-11 overflow-hidden rounded-full border-2 border-[#8d6d35] bg-[#20180d]">{portrait ? <img src={portrait} alt={member.name} className="h-full w-full object-cover object-[center_14%]" /> : <div className="flex h-full items-center justify-center font-serif text-lg text-[#cdb276]">{member.name[0]}</div>}</div><div className="mt-1 truncate font-serif text-[10px] text-[#ddd2bc]">{member.name}</div><div className="text-[8px] text-[#8f8061]">{member.class} {member.level}</div><div className="mt-1 text-[8px] text-[#b9a986]">♥ {member.hp_current}/{member.hp_max}　⌾ {member.ac}　↟ +{member.initiative}</div><div className="mt-1 h-1 bg-[#281315]"><div className="h-full bg-[#b62d38]" style={{ width: `${Math.max(0, member.hp_current / member.hp_max * 100)}%` }} /></div></button>})}<div className="flex w-7 shrink-0 flex-col justify-center gap-2"><button className="rounded border border-[#4b3a19] p-1 text-sky-400"><Users className="h-3 w-3" /></button><button className="rounded border border-[#4b3a19] p-1 text-red-400"><Package className="h-3 w-3" /></button><button className="rounded border border-[#4b3a19] p-1 text-[#cdb276]"><BookOpen className="h-3 w-3" /></button></div></div><button className="mx-auto mt-2 block rounded border border-[#695326] px-3 py-1 text-[9px] text-[#cdb276]">View All Characters</button></div>
    </Frame>

    <div className="flex min-h-0 flex-col gap-2">
      <Frame title="Character Stats" className="shrink-0">
        <div className="p-2.5 text-[10px]">
          <div className="flex items-center gap-2"><div className="h-12 w-12 overflow-hidden rounded border border-[#a88745] bg-[#241b0e]">{selected?.avatar_image_url ? <img src={selected.avatar_image_url} alt={selected.name} className="h-full w-full object-cover object-[center_14%]" /> : <div className="flex h-full items-center justify-center text-xl text-[#cdb276]">{selected?.name?.[0] ?? "S"}</div>}</div><div className="min-w-0"><h2 className="font-serif text-sm font-bold text-white">{selected?.name ?? "Sam"}</h2><p className="truncate text-[9px] text-[#a4916d]">Human {selected?.class ?? "Cleric"} · Acolyte</p></div><span className="ml-auto rounded border border-[#695326] px-2 py-1 text-[#cdb276]">Level {selected?.level ?? 1}</span></div>
          <div className="mt-2 flex justify-between text-[8px] text-[#8f8061]"><span>Level {selected?.level ?? 1} progress</span><span>{selected?.xp ?? 0} / {selected?.xp_to_next ?? 300} XP</span></div><div className="mt-1 h-1 bg-[#251a12]"><div className="h-full w-[2%] bg-[#b62d38]" /></div>
          <div className="mt-2 flex items-center gap-2"><b className="text-[#ddd2bc]">HP {selected?.hp_current ?? 10} / {selected?.hp_max ?? 10}</b><div className="h-2 flex-1 bg-[#281315]"><div className="h-full bg-[#bd3039]" style={{ width: `${((selected?.hp_current ?? 10)/(selected?.hp_max ?? 10))*100}%` }} /></div><button className="rounded border border-[#4b3a19] px-1.5 text-[8px]">HEAL</button><button className="rounded border border-[#4b3a19] px-1.5 text-[8px]">DMG</button></div>
          <div className="mt-1 flex gap-1">{conditions.map((condition) => { const key = condition.toLowerCase().split(" ")[0]; return <span key={condition} className={cn("rounded-full border px-2 py-0.5 text-[8px]", conditionColor[key] ?? "border-[#4b3a19] text-[#a4916d]")}>{condition}</span>})}<span className="rounded-full border border-dashed border-[#4b3a19] px-2 text-[#8f8061]">+</span></div>
          <div className="mt-2 flex items-center rounded border border-[#4b3a19] px-2 py-1 text-[8px]"><span className="text-purple-400">SPELL SLOTS · LV 1　◉ ◉</span><span className="ml-auto text-[#8f8061]">2 / 2</span></div>
          <div className="mt-2 grid grid-cols-4 gap-1"><Stat label="Armor Class" value={String(selected?.ac ?? 10)} /><Stat label="Initiative" value={`${(selected?.initiative ?? 0) >= 0 ? "+" : ""}${selected?.initiative ?? 0}`} /><Stat label="Prof" value={`+${selected?.proficiency_bonus ?? 2}`} /><Stat label="Speed" value="30" /></div>
          <div className="mt-2 grid grid-cols-6 gap-1">{abilities.map((ability) => <div key={ability.key} className="rounded border border-[#4b3a19] p-1 text-center"><span className="text-[7px] uppercase text-[#9b8251]">{ability.key}</span><b className="block text-sm text-[#e2d4b9]">{ability.score}</b><span className="text-[8px] text-[#a4916d]">{ability.mod >= 0 ? "+" : ""}{ability.mod}</span></div>)}</div>
          <div className="mt-2 grid grid-cols-2 gap-3"><div><h3 className="font-serif text-[9px] font-bold uppercase tracking-wider text-[#cdb276]">Saving Throws</h3>{[["WIS",4],["CHA",3],["CON",2],["STR",1]].map(([name,value]) => <div key={name} className="flex justify-between text-[#b6a685]"><span>{name}</span><b className="text-white">+{value}</b></div>)}<h3 className="mt-2 font-serif text-[9px] font-bold uppercase tracking-wider text-[#cdb276]">Senses</h3><div className="flex justify-between text-[#b6a685]"><span>Passive Perception</span><b className="text-white">{selected?.passive_perception ?? 12}</b></div><div className="flex justify-between text-[#b6a685]"><span>Passive Insight</span><b className="text-white">14</b></div></div><div><h3 className="font-serif text-[9px] font-bold uppercase tracking-wider text-[#cdb276]">Skills</h3>{[["Insight",4],["Medicine",4],["Religion",1],["History",1]].map(([name,value], index) => <div key={name} className={cn("flex justify-between px-1 text-[#b6a685]", index < 2 && "border border-[#725c2f] bg-[#251c0d]")}><span>{name}</span><b className="text-white">+{value}</b></div>)}<p className="mt-1 text-[8px] text-[#8f8061]">□ Cleric class skill</p></div></div>
          <button className="mt-2 w-full rounded border border-[#a88745] py-2 font-serif text-[10px] text-[#d9c492]">⌁ View Full Character Sheet</button>
        </div>
      </Frame>
      <button onClick={() => setInventoryOpen((open) => !open)} className="flex h-8 items-center rounded-lg border border-[#4b3a19] bg-[#100e09] px-3 font-serif text-[10px] font-bold uppercase tracking-[.14em] text-[#cdb276]">Basic Inventory <span className="ml-auto font-sans text-[9px] normal-case tracking-normal text-[#8f8061]">{props.inventory.reduce((sum, item) => sum + Number(item.weight ?? 0) * item.quantity, 0).toFixed(1)} / {selected?.weight_max ?? 105} lb　▶</span></button>
      {inventoryOpen && <div className="rounded border border-[#4b3a19] bg-[#100e09] p-2 text-[9px]">{props.inventory.length ? props.inventory.map((item) => <div key={item.id} className="flex border-b border-[#2c2417] py-1"><span>{item.name} ×{item.quantity}</span><span className="ml-auto text-[#8f8061]">{item.weight} lb</span></div>) : <p className="text-[#8f8061]">No carried items.</p>}</div>}
      <button onClick={() => setEquipmentOpen((open) => !open)} className="flex h-8 items-center rounded-lg border border-[#4b3a19] bg-[#100e09] px-3 font-serif text-[10px] font-bold uppercase tracking-[.14em] text-[#cdb276]">Equipped Items <span className="ml-auto font-sans text-[9px] normal-case tracking-normal text-[#8f8061]">{props.equipment.length} equipped　▶</span></button>
      {equipmentOpen && <div className="rounded border border-[#4b3a19] bg-[#100e09] p-2 text-[9px]">{props.equipment.length ? props.equipment.map((item) => <div key={item.id}>{item.slot}: {item.name}</div>) : <p className="text-[#8f8061]">Nothing equipped.</p>}</div>}
    </div>
  </main>
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-[#4b3a19] p-1 text-center"><span className="block text-[7px] uppercase text-[#9b8251]">{label}</span><b className="text-sm text-[#e2d4b9]">{value}</b></div>
}
