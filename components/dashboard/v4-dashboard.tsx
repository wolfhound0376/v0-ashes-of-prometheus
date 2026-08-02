"use client"

import { useState } from "react"
import { Compass, Map, Mic, Plus, X } from "lucide-react"
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
  const [stageMode, setStageMode] = useState<"scene" | "tactical">("scene")
  const [statDetail, setStatDetail] = useState<"ac" | "initiative" | "proficiency" | "speed" | null>(null)
  const dialogue = props.dialogue.length ? props.dialogue : previewDialogue
  const livePlayers = props.characters.filter((character) => character.is_player)
  const party = livePlayers.length ? livePlayers : previewCharacters
  const selected = props.selectedCharacter ?? livePlayers[0]
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
        <div className="relative overflow-hidden rounded border border-[#6b5123] bg-[radial-gradient(circle_at_50%_30%,#302314,#050403_70%)]">{npcPortrait ? <img src={npcPortrait} alt={npcName} className="h-full w-full object-contain object-top" /> : <div className="flex h-full flex-col items-center justify-end"><div className="h-28 w-20 rounded-t-[45%] bg-gradient-to-b from-[#9b7846] via-[#45341e] to-[#171008] shadow-[0_0_30px_#b3874033]" /><span className="absolute bottom-2 rounded bg-black/70 px-2 py-1 text-[8px] uppercase tracking-wider text-[#cdb276]">Portrait loads from NPC canon</span></div>}<div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#c49b4e]/20" /></div>
        <div className="space-y-2 text-[10px]"><div className="rounded border border-[#695326] p-2 text-[#d9c492]">Speaking… ▮▮▯▯</div><div className="rounded border border-[#4b3a19] p-2"><span className="block text-[#847557]">Disposition</span>Wary</div><div className="rounded border border-[#4b3a19] p-2"><span className="block text-[#847557]">Attitude</span>Guarded</div><button className="w-full rounded border border-[#695326] py-2 text-[#cdb276]">View NPC Sheet</button></div>
      </div>
      <div className="relative mx-3 min-h-[220px] flex-1 overflow-hidden rounded border border-[#4b3a19] bg-black">
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
      <div className="flex items-center gap-2 px-3 py-2"><button className="h-8 w-8 rounded border border-[#4b3a19] text-[#b69b63]"><Plus className="m-auto h-3 w-3" /></button><input value={props.dialogueInput} onChange={(event) => props.setDialogueInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && props.onDialogueSubmit()} placeholder="Type your response or action…" className="h-8 min-w-0 flex-1 rounded border border-[#4b3a19] bg-[#0b0906] px-3 text-[11px] outline-none focus:border-[#a88745]" /><button disabled className="h-8 w-8 rounded border border-[#4b3a19] text-[#62583f]" title="Voice input coming soon"><Mic className="m-auto h-3 w-3" /></button><button onClick={() => setStatDetail("initiative")} className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded border border-[#a88745] bg-[#120c07] pr-3 text-[10px] text-[#d9c492] shadow-[inset_0_0_10px_#000]" title="Roll for initiative and view initiative details"><span className="h-9 w-11 shrink-0 bg-[url('/images/ui/character-stat-shields.png')] bg-[length:400%_auto] bg-no-repeat" style={{ backgroundPosition: "66.666% 40%", clipPath: "polygon(50% 0, 94% 14%, 91% 72%, 78% 90%, 50% 100%, 22% 90%, 9% 72%, 6% 14%)" }} /><span><b className="block font-serif text-[#ead39e]">Roll Initiative</b><small className="block text-[7px] text-[#9f875d]">{signed(selected?.initiative ?? 0)} modifier</small></span></button></div>
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
            <StatShield kind="ac" label="Armor Class" value={String(selected?.ac ?? 10)} onClick={() => setStatDetail("ac")} />
            <StatShield kind="proficiency" label="Proficiency" value={`+${selected?.proficiency_bonus ?? 2}`} onClick={() => setStatDetail("proficiency")} />
            <StatShield kind="speed" label="Speed" value={selected?.speed || "30 ft"} onClick={() => setStatDetail("speed")} />
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1">{abilities.map((ability) => <AbilityScoreCard key={ability.key} ability={ability} />)}</div>
          <div className="mt-2 grid grid-cols-2 gap-3"><div><h3 className="font-serif text-[9px] font-bold uppercase tracking-wider text-[#cdb276]">Saving Throws</h3>{[["WIS",4],["CHA",3],["CON",2],["STR",1]].map(([name,value]) => <div key={name} className="flex justify-between text-[#b6a685]"><span>{name}</span><b className="text-white">+{value}</b></div>)}<h3 className="mt-2 font-serif text-[9px] font-bold uppercase tracking-wider text-[#cdb276]">Senses</h3><div className="flex justify-between text-[#b6a685]"><span>Passive Perception</span><b className="text-white">{selected?.passive_perception ?? 12}</b></div><div className="flex justify-between text-[#b6a685]"><span>Passive Insight</span><b className="text-white">14</b></div></div><div><h3 className="font-serif text-[9px] font-bold uppercase tracking-wider text-[#cdb276]">Skills</h3>{[["Insight",4],["Medicine",4],["Religion",1],["History",1]].map(([name,value], index) => <div key={name} className={cn("flex justify-between px-1 text-[#b6a685]", index < 2 && "border border-[#725c2f] bg-[#251c0d]")}><span>{name}</span><b className="text-white">+{value}</b></div>)}<p className="mt-1 text-[8px] text-[#8f8061]">□ Cleric class skill</p></div></div>
          <button className="mt-2 w-full rounded border border-[#a88745] py-2 font-serif text-[10px] text-[#d9c492]">⌁ View Full Character Sheet</button>
        </div>
      </Frame>
      <button onClick={() => setInventoryOpen((open) => !open)} className="flex h-8 items-center rounded-lg border border-[#4b3a19] bg-[#100e09] px-3 font-serif text-[10px] font-bold uppercase tracking-[.14em] text-[#cdb276]">Basic Inventory <span className="ml-auto font-sans text-[9px] normal-case tracking-normal text-[#8f8061]">{props.inventory.reduce((sum, item) => sum + Number(item.weight ?? 0) * item.quantity, 0).toFixed(1)} / {selected?.weight_max ?? 105} lb　▶</span></button>
      {inventoryOpen && <div className="rounded border border-[#4b3a19] bg-[#100e09] p-2 text-[9px]">{props.inventory.length ? props.inventory.map((item) => <div key={item.id} className="flex border-b border-[#2c2417] py-1"><span>{item.name} ×{item.quantity}</span><span className="ml-auto text-[#8f8061]">{item.weight} lb</span></div>) : <p className="text-[#8f8061]">No carried items.</p>}</div>}
      <button onClick={() => setEquipmentOpen((open) => !open)} className="flex h-8 items-center rounded-lg border border-[#4b3a19] bg-[#100e09] px-3 font-serif text-[10px] font-bold uppercase tracking-[.14em] text-[#cdb276]">Equipped Items <span className="ml-auto font-sans text-[9px] normal-case tracking-normal text-[#8f8061]">{props.equipment.length} equipped　▶</span></button>
      {equipmentOpen && <div className="rounded border border-[#4b3a19] bg-[#100e09] p-2 text-[9px]">{props.equipment.length ? props.equipment.map((item) => <div key={item.id}>{item.slot}: {item.name}</div>) : <p className="text-[#8f8061]">Nothing equipped.</p>}</div>}
    </div>
    {statDetail ? <StatDetailModal kind={statDetail} character={selected} onClose={() => setStatDetail(null)} /> : null}
  </main>
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

function AbilityScoreCard({ ability }: { ability: { key: string; score: number; mod: number } }) {
  const order = ["str", "dex", "con", "int", "wis", "cha"]
  const index = Math.max(0, order.indexOf(ability.key.toLowerCase()))
  const x = index === 0 ? "0%" : index === 5 ? "100%" : `${index * 20}%`
  const name = abilityNames[ability.key.toLowerCase()] ?? ability.key
  return <button type="button" className="group relative h-[132px] min-w-0 overflow-hidden rounded-sm border border-[#5e481f] bg-[#090807] shadow-[0_3px_7px_#000] transition-[transform,border-color,box-shadow] duration-200 delay-0 hover:z-20 hover:scale-125 hover:border-[#d8ad5c] hover:shadow-[0_8px_24px_#000,0_0_14px_#b7833844] hover:delay-500 focus-visible:z-20 focus-visible:scale-125 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d7b369]" title={`${name}: ${ability.score} (${ability.mod >= 0 ? "+" : ""}${ability.mod})`}>
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
