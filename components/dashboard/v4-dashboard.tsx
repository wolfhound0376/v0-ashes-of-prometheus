"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { BookOpen, Compass, ImagePlus, Map, Mic, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ItemIcon } from "@/lib/item-icons"
import { dmHeaders, ensureDmKey, clearDmKey, hasDmKey, onDmKeyChange } from "@/lib/dm-key"
// (fantasy-icons no longer used here — equipment slots render Sam's uploaded PNG icons)
import { describeRoll, useDice } from "@/components/dice/dice-provider"
import { CharacterSheetSlideOver } from "./character-sheet-slideover"
import { DiceRoller } from "@/components/dashboard/dice-roller"
import MapPanel from "@/components/map/map-panel"
import CombatBoard3D from "@/components/tactical/combat-board-3d"
import { DmNarration } from "./dm-narration"
import { PartyChat } from "./party-chat"
import { SuggestionChips } from "./suggestion-chips"
import type { Suggestion } from "@/lib/suggestions"
import { CinematicOverlay } from "./cinematic-overlay"
import { createClient } from "@/lib/supabase/client"
import { onCinematicCue } from "@/lib/cinematic-cue"
import { useSpeechInput } from "@/lib/hooks/use-speech-input"
import { classDefaults } from "@/lib/game-data"
import { calculateAC } from "@/lib/armor-class"
// blob URLs carry the extension inside ?pathname=, which a naive regex misses.
import { isVideoUrl } from "@/lib/media-url"
import { characterStageStyle, npcWindowStyle, type StageFramingRow } from "@/lib/stage-framing"
import type { Character, EquipmentItem, InventoryItem } from "@/lib/types/database"

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha"
const ABILITY_KEYS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"]

const spellNames = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((name): name is string => typeof name === "string" && name.trim().length > 0) : []

const DND_SKILLS = [
  "acrobatics", "animal_handling", "arcana", "athletics", "deception", "history",
  "insight", "intimidation", "investigation", "medicine", "nature", "perception",
  "performance", "persuasion", "religion", "sleight_of_hand", "stealth", "survival",
]

function normalizedSkillMap(raw: Record<string, any>): Record<string, string> {
  const result: Record<string, string> = {}
  const mapped = raw.sheet_skill_proficiencies
  if (mapped && typeof mapped === "object" && !Array.isArray(mapped)) {
    for (const [key, value] of Object.entries(mapped)) {
      const normalized = key.toLowerCase().trim().replace(/[- ]+/g, "_")
      if (DND_SKILLS.includes(normalized) && value) result[normalized] = value === "expertise" ? "expertise" : "proficient"
    }
  }

  const sourceText = [raw.sheet_skill_proficiencies, raw.skill_proficiencies, raw.skills]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => value != null)
    .map((value) => typeof value === "string" ? value : JSON.stringify(value))
    .join(" | ")
    .toLowerCase()

  for (const skill of DND_SKILLS) {
    const label = skill.replace(/_/g, " ")
    const pattern = new RegExp(`(^|[^a-z])${label.replace(/ /g, "[ _-]+")}(?=[^a-z]|$)`)
    if (pattern.test(sourceText) && !result[skill]) result[skill] = "proficient"
  }
  return result
}

/** Map a `characters` row onto the shape the Forge sheet expects. Kept here so
 *  the sheet stays presentational and the DB column names live in one place.
 *  `sheet_skill_proficiencies` is a jsonb OBJECT keyed by snake_case skill name
 *  with "proficient" | "expertise" as the value — not an array. */
function toSheetCharacter(c: Character) {
  const raw = c as unknown as Record<string, any>
  const spellcasting = raw.sheet_spellcasting ?? {}
  // A character is shown the Spells tab only when a real spellcasting block
  // exists. An empty `{}` (non-casters) must hide the tab entirely, so we key
  // off the object having keys rather than off a class-derived guess.
  const hasSpellcasting =
    spellcasting && typeof spellcasting === "object" && Object.keys(spellcasting).length > 0
  const skillMap = normalizedSkillMap(raw)
  const entries = Object.entries(skillMap)
  const abilities = Object.fromEntries(
    ABILITY_KEYS.map((k) => [k, { score: raw[`${k}_score`] ?? 10, modifier: raw[`${k}_modifier`] ?? 0 }]),
  ) as Record<AbilityKey, { score: number; modifier: number }>

  return {
    name: c.name,
    race: raw.sheet_species || raw.race || "Unknown",
    class: c.class,
    subclass: raw.sheet_subclass ?? null,
    level: c.level,
    background: raw.sheet_background || undefined,
    alignment: raw.sheet_alignment || undefined,
    avatarUrl: raw.avatar_image_url || raw.portrait_image_url || null,
    backdropUrl: raw.sheet_appearance?.backdrop_url ?? null,
    experiencePoints: raw.xp ?? 0,
    hp: { current: c.hp_current, max: c.hp_max, temp: raw.sheet_hp_temp ?? 0 },
    ac: c.ac,
    initiative: c.initiative,
    speed: raw.speed,
    proficiencyBonus: raw.proficiency_bonus ?? 2,
    passivePerception: raw.passive_perception ?? 10,
    senses: raw.senses,
    conditions: Array.isArray(raw.conditions) ? raw.conditions : [],
    age: raw.sheet_age ?? null,
    height: raw.height ?? null,
    weight: raw.character_weight ?? null,
    abilities,
    savingThrowProficiencies: (Array.isArray(raw.sheet_save_proficiencies)
      ? raw.sheet_save_proficiencies
      : []) as AbilityKey[],
    skillProficiencies: entries.filter(([, v]) => v === "proficient").map(([k]) => k),
    skillExpertises: entries.filter(([, v]) => v === "expertise").map(([k]) => k),
    languages: raw.languages ?? null,
    armorProficiencies: raw.sheet_proficiencies?.armor ?? null,
    weaponProficiencies: raw.sheet_proficiencies?.weapons ?? null,
    toolProficiencies: raw.sheet_proficiencies?.tools ?? null,
    features: raw.sheet_features,
    attacks: raw.sheet_attacks,
    species: raw.sheet_species || raw.race || "",
    personality: raw.sheet_personality,
    hasSpellcasting,
    spellPact: spellcasting.pact ?? null,
    spellcastingAbility: spellcasting.ability ?? null,
    spellSaveDC: spellcasting.save_dc ?? null,
    spellAttackBonus: spellcasting.attack_bonus ?? null,
    spellCantrips: spellNames(spellcasting.cantrips),
    spellPrepared: spellNames(spellcasting.prepared),
    spellKnown: spellNames(spellcasting.known ?? spellcasting.spellbook),
    spellAlwaysPrepared: spellNames(spellcasting.domain_spells ?? spellcasting.always_prepared),
    spellSlots: spellcasting.slots ?? {},
    // Limits and swap cadence come from class_spellcasting_progression
    // (SRD 5.2.1 class tables) via characters.sheet_spellcasting.
    spellCantripsMax: spellcasting.cantrips_max ?? null,
    spellPreparedMax: spellcasting.prepared_max ?? null,
    spellSwapCadence: spellcasting.swap_cadence ?? null,
    spellFocus: spellcasting.focus ?? null,
    spellRulesVersion: spellcasting.rules_version ?? null,
  }
}

const SKILL_ABILITY: Record<string, AbilityKey> = {
  acrobatics: "dex", animal_handling: "wis", arcana: "int", athletics: "str",
  deception: "cha", history: "int", insight: "wis", intimidation: "cha",
  investigation: "int", medicine: "wis", nature: "int", perception: "wis",
  performance: "cha", persuasion: "cha", religion: "int", sleight_of_hand: "dex",
  stealth: "dex", survival: "wis",
}
const SAVE_LABEL: Record<AbilityKey, string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
}
const titleCaseSkill = (key: string) =>
  key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")

export function formatSigned(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}`
}

/** Everything the Character Stats rail shows, derived from the row rather than
 *  transcribed from the design mock. `sheet_skill_proficiencies` is a jsonb
 *  OBJECT keyed by snake_case skill name ("proficient" | "expertise"); a skill
 *  counts as class-granted when it also appears in that class's skill list. */
function buildRailStats(c: Character | undefined) {
  const raw = (c ?? {}) as unknown as Record<string, any>
  const pb: number = raw.proficiency_bonus ?? 2
  const mod = (k: AbilityKey): number => raw[`${k}_modifier`] ?? 0

  const saveProfs: string[] = Array.isArray(raw.sheet_save_proficiencies) ? raw.sheet_save_proficiencies : []
  const saves = ABILITY_KEYS.map((k) => {
    const proficient = saveProfs.includes(k)
    return { key: k, label: SAVE_LABEL[k], proficient, bonus: mod(k) + (proficient ? pb : 0) }
  }).sort((a, b) => Number(b.proficient) - Number(a.proficient) || b.bonus - a.bonus)

  const classSkills: string[] = (classDefaults[raw.class as string]?.skillChoices?.options ?? [])
    .map((s: string) => s.toLowerCase().replace(/ /g, "_"))

  const skillMap = normalizedSkillMap(raw)
  const skills = Object.entries(skillMap)
    .filter(([key]) => SKILL_ABILITY[key])
    .map(([key, level]) => {
      const ability = SKILL_ABILITY[key]
      const multiplier = level === "expertise" ? 2 : 1
      return {
        name: titleCaseSkill(key),
        bonus: mod(ability) + pb * multiplier,
        fromClass: classSkills.includes(key),
        expertise: level === "expertise",
      }
    })
    .sort((a, b) => b.bonus - a.bonus || a.name.localeCompare(b.name))

  const passiveInsight = 10 + mod("wis") + (skillMap.insight === "expertise" ? pb * 2 : skillMap.insight ? pb : 0)

  return { saves, skills, passiveInsight, passivePerception: raw.passive_perception ?? 10 + mod("wis") }
}

type DialogueSpeechSegment = { speaker: string; line: string; npc_id: string | null; voice_id: string | null }
type DialogueEntry = { id?: string; speaker: string; text: string; speech_segments?: DialogueSpeechSegment[] | null; turn_id?: string; created_at?: string }

function dialogueLines(entry: DialogueEntry): DialogueEntry[] {
  if (entry.speaker !== "Malachar" || !entry.speech_segments?.length) return [entry]
  const lines: DialogueEntry[] = []
  let cursor = 0
  const push = (speaker: string, text: string, suffix: string) => {
    const clean = text.replace(/^[\s“”"']+|[\s“”"']+$/g, "").trim()
    if (clean) lines.push({ id: `${entry.id ?? "line"}-${suffix}`, speaker, text: clean })
  }
  entry.speech_segments.forEach((segment, index) => {
    const at = entry.text.indexOf(segment.line, cursor)
    if (at < 0) return
    push("Malachar", entry.text.slice(cursor, at), `dm-${index}`)
    push(segment.speaker === "NARRATOR" ? "Malachar" : segment.speaker, segment.line, `speaker-${index}`)
    cursor = at + segment.line.length
  })
  push("Malachar", entry.text.slice(cursor), "dm-tail")
  return lines.length ? lines : [entry]
}

const SPEAKER_COLORS = ["#61b978", "#d2b04f", "#e1876b", "#6fc0c5", "#c98bd8", "#8eb86a", "#df9164"]
function speakerColor(speaker: string): string {
  if (speaker === "Malachar" || speaker === "DM") return "#a879e1"
  if (speaker === "Sam") return "#52a5d4"
  if (speaker === "System") return "#b7a683"
  const hash = Array.from(speaker).reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 0)
  return SPEAKER_COLORS[hash % SPEAKER_COLORS.length]
}
type NpcEncounter = {
  id: string
  name: string
  description: string | null
  portrait_url: string | null
  face_url?: string | null
  idle_url?: string | null
  talking_url?: string | null
  is_active: boolean
  hp_current?: number | null
  hp_max?: number | null
  conditions?: string[] | null
  challenge_rating?: number | null
  disposition?: string | null
  stage_scale?: number | string | null
  stage_offset_y?: number | string | null
}

// True when a media URL is a video loop (idle/talking uploads are MP4/WebM).

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
  /** The FULL NPC roster for voicing, independent of `is_active`. `is_active`
   *  is a stage/portrait flag and must not gate who is allowed a voice, so the
   *  narration queue reads this. Everything else keeps using `npcEncounters`
   *  (active-only) for the stage, tactical overlay and combat checks. */
  npcRoster?: NpcEncounter[]
  isThinking?: boolean
  /** True when this browser has claimed a character via a claim link, i.e. a
   *  player is sitting here rather than the DM. Gates DM-only readouts. */
  claimLocked?: boolean
  /** The bottom status-bar DM Mode toggle. Sam's ruling, 18 Aug 2026: THIS is
   *  the switch that grants cinematic replay — not the saved DM code, which is
   *  invisible from the dashboard and left the badge and the toggle disagreeing
   *  about who was DM. */
  dmMode?: boolean
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

// MERGE NOTE: Codex's ornate panel/title treatment and the optional `action`
// slot are orthogonal, so this keeps both. The slot exists because the
// Interactive Log's filter row has no room for a control — six chips need
// 314px in a 250px column — so panel-level controls live in the title bar.
function Frame({ title, children, className, action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return <section className={cn("aop-ornate-panel min-h-0 overflow-hidden", className)}>
    <header className="aop-ornate-title flex h-8 items-center gap-2 px-3 font-serif text-[10px] font-semibold uppercase tracking-[.2em] text-[#e0b765]">
      <span className="truncate">{title}</span>
      {action ? <span className="ml-auto shrink-0">{action}</span> : null}
      <span className={cn("shrink-0 text-[#675638]", action ? "" : "ml-auto")}>— ×</span>
    </header>{children}
  </section>
}

export function V4Dashboard(props: V4DashboardProps) {
  const { roll, announce, busy: diceBusy } = useDice()
  const [logFilter, setLogFilter] = useState("All")
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [characterSheetOpen, setCharacterSheetOpen] = useState(false)
  const [diceOpen, setDiceOpen] = useState(false)
  const [spellbookOpen, setSpellbookOpen] = useState(false)
  const [stageMode, setStageMode] = useState<"scene" | "tactical">("scene")
  // Which face of the tactical stage is showing. The BOARD is always
  // reachable now — "you can only see the battle map while a monster is
  // active" meant Sam built a combat interface he could not open. Combat
  // only picks the DEFAULT: a fight starting flips the stage to the board.
  const [tacticalView, setTacticalView] = useState<"board" | "travel">("travel")
  const [statDetail, setStatDetail] = useState<"ac" | "initiative" | "proficiency" | "speed" | null>(null)
  // Restart Campaign DOES clear the dialogue table — the reason it looked like
  // it had failed is right here. An empty feed fell straight back to the
  // hardcoded preview script, so the log refilled with fake lines a moment
  // after the wipe and read as "nothing happened".
  //
  // The preview is scaffolding for a dashboard with no campaign behind it, so
  // it is only used when there is no live data at all. With real characters
  // loaded, an empty feed is a real empty feed and says so.
  const hasLiveCampaign = props.characters.length > 0
  const dialogue = props.dialogue.length
    ? props.dialogue
    : hasLiveCampaign ? [] : previewDialogue
  const displayedDialogue = dialogue.flatMap(dialogueLines)
  // Dictation: browser speech-to-text lands in the input for review; Enter sends.
  // speechBaseRef preserves anything already typed when the mic starts.
  const speechBaseRef = useRef("")
  const { listening: micListening, supported: micSupported, toggle: toggleMic } = useSpeechInput((transcript) =>
    props.setDialogueInput((speechBaseRef.current ? speechBaseRef.current + " " : "") + transcript),
  )
  const livePlayers = props.characters.filter((character) => character.is_player)
  const party = livePlayers.length ? livePlayers : previewCharacters
  const selected = props.selectedCharacter ?? livePlayers[0] ?? previewSelectedCharacter
  const visibleParty = props.claimLocked && selected
    ? party.filter((member) => member.id === selected.id)
    : party
  const equipmentBonus = props.equipment.reduce<Record<string, number>>((totals, item) => {
    Object.entries(item.stats_bonus ?? {}).forEach(([key, value]) => { totals[key.toLowerCase()] = (totals[key.toLowerCase()] ?? 0) + Number(value || 0) })
    return totals
  }, {})
  const rail = buildRailStats(selected)
  const acResult = calculateAC(selected, props.equipment)
  const displayedAc = acResult.total
  const displayedInitiative = (selected?.initiative ?? 0) + (equipmentBonus.initiative ?? 0)

  // Whoever currently holds the floor, reported by the narration queue. The
  // panel used to show whichever NPC happened to be `is_active`, so when
  // Jimjar answered inside Malachar's narration the picture stayed on someone
  // else. The speaker wins while they are talking; the scene's active NPC is
  // the resting state.
  const [speakingNpc, setSpeakingNpc] = useState<{ id: string; name: string } | null>(null)
  const activeNpc = props.npcEncounters.find((npc) => npc.is_active) ?? props.npcEncounters[0]
  const speakingRow = speakingNpc ? props.npcEncounters.find((npc) => npc.id === speakingNpc.id) : undefined
  // A speaking PLAYER takes the window too: when Player Voices reads a typed
  // line aloud, the speaker's face and talking loop hold the stage exactly the
  // way an NPC's does, then the window falls back to the active NPC.
  const speakingPlayer = speakingNpc && !speakingRow
    ? (props.characters.find((c) => c.id === speakingNpc.id && c.is_player) as (Character & { idle_url?: string | null; talking_url?: string | null }) | undefined)
    : undefined
  const shownNpc = speakingRow ?? activeNpc
  // EMPTY STAGE IS A REAL STATE, NOT A FAILURE.
  //
  // restart-campaign sets every npc_encounters row to is_active:false
  // ("offstage until the story calls it back") and only Malachar, mid-narration,
  // brings one back on. Between those two moments the correct answer is that
  // nobody is here — and page.tsx filters the fetch on is_active, so the array
  // is legitimately empty.
  //
  // This used to fall back to a hardcoded "Eldeth Feldrun" over the subtitle
  // "Present in the scene", so an empty stage rendered as a named NPC with a
  // broken portrait. It sent Sam looking for missing art that was never
  // missing: Eldeth has a face, a portrait and both loops. Nothing was absent
  // except the NPC herself.
  const onStage = speakingPlayer ?? shownNpc
  const npcName = speakingPlayer?.name ?? shownNpc?.name ?? "No one on stage"
  // A talking NPC gets talking_url when the row has one, so the animated head
  // switches to the speaking loop and back to idle on its own.
  const npcPortrait = speakingPlayer
    ? (speakingPlayer.talking_url || speakingPlayer.idle_url || speakingPlayer.portrait_image_url || speakingPlayer.avatar_image_url)
    : speakingRow
    ? (speakingRow.talking_url || speakingRow.idle_url || speakingRow.face_url || speakingRow.portrait_url)
    : (shownNpc?.idle_url || shownNpc?.face_url || shownNpc?.portrait_url)
  // The most recent line this NPC actually spoke in the feed — replaces the
  // hardcoded preview quote that used to caption every NPC as Eldeth.
  // Whoever holds the head window brings their own framing — a face close-up
  // needs none, a full-body goblin loop needs zooming into the face. NPC rows
  // only: a speaking PLAYER's stage_scale is tuned for the bottom-anchored scene
  // stage, and reusing it here would mean one number serving two different
  // shots. A player borrowing the window keeps the untouched framing.
  const npcFrame = npcWindowStyle(speakingPlayer ? undefined : ((speakingRow ?? shownNpc) as StageFramingRow | undefined))
  const lastNpcLine = [...dialogue].reverse().find((entry) => entry.speaker === npcName)?.text?.slice(0, 160) ?? null
  const characterPortrait = selected?.portrait_image_url || selected?.avatar_image_url
  // Layer 2 — the POV character's own animated idle. Prefer the loop; fall back
  // to the still portrait when a character has no idle_url yet. A talking loop
  // could later swap in the same way the NPC head does, but players don't speak
  // as NPCs do, so idle is the whole story here.
  const characterStageMedia = (selected as Character & { idle_url?: string | null })?.idle_url || characterPortrait
  // Every idle loop is framed differently — Fifi's is a waist-up crop flush to
  // its frame; Samson's is a full body inside a tall 404x720 frame with ~9%
  // empty space under his feet. Sizing off the frame alone made him read as a
  // fairy floating mid-air next to her. `stage_scale` says how tall this
  // character stands, `stage_offset_y` pushes the figure down so the padding
  // falls below the panel and the feet meet the ground line. Both default to
  // the previous behaviour (1 / 0), so untuned characters are unchanged.
  const stageFrame = characterStageStyle(selected as (Character & StageFramingRow) | undefined)
  const inCombat = props.npcEncounters.some((npc) => npc.is_active && (npc.challenge_rating ?? 0) > 0)
  // A fight breaking out drags the tactical stage to the board once. It does
  // not fight the DM afterwards — switch freely mid-combat.
  const wasInCombat = useRef(false)
  useEffect(() => {
    if (inCombat && !wasInCombat.current) setTacticalView("board")
    wasInCombat.current = inCombat
  }, [inCombat])
  const conditions = ((selected as Character & { conditions?: string[] | null })?.conditions ?? ["Poisoned", "Exhaustion 1"])
  const characterExtra = selected as Character & { subclass?: string | null; sheet_background?: string | null; sheet_spellcasting?: Record<string, unknown> | null }
  const isMagicUser = ["bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "warlock", "wizard"].includes((selected?.class ?? "").toLowerCase())
  // Header identity is READ from the row, never transcribed from the mock. The
  // design image said "Human … · Acolyte" for everyone; species and background
  // are real columns (sheet_species / sheet_background), so a Human Rogue with
  // the "Criminal / Spy" background now reads correctly.
  const sheetRow = selected as unknown as Record<string, any>
  const speciesLabel = sheetRow?.sheet_species || sheetRow?.race || "Human"
  const backgroundLabel = characterExtra?.sheet_background || "Adventurer"
  // Spell slots come from the character's sheet_spellcasting block. A non-caster
  // (a level-1 Rogue whose sheet_spellcasting is `{}`) has no slots, so the
  // whole panel must not render — never a hardcoded "LV 1 · 2/2". `slots` may be
  // an array indexed by level (game-data shape) or an object keyed by level.
  const spellcasting = (characterExtra?.sheet_spellcasting ?? {}) as Record<string, any>
  const rawSlots = spellcasting.slots
  const spellSlotLevels: { level: string; total: number; used: number }[] = (() => {
    if (!rawSlots || typeof rawSlots !== "object") return []
    const entries = Array.isArray(rawSlots)
      ? rawSlots.map((count, index) => [String(index + 1), count] as const)
      : Object.entries(rawSlots)
    return entries
      .map(([level, value]) => {
        if (typeof value === "number") return { level, total: value, used: 0 }
        if (value && typeof value === "object") {
          const record = value as Record<string, unknown>
          const total = Number(record.total ?? record.max ?? record.slots ?? 0)
          const used = Number(record.used ?? record.expended ?? 0)
          return { level, total, used }
        }
        return { level, total: 0, used: 0 }
      })
      .filter((slot) => slot.total > 0)
  })()
  const hasSpellSlots = spellSlotLevels.length > 0
  // Static fallback chips — SuggestionChips shows these when no live player is
  // selected or the per-beat Haiku generation returns nothing. (PR-3)
  //
  // These MUST stay class-neutral. They previously read as cleric lines
  // ("(Faith) Offer a quiet prayer", "(Medicine) Tend to Kenta's arm"), so any
  // player whose generation failed was handed Samson's options — the exact
  // leak the per-player chips exist to prevent. No class, no skill tag, no
  // named party member: whatever sits here is shown to EVERY seat at once.
  // === CINEMATICS (Sam's rulings, 18 Aug 2026) ===
  //  1. A clip plays ONCE per character. The server owns that memory
  //     (cinematic_views); this component never decides what is unseen.
  //  2. DM Mode — the bottom toggle — is the only override. It sends
  //     dm_override, which bypasses the seen-check server-side.
  //  3. The trigger is the look-around CHIP, nothing else. Every generated set
  //     carries exactly one observe chip (see lib/suggestions.ts); picking it
  //     sends the action to Malachar as normal AND rolls for an unseen clip.
  //     First look at a location plays the cinematic, every look after that is
  //     description alone. Still no sniffing of free-typed text.
  //  4. A solo clip plays only for the character who asked. A party clip is a
  //     group moment, so it is broadcast to every seat over the realtime
  //     channel and plays for all of them.
  //  5. It plays once through and ends — CinematicOverlay carries no loop.
  //  6. The request MUST carry dmHeaders() whenever it claims dm_override:
  //     /api/cinematics only waives the x-dm-key check for player_initiated.
  //     DM Mode is an unguarded toggle that never asks for the code, so a DM
  //     with the toggle on but no code stored is prompted once rather than
  //     handed the silent 403 that hid this feature the first time round.
  const [cinematicSrc, setCinematicSrc] = useState<string | null>(null)
  const [cinematicBusy, setCinematicBusy] = useState(false)
  const locationName = props.environment.name
  const seatId = selected?.id ?? null

  //  7. A cue from Malachar (rule 9 of the tag protocol) is the second door.
  //     It asks for kind=action and the cue name as state, under the
  //     event_driven trigger; everything downstream — resolution, the
  //     once-per-character rule, solo vs party — is unchanged and still owned
  //     by the server. scope is a PREFERENCE the resolver may override, so the
  //     broadcast decision below reads the scope the response came back with.
  const cinematicParams = useCallback(
    (asDm: boolean, cue?: { state: string }) => {
      const params = new URLSearchParams({
        location: locationName,
        kind: cue ? "action" : "environment",
        scope: cue ? "solo" : "party",
        trigger_type: asDm ? "dm_override" : cue ? "event_driven" : "player_initiated",
      })
      if (cue) params.set("state", cue.state)
      if (seatId) params.set("character_id", seatId)
      return params
    },
    [locationName, seatId],
  )

  // No probe any more. The old flow asked "is anything here?" on every scene
  // change so it could decide whether to render a button; with the chip as the
  // only door there is nothing to decide in advance, and a resolution that
  // returns nothing is simply a look that yields description instead of film.

  // Group clips arrive here from another seat; solo clips never broadcast.
  useEffect(() => {
    const channel = createClient()
      .channel("cinematic-broadcast")
      .on("broadcast", { event: "play" }, (message) => {
        const url = (message?.payload as { video_url?: string })?.video_url
        if (url) setCinematicSrc(url)
      })
      .subscribe()
    return () => {
      void createClient().removeChannel(channel)
    }
  }, [])

  // Rolled when the look-around chip is picked. A null clip is the ORDINARY
  // outcome — already seen, or this location has no film — and must stay
  // completely silent: the player asked to look around, Malachar is already
  // answering in words, and a failed camera cue is not an error they should
  // ever perceive.
  const playSceneCinematic = async (cue?: { state: string }) => {
    if (cinematicBusy) return
    setCinematicBusy(true)
    try {
      // DM Mode does not ask for the DM code, but dm_override without the
      // x-dm-key header is a guaranteed 403. Ask once instead of failing mute;
      // a dismissed prompt just falls back to an ordinary player request.
      let asDm = !!props.dmMode
      if (asDm && !hasDmKey()) asDm = ensureDmKey("replay cinematics in DM Mode") !== null
      const res = await fetch(`/api/cinematics?${cinematicParams(asDm, cue).toString()}`, {
        headers: dmHeaders(),
      })
      if (!res.ok) {
        console.warn("[cinematics] request rejected:", res.status)
        return
      }
      const body = await res.json()
      const clip = body?.clip as { video_url?: string; scope?: string } | null
      if (!clip?.video_url) return // seen already, or nothing filmed here
      setCinematicSrc(clip.video_url)
      if (clip.scope === "party") {
        // A group moment: everyone at the table sees it, not just this seat.
        await createClient()
          .channel("cinematic-broadcast")
          .subscribe()
          .send({ type: "broadcast", event: "play", payload: { video_url: clip.video_url } })
      }
    } catch {
      /* a failed cinematic must never interrupt play */
    } finally {
      setCinematicBusy(false)
    }
  }

  // Malachar cued a filmed moment this turn (app/page.tsx forwards it here).
  // A cue that resolves to nothing — no film, or this seat has already seen it
  // — is the ORDINARY outcome and stays completely silent, exactly like the
  // look-around path above.
  const cueHandler = useRef(playSceneCinematic)
  cueHandler.current = playSceneCinematic
  useEffect(() => onCinematicCue((cue) => void cueHandler.current(cue)), [])

  // Static fallbacks. "Look around" carries kind:"observe" so the cinematic
  // still has a door even when suggestion generation fails outright.
  const quickReplies: Suggestion[] = [
    { text: "Listen for anything nearby", skill: null },
    { text: "Speak up", skill: null },
    { text: "Wait and watch", skill: null },
    { text: "Look around", skill: null, kind: "observe" },
  ]
  const abilities = abilityKeys.map((key) => ({
    key,
    score: (selected?.[`${key}_score` as keyof Character] as number ?? ({ str: 13, dex: 10, con: 14, int: 8, wis: 15, cha: 12 }[key])) + (equipmentBonus[key] ?? equipmentBonus[`${key}_score`] ?? 0),
    mod: (selected?.[`${key}_modifier` as keyof Character] as number ?? ({ str: 1, dex: 0, con: 2, int: -1, wis: 2, cha: 1 }[key])) + (equipmentBonus[`${key}_modifier`] ?? 0),
  }))
  // MERGE NOTE: both branches independently fixed Roll Initiative. Codex's
  // version is kept because it also sends the result to Malachar so he reacts
  // to it; the message itself now goes through the shared describeRoll() so an
  // initiative roll reads identically to every other roll in the feed.
  const rollInitiative = async () => {
    const result = await roll({ die: "d20", numDice: 1, modifier: displayedInitiative, label: "Initiative" })
    announce(describeRoll(result), { toLich: true, result })
  }

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
      <Frame title="Interactive Log" className="relative flex min-h-[240px] flex-[2_1_0%] flex-col">
        <div className="flex gap-1 px-2 pt-2">{["All", "Narration", "Dialogue", "Combat", "System"].map((filter) => <button key={filter} onClick={() => setLogFilter(filter)} className={cn("rounded px-2 py-0.5 text-[9px]", logFilter === filter ? "bg-[#a8272e] text-white" : "border border-[#4b3a19] text-[#8f8061]")}>{filter}</button>)}</div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5 pb-16 text-[11px] leading-[1.45]">{displayedDialogue.length === 0 ? <p className="mt-6 text-center text-[10px] italic text-[#6d6450]">The log is empty. Malachar is waiting.</p> : null}{displayedDialogue.map((entry, index) => <p key={entry.id ?? index}><strong style={{ color: speakerColor(entry.speaker) }}>{entry.speaker}:</strong> <span className="text-[#ddd2bc]">{entry.text}</span></p>)}{props.isThinking && <p className="animate-pulse text-[#a879e1]">Malachar is considering your suffering…</p>}</div>
        <button onClick={() => setDiceOpen(true)} className="aop-log-d20 absolute bottom-3 right-3" title="Open Dice Roller" aria-label="Open Dice Roller" />
      </Frame>
      {/* Player-to-player chat — the `party` channel. Plain inserts only; never
          calls /api/chat and never enters the DM transcript above. */}
      <Frame title="Party" className="flex min-h-[190px] flex-[1_1_0%] flex-col">
        <PartyChat bare characterName={props.selectedCharacter?.name} className="min-h-0 flex-1" />
      </Frame>
    </div>

    <Frame title="NPC / Dungeon Master Window" className="flex min-h-[690px] flex-col" action={<DmNarration dialogue={dialogue} npcs={props.npcRoster?.length ? props.npcRoster : props.npcEncounters} players={livePlayers.map((c) => ({ id: c.id, name: c.name, voice_id: c.voice_id ?? null, voice_description: c.voice_description ?? null }))} onSpeakingChange={(npc) => setSpeakingNpc(npc ? { id: npc.id, name: npc.name } : null)} />}>
      <div className="grid h-[235px] shrink-0 grid-cols-[190px_minmax(240px,1fr)] gap-4 overflow-hidden p-3 pb-4">
        <div><h2 className="font-serif text-sm font-bold text-white">{npcName}</h2><p className="text-[9px] text-[#a4916d]">{speakingPlayer ? `Level ${speakingPlayer.level} ${speakingPlayer.class}` : onStage ? shownNpc?.description || "Present in the scene" : "No one has stepped forward yet"}</p>{lastNpcLine ? <blockquote className="mt-3 border-l-2 border-red-700 pl-2 text-[11px] italic leading-[1.45] text-[#e4d8bf]">“{lastNpcLine}”</blockquote> : null}{activeNpc ? <button className="mt-5 w-full rounded border border-[#695326] py-2 text-[10px] text-[#cdb276]">View {npcName}</button> : null}</div>
        <div className="flex min-w-0 flex-col"><div className="relative min-h-0 flex-1 overflow-hidden rounded border border-[#6b5123] bg-[radial-gradient(circle_at_50%_30%,#302314,#050403_70%)]">{npcPortrait ? (isVideoUrl(npcPortrait) ? <video key={npcPortrait} src={npcPortrait} autoPlay loop muted playsInline style={npcFrame} className="absolute inset-0 h-full w-full object-contain object-top" /> : <img src={npcPortrait} alt={npcName} style={npcFrame} className="aop-npc-still absolute inset-0 h-full w-full object-contain object-top" />) : <div className="flex h-full flex-col items-center justify-end"><div className="h-28 w-20 rounded-t-[45%] bg-gradient-to-b from-[#9b7846] via-[#45341e] to-[#171008] shadow-[0_0_30px_#b3874033]" /><span className="absolute bottom-2 rounded bg-black/70 px-2 py-1 text-[8px] uppercase tracking-wider text-[#cdb276]">{onStage ? "Portrait loads from NPC canon" : "The stage is empty"}</span></div>}<div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#c49b4e]/20" /></div><div className={cn("mt-1.5 flex h-7 items-center justify-center rounded border text-[9px] uppercase tracking-[.16em] transition-colors", speakingNpc ? "border-[#b8913f] bg-[#1c1408] text-[#f0cd7a]" : "border-[#3b3325] bg-black/40 text-[#6d6450]")}>{speakingNpc ? <>Speaking <span className="ml-2 animate-pulse">▮▮▯▯</span></> : onStage ? <>Silent <span className="ml-2">▯▯▯▯</span></> : <>Awaiting an entrance</>}</div>
          {/* MERGE NOTE: Codex's redesign dropped the third column, which held
              disposition / CR / DM-only health. Those are real row data, not
              mock text, so they are re-homed here as a compact strip beneath
              the portrait rather than lost. */}
          <div className="mt-1.5 flex shrink-0 items-stretch gap-1.5 overflow-x-auto text-[10px]">
            {!onStage
              ? null
              : props.claimLocked
              ? <div className="rounded border border-[#3b3325] bg-[#141210] px-2 py-1"><span className="block text-[8px] uppercase tracking-wider text-[#6d6450]">Disposition</span><span className="text-[#7e7663]">Read them yourself</span></div>
              : <DispositionChip value={activeNpc?.disposition} />}
            {activeNpc?.challenge_rating ? <div className="rounded border border-[#4b3a19] px-2 py-1"><span className="block text-[8px] uppercase tracking-wider text-[#847557]">Challenge</span><span className="text-[#d9c492]">CR {activeNpc.challenge_rating}</span></div> : null}
            {typeof activeNpc?.hp_current === "number" && typeof activeNpc?.hp_max === "number" && activeNpc.hp_max > 0 && !props.claimLocked
              ? <div className="min-w-[92px] rounded border border-[#4b3a19] px-2 py-1"><span className="block text-[8px] uppercase tracking-wider text-[#847557]">Health · DM</span><span className="text-[#d9c492]">{activeNpc.hp_current} / {activeNpc.hp_max}</span><div className="mt-1 h-1 bg-[#281315]"><div className="h-full bg-[#b62d38]" style={{ width: `${Math.max(0, Math.min(100, (activeNpc.hp_current / activeNpc.hp_max) * 100))}%` }} /></div></div>
              : null}
          </div>
        </div>
      </div>
      <div className="relative mx-3 mt-3 min-h-[205px] flex-1 overflow-hidden rounded border border-[#4b3a19] bg-black">
        <img src={props.environment.imageUrl} alt="Current scene" className={cn("h-full w-full object-cover transition-all duration-500", stageMode === "tactical" && "brightness-[.38] saturate-[.65]")} />
        <div className="absolute left-3 top-3 z-20 flex gap-1 rounded border border-[#6b5123] bg-[#080705]/85 p-1 text-[8px] uppercase tracking-wider">
          <button onClick={() => setStageMode("scene")} className={cn("flex items-center gap-1 rounded px-2 py-1", stageMode === "scene" ? "bg-[#8b6427] text-white" : "text-[#b7a47d]")}><Compass className="h-3 w-3" />Character View</button>
          <button onClick={() => setStageMode("tactical")} className={cn("flex items-center gap-1 rounded px-2 py-1", stageMode === "tactical" ? "bg-[#8b6427] text-white" : "text-[#b7a47d]")}><Map className="h-3 w-3" />Tactical Map{inCombat ? " · Live" : ""}</button>
        </div>
        {stageMode === "scene" ? <>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/15" />
          {characterStageMedia ? (isVideoUrl(characterStageMedia)
            ? <video key={characterStageMedia} src={characterStageMedia} autoPlay loop muted playsInline aria-hidden="true" style={stageFrame} className="absolute bottom-0 left-1/2 object-contain object-bottom drop-shadow-[0_12px_18px_#000]" />
            : <img src={characterStageMedia} alt={selected?.name ?? "Active character"} style={stageFrame} className="absolute bottom-0 left-1/2 object-contain object-bottom drop-shadow-[0_12px_18px_#000]" />
          ) : <div className="absolute bottom-0 left-1/2 h-[78%] w-[23%] -translate-x-1/2 rounded-t-[48%] bg-gradient-to-b from-[#6d5531] via-[#2c2115] to-[#080604] opacity-90 shadow-[0_0_35px_#c5993d22]" />}
          <div className="absolute bottom-3 left-3 rounded border border-[#6b5123] bg-[#080705]/85 px-2 py-1"><span className="block text-[8px] uppercase tracking-wider text-[#8f8061]">Point of view</span><b className="font-serif text-[10px] text-[#e1d0a8]">{selected?.name ?? "Active character"} · {props.environment.name}</b></div>
        </> : <>
          {tacticalView === "board"
            ? <CombatBoard3D onBack={() => setStageMode("scene")} />
            : <MapPanel initial="location" onBack={() => setStageMode("scene")} />}
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded border border-[#6b5123] bg-[#080705]/90 p-1 text-[8px] uppercase tracking-wider">
            <button onClick={() => setTacticalView("board")} className={cn("rounded px-2.5 py-1", tacticalView === "board" ? "bg-[#8b6427] text-white" : "text-[#b7a47d]")}>Battle Board{inCombat ? " · Live" : ""}</button>
            <button onClick={() => setTacticalView("travel")} className={cn("rounded px-2.5 py-1", tacticalView === "travel" ? "bg-[#8b6427] text-white" : "text-[#b7a47d]")}>Travel Map</button>
          </div>
        </>}
      </div>
      <div className="flex flex-col gap-1">
        <SuggestionChips
          character={livePlayers.length && selected?.is_player ? selected : undefined}
          dialogue={dialogue}
          inventory={props.inventory}
          location={props.environment.name}
          fallback={quickReplies}
          disabled={!!props.isThinking}
          onPick={(text, isObserve) => {
            // The action always reaches Malachar. The cinematic rides along on
            // top of it the first time, so a look that has no film left still
            // reads as a normal look rather than a dead button.
            props.onQuickReply?.(text)
            if (isObserve) void playSceneCinematic()
          }}
        />
      </div>
      <div className="flex items-center gap-2 px-3 py-2"><input value={props.dialogueInput} onChange={(event) => props.setDialogueInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && props.onDialogueSubmit()} placeholder="Type your response or action…" className="aop-lich-input h-8 min-w-0 flex-1 px-3 text-[11px]" /><button disabled={!micSupported} onClick={() => { if (!micListening) speechBaseRef.current = props.dialogueInput; toggleMic() }} className={cn("aop-square-action h-8 w-8", micListening && "animate-pulse text-[#e05a64]", !micSupported && "opacity-50")} title={micSupported ? micListening ? "Stop dictation" : "Dictate your response" : "Voice input is not supported in this browser"}><Mic className="m-auto h-3 w-3" /></button><button disabled={diceBusy} onClick={() => void rollInitiative()} className="aop-initiative-button flex h-10 items-center gap-1.5 whitespace-nowrap pr-3 text-[10px] disabled:opacity-60" title="Roll initiative with physics and report the result"><span className="h-9 w-11 shrink-0 bg-[url('/images/ui/character-stat-shields.png')] bg-[length:400%_auto] bg-no-repeat" style={{ backgroundPosition: "66.666% 40%", clipPath: "polygon(50% 0, 94% 14%, 91% 72%, 78% 90%, 50% 100%, 22% 90%, 9% 72%, 6% 14%)" }} /><span><b className="block font-serif text-[#ead39e]">{diceBusy ? "Rolling…" : "Roll Initiative"}</b><small className="block text-[7px] text-[#9f875d]">{signed(displayedInitiative)} modifier</small></span></button></div>
      <div className="border-t border-[#4b3a19] px-3 py-2"><h3 className="mb-3 text-center font-serif text-[10px] uppercase tracking-[.2em] text-[#cdb276]">Party Status</h3><div className="flex items-stretch gap-2">{visibleParty.slice(0,4).map((member) => { const active = member.id === props.selectedCharacterId || (!props.selectedCharacterId && member.name === "Sam"); const portrait = "avatar_image_url" in member ? member.avatar_image_url : null; return <button key={member.id} onClick={() => livePlayers.length && props.onCharacterSelect?.(member.id)} className={cn("min-w-0 flex-1 rounded border bg-[#12100b] p-2 text-center", active ? "border-[#bd9143] shadow-[0_0_10px_#8b642744]" : "border-[#4b3a19]")}><div className="mx-auto h-11 w-11 overflow-hidden rounded-full border-2 border-[#8d6d35] bg-[#20180d]">{portrait ? <img src={portrait} alt={member.name} className="h-full w-full object-cover object-[center_14%]" /> : <div className="flex h-full items-center justify-center font-serif text-lg text-[#cdb276]">{member.name[0]}</div>}</div><div className="mt-1 truncate font-serif text-[10px] text-[#ddd2bc]">{member.name}</div><div className="text-[8px] text-[#8f8061]">{member.class} {member.level}</div><div className="mt-1 text-[8px] text-[#b9a986]">♥ {member.hp_current}/{member.hp_max}　⌾ {member.ac}　↟ +{member.initiative}</div><div className="mt-1 h-1 bg-[#281315]"><div className="h-full bg-[#b62d38]" style={{ width: `${Math.max(0, member.hp_current / member.hp_max * 100)}%` }} /></div></button>})}</div></div>
    </Frame>

    <div className="flex min-h-0 flex-col gap-2">
      <Frame title="Character Stats" className="shrink-0">
        <div className="p-2.5 text-[10px]">
          <div className="flex items-center gap-2"><div className="h-12 w-12 overflow-hidden rounded border border-[#a88745] bg-[#241b0e]">{selected?.avatar_image_url ? <img src={selected.avatar_image_url} alt={selected.name} className="h-full w-full object-cover object-[center_14%]" /> : <div className="flex h-full items-center justify-center text-xl text-[#cdb276]">{selected?.name?.[0] ?? "S"}</div>}</div><div className="min-w-0"><h2 className="font-serif text-sm font-bold text-white">{selected?.name ?? "Sam"}</h2><p className="truncate text-[9px] text-[#a4916d]">{speciesLabel} {selected?.class ?? "Cleric"} · {backgroundLabel}</p></div><span className="ml-auto rounded border border-[#695326] px-2 py-1 text-[#cdb276]">Level {selected?.level ?? 1}</span></div>
          <div className="mt-2 flex justify-between text-[8px] text-[#8f8061]"><span>Level {selected?.level ?? 1} progress</span><span>{selected?.xp ?? 0} / {selected?.xp_to_next ?? 300} XP</span></div><div className="mt-1 h-1 bg-[#251a12]"><div className="h-full w-[2%] bg-[#b62d38]" /></div>
          <div className="mt-2 flex items-center gap-2"><b className="text-[#ddd2bc]">HP {selected?.hp_current ?? 10} / {selected?.hp_max ?? 10}</b><div className="h-2 flex-1 bg-[#281315]"><div className="h-full bg-[#bd3039]" style={{ width: `${((selected?.hp_current ?? 10)/(selected?.hp_max ?? 10))*100}%` }} /></div><button className="rounded border border-[#4b3a19] px-1.5 text-[8px]">HEAL</button><button className="rounded border border-[#4b3a19] px-1.5 text-[8px]">DMG</button></div>
          <div className="mt-1 flex gap-1">{conditions.map((condition) => { const key = condition.toLowerCase().split(" ")[0]; return <span key={condition} className={cn("rounded-full border px-2 py-0.5 text-[8px]", conditionColor[key] ?? "border-[#4b3a19] text-[#a4916d]")}>{condition}</span>})}<span className="rounded-full border border-dashed border-[#4b3a19] px-2 text-[#8f8061]">+</span></div>
          {hasSpellSlots ? (
            <div className="mt-2 space-y-1">
              {spellSlotLevels.map((slot) => {
                const remaining = Math.max(0, slot.total - slot.used)
                const pips = "◉".repeat(remaining) + "◯".repeat(Math.max(0, slot.total - remaining))
                return (
                  <div key={slot.level} className="flex items-center rounded border border-[#4b3a19] px-2 py-1 text-[8px]">
                    <span className="text-purple-400">{`SPELL SLOTS · LV ${slot.level}　${pips}`}</span>
                    <span className="ml-auto text-[#8f8061]">{`${remaining} / ${slot.total}`}</span>
                  </div>
                )
              })}
            </div>
          ) : null}
          <div className="mt-2 grid grid-cols-3 gap-2">
              <StatShield kind="ac" label="Armor Class" value={String(displayedAc)} tooltip={acResult.text} onClick={() => setStatDetail("ac")} />
            <StatShield kind="proficiency" label="Proficiency" value={`+${selected?.proficiency_bonus ?? 2}`} onClick={() => setStatDetail("proficiency")} />
            <StatShield kind="speed" label="Speed" value={selected?.speed || "30 ft"} onClick={() => setStatDetail("speed")} />
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1">{abilities.map((ability) => <AbilityScoreCard key={ability.key} ability={ability} />)}</div>
          {/* Saves, skills and passive Insight are DERIVED. They were previously
              transcribed from the v4.1 mock image, which meant every character —
              Fifi the Rogue included — showed Sam the Cleric's numbers and the
              literal legend "Cleric class skill". */}
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <h3 className="font-serif text-[9px] font-bold uppercase tracking-wider text-[#cdb276]">Saving Throws</h3>
              {rail.saves.map((save) => (
                <div key={save.key} className="flex items-center gap-1.5 text-[#b6a685]">
                  <span className={cn("h-1.5 w-1.5 rounded-full", save.proficient ? "bg-[#d9232e]" : "border border-[#6b5a35]")} />
                  <span>{save.label}</span>
                  <b className="ml-auto text-white">{formatSigned(save.bonus)}</b>
                </div>
              ))}
              <h3 className="mt-2 font-serif text-[9px] font-bold uppercase tracking-wider text-[#cdb276]">Senses</h3>
              <div className="flex justify-between text-[#b6a685]"><span>Passive Perception</span><b className="text-white">{rail.passivePerception}</b></div>
              <div className="flex justify-between text-[#b6a685]"><span>Passive Insight</span><b className="text-white">{rail.passiveInsight}</b></div>
            </div>
            <div>
              <h3 className="font-serif text-[9px] font-bold uppercase tracking-wider text-[#cdb276]">Skills</h3>
              {rail.skills.length === 0 ? (
                <p className="text-[9px] text-[#8f8061]">No skill proficiencies recorded for {selected?.name ?? "this character"}.</p>
              ) : (
                rail.skills.map((skill) => (
                  <div key={skill.name} className={cn("flex items-center justify-between px-1 text-[#b6a685]", skill.fromClass && "border border-[#725c2f] bg-[#251c0d]")}>
                    <span className="truncate">{skill.name}</span>
                    <b className="ml-1 shrink-0 text-white">{formatSigned(skill.bonus)}</b>
                  </div>
                ))
              )}
              {rail.skills.some((skill) => skill.fromClass) && (
                <p className="mt-1 text-[8px] text-[#8f8061]">□ {selected?.class ?? "Class"} class skill</p>
              )}
            </div>
          </div>
          <button onClick={() => setCharacterSheetOpen(true)} className="mt-2 w-full rounded border border-[#a88745] py-2 font-serif text-[10px] text-[#d9c492] hover:bg-[#2a1e0e]">⌁ View Full Character Sheet</button>
        </div>
      </Frame>
      <button onClick={() => setInventoryOpen(true)} className="flex h-9 items-center rounded-lg border border-[#4b3a19] bg-[#100e09] px-3 font-serif text-[10px] font-bold uppercase tracking-[.14em] text-[#cdb276]">Inventory &amp; Equipment <span className="ml-auto font-sans text-[9px] normal-case tracking-normal text-[#8f8061]">{props.inventory.reduce((sum, item) => sum + Number(item.weight ?? 0) * item.quantity, 0).toFixed(1)} / {selected?.weight_max ?? 105} lb · {props.equipment.length} equipped　▶</span></button>
      {isMagicUser ? <button onClick={() => setSpellbookOpen(true)} className="flex h-9 items-center rounded-lg border border-purple-900/70 bg-[linear-gradient(90deg,#100b12,#1b1020,#100b12)] px-3 font-serif text-[10px] font-bold uppercase tracking-[.14em] text-purple-300">{selected.class === "Cleric" || selected.class === "Monk" ? <><img src={BOOK_OF_PRAYERS_MEDIA.animation} alt="" aria-hidden className="mr-2 -my-1 h-10 w-10 shrink-0 object-contain motion-reduce:hidden" /><img src={BOOK_OF_PRAYERS_MEDIA.poster} alt="" aria-hidden className="mr-2 -my-1 hidden h-10 w-10 shrink-0 object-contain motion-reduce:block" /></> : <BookOpen className="mr-2 h-4 w-4" />}{selected.class === "Cleric" || selected.class === "Monk" ? "Book of Prayers" : "Book of Spells"} <span className="ml-auto font-sans text-[8px] normal-case tracking-normal text-purple-400">{characterExtra.subclass || `${selected.class === "Cleric" ? "Domain" : "Subclass"} not recorded`}　▶</span></button> : null}
    </div>
    {statDetail ? <StatDetailModal kind={statDetail} character={selected} acBreakdown={acResult.text} onClose={() => setStatDetail(null)} /> : null}
    {diceOpen ? <DiceRoller presentation="modal" onClose={() => setDiceOpen(false)} characterName={selected?.name ?? "Player"} /> : null}
    {spellbookOpen ? <SpellbookModal character={selected} onClose={() => setSpellbookOpen(false)} /> : null}
    {/* MERGE NOTE: Codex's branch predates the Forge 2014 sheet port. Sam
        asked for that port explicitly ("I don't like what we have now",
        "Full port"), so the slide-over stays and CharacterSheetModal does
        not come back. The Spellbook and dice modal beside it are new from
        Codex and are kept as-is. */}
    <CharacterSheetSlideOver
      open={characterSheetOpen}
      onClose={() => setCharacterSheetOpen(false)}
      character={{ ...toSheetCharacter(selected), ac: displayedAc, acBreakdown: acResult.text, initiative: displayedInitiative }}
      inventory={props.inventory as any}
    />
    {inventoryOpen ? <EquipmentManager character={selected} inventory={props.inventory} equipment={props.equipment} bonuses={equipmentBonus} onEquip={props.onEquipItem} onUnequip={props.onUnequipItem} onClose={() => setInventoryOpen(false)} /> : null}
  {cinematicSrc ? <CinematicOverlay src={cinematicSrc} onClose={() => setCinematicSrc(null)} /> : null}
  </main>
}

const equipmentSlots: Array<{ id: EquipmentItem["slot"]; label: string; position: string; icon: string }> = [
  { id: "head", label: "Head", position: "left-[4%] top-[5%]", icon: "/icons/equipment/head.png" },
  { id: "neck", label: "Neck", position: "right-[4%] top-[5%]", icon: "/icons/equipment/neck.png" },
  { id: "torso", label: "Torso", position: "right-[4%] top-[30%]", icon: "/icons/equipment/torso.png" },
  { id: "main_hand", label: "Main Hand", position: "left-[4%] top-[31%]", icon: "/icons/equipment/main-hand.png" },
  { id: "off_hand", label: "Off Hand", position: "right-[4%] top-[56%]", icon: "/icons/equipment/off-hand.png" },
  { id: "legs", label: "Legs", position: "left-[4%] top-[58%]", icon: "/icons/equipment/legs.png" },
  { id: "feet", label: "Feet", position: "left-[28%] bottom-[2%]", icon: "/icons/equipment/feet.png" },
  { id: "ring1", label: "Ring I", position: "right-[28%] bottom-[2%]", icon: "/icons/equipment/ring.png" },
  { id: "ring2", label: "Ring II", position: "right-[4%] bottom-[2%]", icon: "/icons/equipment/ring2.png" },
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
  const [selectedScene, setSelectedScene] = useState("drow-prisons")
  const { roll, busy } = useDice()
  const portrait = character.portrait_image_url || character.avatar_image_url
  const extra = character as Character & { race?: string; background?: string; subclass?: string; alignment?: string; personality_traits?: string; ideals?: string; bonds?: string; flaws?: string; faith?: string }
  const speed = character.speed || "30 ft."
  const carriedWeight = inventory.reduce((sum, item) => sum + Number(item.weight || 0) * item.quantity, 0)
  const sheetScenes = [{ id: "drow-prisons", label: "Option 1 · Drow Prisons", image: "/images/ui/character-sheet-scenes/option-1-drow-prisons.png" }]
  const activeScene = sheetScenes.find((scene) => scene.id === selectedScene) ?? sheetScenes[0]
  const abilityRoll = (ability: { key: string; mod: number }) => void roll({ die: "d20", numDice: 1, modifier: ability.mod, label: `${abilityNames[ability.key]} Check` })
  const initiativeRoll = () => void roll({ die: "d20", numDice: 1, modifier: displayedInitiative, label: "Initiative" })
  return <ModalShell title="Full Character Sheet" onClose={onClose} wide>
    <div className="min-h-full bg-cover bg-center bg-fixed p-4" style={{ backgroundImage: `linear-gradient(rgba(4,5,8,.78), rgba(4,3,3,.9)), url('${activeScene.image}')` }}>
      <header className="flex flex-wrap items-center gap-4 rounded-xl border border-[#765a2a] bg-[linear-gradient(100deg,#25170b,#090705_68%)] p-4 shadow-[inset_0_0_20px_#000]">
        <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-[#ad8341] bg-black/50">{portrait ? <img src={portrait} alt={character.name} className="h-full w-full object-cover object-[center_14%]" /> : <div className="flex h-full items-center justify-center font-serif text-4xl text-[#b78b45]">{character.name[0]}</div>}</div>
        <div><h3 className="font-serif text-3xl text-[#f2dfb7]">{character.name}</h3><p className="text-xs text-[#ac966d]">Level {character.level} {extra.race || "Human"} {character.class}</p><p className="mt-0.5 text-[10px] text-purple-300">{character.class === "Cleric" ? "Domain" : "Subclass"}: {extra.subclass || "Not recorded"}</p><p className="mt-1 text-[9px] uppercase tracking-wider text-[#76694f]">{extra.background || "Background not recorded"} · {extra.alignment || "Alignment not recorded"}</p></div>
        <div className="ml-auto min-w-52"><div className="flex justify-between text-[9px] uppercase text-[#887653]"><span>Experience</span><span>{character.xp} / {character.xp_to_next}</span></div><div className="mt-1 h-2 rounded bg-black"><div className="h-full rounded bg-[#aa2a34]" style={{ width: `${Math.min(100, character.xp / Math.max(1, character.xp_to_next) * 100)}%` }} /></div><div className="mt-2 flex gap-2"><button disabled title="Rest management is not connected to the dashboard database yet" className="rounded border border-[#604821] px-2 py-1 text-[9px] text-[#6f624b]">Short Rest</button><button disabled title="Rest management is not connected to the dashboard database yet" className="rounded border border-[#604821] px-2 py-1 text-[9px] text-[#6f624b]">Long Rest</button></div></div>
      </header>

      <section className="mt-3 flex items-center gap-3 rounded-lg border border-[#5d4521] bg-black/75 p-2 shadow-[0_8px_24px_#000] backdrop-blur-sm" aria-label="Character sheet scene options">
        <div className="px-2"><p className="font-serif text-[11px] uppercase tracking-[.14em] text-[#d7b56f]">Scene Options</p><p className="text-[8px] text-[#837354]">Character-sheet background</p></div>
        {sheetScenes.map((scene) => <button key={scene.id} type="button" aria-pressed={selectedScene === scene.id} onClick={() => setSelectedScene(scene.id)} className={cn("flex items-center gap-2 rounded border p-1.5 pr-3 text-left transition", selectedScene === scene.id ? "border-[#c59443] bg-[#2b1e0d] text-[#f1d59e]" : "border-[#4f3c1d] bg-[#100d09] text-[#9c8964]")}><img src={scene.image} alt="" className="h-9 w-16 rounded object-cover" /><span className="text-[9px] font-bold uppercase tracking-wider">{scene.label}</span></button>)}
      </section>

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

  // === REPLACE ART (2026-08-18) ===
  // The DM fixes artwork while looking at the thing that is wrong, rather than
  // hunting for the row in an admin panel. Gated on this browser holding the DM
  // key — the server re-checks it regardless, so this only hides a control that
  // would 403 anyway.
  //
  // Art is written at CATALOGUE level by /api/item-art, so replacing the dagger
  // icon fixes all five daggers across every character at once. That endpoint
  // creates the catalogue row when none exists, which is the whole point: 44 of
  // 53 inventory rows had no catalogue entry to upload against.
  const [dmUnlocked, setDmUnlocked] = useState(false)
  const [uploadingArtFor, setUploadingArtFor] = useState<string | null>(null)
  // Freshly uploaded art, keyed by item name, shown immediately. The database is
  // already updated; this only spares the DM a refresh to see it.
  const [artOverrides, setArtOverrides] = useState<Record<string, string>>({})
  const artInputRef = useRef<HTMLInputElement | null>(null)
  const pendingArtItem = useRef<InventoryItem | null>(null)

  useEffect(() => {
    // Read in an effect, never during render: localStorage does not exist on the
    // server and reading it inline would desync hydration.
    setDmUnlocked(hasDmKey())
    return onDmKeyChange(() => setDmUnlocked(hasDmKey()))
  }, [])

  const artKey = (name: string) => name.trim().toLowerCase()
  const artFor = (name: string, current?: string | null) => artOverrides[artKey(name)] ?? current ?? null

  const pickArtFor = (item: InventoryItem) => {
    pendingArtItem.current = item
    if (artInputRef.current) artInputRef.current.value = ""
    artInputRef.current?.click()
  }

  const uploadArt = async (file: File) => {
    const item = pendingArtItem.current
    pendingArtItem.current = null
    if (!item) return
    setUploadingArtFor(item.id)
    setMessage(`Uploading art for ${item.name}…`)
    try {
      const send = () => {
        const body = new FormData()
        body.append("file", file)
        body.append("inventoryItemId", item.id)
        body.append("name", item.name)
        return fetch("/api/item-art", { method: "POST", headers: dmHeaders(), body })
      }
      // A 403 means the stored code is stale. Drop it, ask once, retry — the same
      // recovery the DM asset tabs use.
      let res = await send()
      if (res.status === 403) {
        clearDmKey()
        if (ensureDmKey("replace item art") !== null) res = await send()
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Upload failed")
      setArtOverrides((current) => ({ ...current, [artKey(item.name)]: json.url as string }))
      setMessage(
        json.created
          ? `Art saved for ${item.name} — a catalogue entry was created, so every copy shows it.`
          : `Art replaced for ${item.name} — every copy updated.`,
      )
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setUploadingArtFor(null)
    }
  }
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
    {/* One shared picker for the whole panel — a per-row input would mount
        dozens of identical nodes. `pickArtFor` records which item is pending. */}
    <input
      ref={artInputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) void uploadArt(file)
      }}
    />
    <div className="grid min-h-[650px] gap-4 p-4 lg:grid-cols-[minmax(400px,1.05fr)_minmax(330px,.95fr)]">
      <section className="relative min-h-[610px] overflow-hidden rounded-xl border border-[#5e471f] bg-[radial-gradient(circle_at_50%_32%,#27302e,#0a0907_67%)]">
        <div className="absolute inset-x-[21%] bottom-4 top-8 overflow-hidden border-x border-[#4f3c1d] bg-black/20">{portrait ? <img src={portrait} alt={character.name} className="h-full w-full object-contain object-bottom" /> : <div className="flex h-full items-center justify-center font-serif text-8xl text-[#765a2b]">{character.name[0]}</div>}</div>
        {equipmentSlots.map((slot) => { const item = equippedAt(slot.id); const active = selectedSlot === slot.id; return <button key={slot.id} onClick={() => setSelectedSlot(active ? null : slot.id)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move" }} onDrop={(event) => { event.preventDefault(); const itemId = event.dataTransfer.getData("application/aop-inventory-item"); const dropped = inventory.find((entry) => entry.id === itemId); if (dropped) void equip(dropped, slot.id) }} className={cn("group absolute z-10 flex h-[68px] w-[68px] flex-col items-center justify-center overflow-hidden rounded-xl border-2 bg-[#0b0906]/95 p-1 shadow-[0_4px_14px_#000] transition", slot.position, active ? "border-[#e1b75e] ring-2 ring-[#dba64255]" : item ? "border-emerald-700/80" : "border-dashed border-[#75572b] hover:border-[#c99a49]", busySlot === slot.id && "animate-pulse")} title={item ? `${slot.label}: ${item.name}` : slot.label}>{item ? <ItemIcon iconUrl={artFor(item.name, item.icon_url)} name={item.name} itemType={(item as { item_type?: string | null }).item_type} className="h-10 w-10" /> : <img src={slot.icon} alt={slot.label} className="h-12 w-12 rounded object-contain opacity-85 transition group-hover:opacity-100" />}<span className="max-w-full truncate text-[7px] uppercase tracking-wide text-[#c7ae7d]">{item?.name || slot.label}</span></button> })}
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap gap-1">{Object.entries(bonuses).length ? Object.entries(bonuses).map(([key, value]) => <span key={key} className="rounded-full border border-emerald-800 bg-emerald-950/80 px-2 py-1 text-[8px] uppercase text-emerald-300">{key} {signed(value)}</span>) : <span className="rounded border border-[#4d3a1d] bg-black/70 px-2 py-1 text-[8px] text-[#8e7b57]">No recorded equipment stat bonuses</span>}</div>
      </section>
      <section className="flex min-h-0 flex-col rounded-xl border border-[#5e471f] bg-[#0d0b07]">
        <div className="border-b border-[#49371c] p-3"><div className="flex items-center"><div><h3 className="font-serif text-sm uppercase tracking-[.14em] text-[#e0bf7c]">{selectedSlot ? `Eligible for ${equipmentSlots.find((slot) => slot.id === selectedSlot)?.label}` : "Basic Inventory"}</h3><p className="mt-1 text-[9px] text-[#817154]">{message}</p></div>{selectedSlot && <button onClick={() => setSelectedSlot(null)} className="ml-auto rounded border border-[#4f3b1d] px-2 py-1 text-[9px] text-[#aa9162]">Show all</button>}</div></div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">{eligible.length ? eligible.map((item) => { const slot = item.equippable_slot; const equipped = slot ? equippedAt(slot)?.name === item.name : false; return <article key={item.id} draggable={Boolean(slot)} onDragStart={(event) => { event.dataTransfer.setData("application/aop-inventory-item", item.id); event.dataTransfer.effectAllowed = "move" }} className={cn("flex items-center gap-3 rounded border p-2", slot ? "cursor-grab border-[#51401f] bg-[#171109] active:cursor-grabbing" : "border-[#2e281e] bg-[#100e0b] opacity-70")}><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-[#55411f] bg-black/50"><ItemIcon iconUrl={artFor(item.name, item.icon_url)} name={item.name} itemType={item.item_type} className="h-9 w-9" /></div><div className="min-w-0 flex-1"><h4 className="font-serif text-xs text-[#e1d0a8]">{item.name}</h4><p className="truncate text-[9px] text-[#817154]">{item.description || `${item.item_type} · ${item.weight} lb`}</p><span className="text-[8px] uppercase text-[#aa8b52]">{slot ? equipmentSlots.find((entry) => entry.id === slot)?.label : "Not equippable"}</span></div>{dmUnlocked && <button type="button" title={`Replace the artwork for ${item.name} — applies to every copy`} aria-label={`Replace artwork for ${item.name}`} disabled={uploadingArtFor === item.id} onClick={(event) => { event.stopPropagation(); pickArtFor(item) }} className="flex items-center rounded border border-[#4f3b1d] px-2 py-1 text-[9px] text-[#aa9162] hover:border-[#c99a49] hover:text-[#e0bf7c] disabled:opacity-50">{uploadingArtFor === item.id ? "Uploading…" : <ImagePlus className="h-3 w-3" />}</button>}{slot && <button disabled={equipped || busySlot === slot} onClick={() => void equip(item, slot)} className={cn("rounded border px-2 py-1 text-[9px]", equipped ? "border-emerald-700 bg-emerald-900/60 text-emerald-200" : "border-[#8a672d] text-[#d8b873] hover:bg-[#2a1e0d]")}>{equipped ? "Equipped" : "Equip"}</button>}</article> }) : <p className="p-8 text-center text-xs italic text-[#76694f]">No eligible inventory items for this slot.</p>}</div>
        {selectedSlot && equippedAt(selectedSlot) ? <button onClick={() => void unequip(selectedSlot)} className="m-3 rounded border border-red-900/70 bg-red-950/30 py-2 text-[10px] uppercase tracking-wider text-red-300">Unequip {equippedAt(selectedSlot)?.name}</button> : null}
      </section>
    </div>
  </ModalShell>
}

// One axis, five rungs. Colour carries the reading at a glance; the word is
// there because colour alone is not an accessible signal. Kept lowest-to-
// highest so the order is obvious to anyone editing it.
const DISPOSITIONS: Record<string, { label: string; ring: string; dot: string; text: string }> = {
  hostile: { label: "Hostile", ring: "border-[#8c2f2f] bg-[#2a0f0f]", dot: "bg-[#e0564f]", text: "text-[#f0a9a4]" },
  wary:    { label: "Wary",    ring: "border-[#8a6520] bg-[#241a08]", dot: "bg-[#dc9a33]", text: "text-[#f0cd8f]" },
  neutral: { label: "Neutral", ring: "border-[#5b5545] bg-[#1a1814]", dot: "bg-[#a49c86]", text: "text-[#cfc8b5]" },
  warm:    { label: "Warm",    ring: "border-[#3f7143] bg-[#0f1e11]", dot: "bg-[#5fbb69]", text: "text-[#a8dcae]" },
  devoted: { label: "Devoted", ring: "border-[#8a7220] bg-[#221c07]", dot: "bg-[#e8c74a]", text: "text-[#f5e2a0]" },
}

/** The DM's read on how an NPC feels about the party. Hidden from a browser
 *  that has claimed a character — players have to earn this, in fiction, and
 *  an NPC's private attitude is exactly the thing they should not be able to
 *  read off a dashboard. `null` means the DM AI has not formed a read yet. */
function DispositionChip({ value }: { value?: string | null }) {
  const key = (value ?? "").toLowerCase()
  const d = DISPOSITIONS[key]
  if (!d) {
    return <div className="rounded border border-[#3b3325] bg-[#141210] p-2 text-[10px]">
      <span className="block text-[8px] uppercase tracking-wider text-[#6d6450]">Disposition</span>
      <span className="text-[#7e7663]">Not yet read</span>
    </div>
  }
  return <div className={cn("rounded border p-2 text-[10px]", d.ring)} title={`This NPC's private attitude toward the party: ${d.label}. Visible to the DM only.`}>
    <span className="block text-[8px] uppercase tracking-wider text-[#847557]">Disposition · DM</span>
    <span className={cn("mt-0.5 flex items-center gap-1.5 font-serif", d.text)}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", d.dot)} />
      {d.label}
    </span>
  </div>
}

// TacticalOverlay (the decorative fake grid) removed 22 Aug 2026 —
// replaced by components/tactical/combat-board-3d.tsx, the real board.
const PHB2014_CLERIC_DOMAINS: Record<string, Array<{ level: number; spells: string[] }>> = {
  Knowledge: [{ level: 1, spells: ["Command", "Identify"] }, { level: 3, spells: ["Augury", "Suggestion"] }, { level: 5, spells: ["Nondetection", "Speak with Dead"] }, { level: 7, spells: ["Arcane Eye", "Confusion"] }, { level: 9, spells: ["Legend Lore", "Scrying"] }],
  Life: [{ level: 1, spells: ["Bless", "Cure Wounds"] }, { level: 3, spells: ["Lesser Restoration", "Spiritual Weapon"] }, { level: 5, spells: ["Beacon of Hope", "Revivify"] }, { level: 7, spells: ["Death Ward", "Guardian of Faith"] }, { level: 9, spells: ["Mass Cure Wounds", "Raise Dead"] }],
  Light: [{ level: 1, spells: ["Burning Hands", "Faerie Fire"] }, { level: 3, spells: ["Flaming Sphere", "Scorching Ray"] }, { level: 5, spells: ["Daylight", "Fireball"] }, { level: 7, spells: ["Guardian of Faith", "Wall of Fire"] }, { level: 9, spells: ["Flame Strike", "Scrying"] }],
  Nature: [{ level: 1, spells: ["Animal Friendship", "Speak with Animals"] }, { level: 3, spells: ["Barkskin", "Spike Growth"] }, { level: 5, spells: ["Plant Growth", "Wind Wall"] }, { level: 7, spells: ["Dominate Beast", "Grasping Vine"] }, { level: 9, spells: ["Insect Plague", "Tree Stride"] }],
  Tempest: [{ level: 1, spells: ["Fog Cloud", "Thunderwave"] }, { level: 3, spells: ["Gust of Wind", "Shatter"] }, { level: 5, spells: ["Call Lightning", "Sleet Storm"] }, { level: 7, spells: ["Control Water", "Ice Storm"] }, { level: 9, spells: ["Destructive Wave", "Insect Plague"] }],
  Trickery: [{ level: 1, spells: ["Charm Person", "Disguise Self"] }, { level: 3, spells: ["Mirror Image", "Pass without Trace"] }, { level: 5, spells: ["Blink", "Dispel Magic"] }, { level: 7, spells: ["Dimension Door", "Polymorph"] }, { level: 9, spells: ["Dominate Person", "Modify Memory"] }],
  War: [{ level: 1, spells: ["Divine Favor", "Shield of Faith"] }, { level: 3, spells: ["Magic Weapon", "Spiritual Weapon"] }, { level: 5, spells: ["Crusader's Mantle", "Spirit Guardians"] }, { level: 7, spells: ["Freedom of Movement", "Stoneskin"] }, { level: 9, spells: ["Flame Strike", "Hold Monster"] }],
}

// Samson's Book of Prayers art. The looping WebP animates on its own (~16s
// closed→open→closed loop) and cannot be play/pause controlled, so it is treated
// as a looping image. The poster PNG is the reduced-motion fallback.
const BOOK_OF_PRAYERS_MEDIA = {
  poster:
    "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/item-icons/book-of-prayers/samson-book-of-prayers-poster.png",
  animation:
    "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/item-icons/book-of-prayers/samson-book-of-prayers-open-close.webp",
} as const

function SpellbookModal({ character, onClose }: { character: Character; onClose: () => void }) {
  const [page, setPage] = useState(0)
  const [closing, setClosing] = useState(false)
  const [opened, setOpened] = useState(false)
  const extra = character as Character & { subclass?: string | null; sheet_spellcasting?: Record<string, unknown> | null }
  const spellcasting = extra.sheet_spellcasting ?? {}
  const names = (value: unknown): string[] => Array.isArray(value)
    ? value.map((entry) => typeof entry === "string" ? entry : entry && typeof entry === "object" && "name" in entry ? String((entry as { name: unknown }).name) : "").filter(Boolean)
    : []
  const cantrips = names(spellcasting.cantrips)
  const recordedDomainSpells = names(spellcasting.domain_spells ?? spellcasting.domainSpells)
  const prepared = names(spellcasting.prepared)
  const known = names(spellcasting.known ?? spellcasting.spellbook)
  const className = character.class.toLowerCase()
  const clericDomain = className === "cleric" ? Object.keys(PHB2014_CLERIC_DOMAINS).find((domain) => extra.subclass?.toLowerCase().includes(domain.toLowerCase())) : undefined
  const domainProgression = clericDomain ? PHB2014_CLERIC_DOMAINS[clericDomain] : []
  const gainedDomainSpells = domainProgression.filter((entry) => character.level >= entry.level).flatMap((entry) => entry.spells)
  const domainSpells = recordedDomainSpells.length ? recordedDomainSpells : gainedDomainSpells
  const ruleNote = className === "cleric" || className === "druid"
    ? "Prepared caster: choose prepared spells after a long rest. Domain or circle spells remain prepared when granted."
    : className === "wizard"
      ? "Spellbook caster: prepare spells from spells copied into this book after a long rest."
      : className === "paladin"
        ? "Prepared caster: choose prepared paladin spells after a long rest; oath spells remain prepared."
        : "Known-spell caster: spells change only when the class rules or a level increase permit it."

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 900)
  }
  // Escape closes from either the attract screen or the open page-spread.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") requestClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const maxPage = className === "cleric" ? 2 : 1

  // Divine casters carry a Book of Prayers rather than a grimoire. Only the
  // cover and spread art change — the 3D open, the page turn and the spell
  // lists rendered on top are identical. Art is the same Supabase pair recorded
  // on the book-of-prayers catalog item under properties.art.
  const isDivineCaster = className === "cleric" || className === "monk"
  const bookTitle = isDivineCaster ? "Book of Prayers" : "Book of Spells"
  // Divine casters get the animated Book of Prayers as an attract screen; a
  // click (or Escape/backdrop) advances into the existing page-spread UI.
  const showAttract = isDivineCaster && !opened

  // Live limits from class_spellcasting_progression (SRD 5.2.1 class tables),
  // carried on the sheet. The limit is a fixed number per class and level — it
  // is NOT the ability modifier, which was the 2014 rule.
  const asNumber = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : null)
  const preparedMax = asNumber(spellcasting.prepared_max)
  const cantripsMax = asNumber(spellcasting.cantrips_max)
  const swapCadence = typeof spellcasting.swap_cadence === "string" ? spellcasting.swap_cadence : null
  const cadenceLabel = swapCadence === "long_rest_any" ? "swap freely on a long rest"
    : swapCadence === "long_rest_one" ? "swap one on a long rest"
    : swapCadence === "level_up_one" ? "swaps only on level-up"
    : null
  const preparedNoun = isDivineCaster ? "Prayers prepared" : "Prepared"
  const bookArt = isDivineCaster
    ? ({
        "--aop-book-cover":
          "url('https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/item-icons/book-of-prayers/samson-book-of-prayers-closed-hd.png')",
        "--aop-book-spread":
          "url('https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/item-icons/book-of-prayers/samson-book-of-prayers-open-hd.png')",
      } as CSSProperties)
    : undefined

  return <div className={cn("aop-spellbook-backdrop fixed inset-0 z-[78] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm", closing && "is-closing")} role="dialog" aria-modal="true" aria-label={`${character.name}'s ${bookTitle}`} onMouseDown={(event) => { if (event.target !== event.currentTarget) return; if (showAttract) setOpened(true); else requestClose() }}>
    {showAttract ? (
      <button type="button" onClick={() => setOpened(true)} className="group flex flex-col items-center gap-6 focus:outline-none" aria-label={`Open ${bookTitle}`}>
        <img src={BOOK_OF_PRAYERS_MEDIA.animation} alt="" aria-hidden className="h-[400px] w-[400px] max-w-[80vw] max-h-[70vh] object-contain drop-shadow-[0_20px_60px_rgba(0,0,0,0.85)] motion-reduce:hidden" />
        <img src={BOOK_OF_PRAYERS_MEDIA.poster} alt="" aria-hidden className="hidden h-[400px] w-[400px] max-w-[80vw] max-h-[70vh] object-contain drop-shadow-[0_20px_60px_rgba(0,0,0,0.85)] motion-reduce:block" />
        <span className="animate-pulse font-serif text-sm uppercase tracking-[.3em] text-[#d3ae6b]/70 transition-colors group-hover:text-[#f0d9aa] motion-reduce:animate-none">Open the book</span>
      </button>
    ) : (
    <section style={bookArt} className={cn("aop-arcane-stage relative w-full max-w-5xl", closing ? "is-closing" : "is-opening")}>
      <div className="aop-arcane-book">
        <div className="aop-spellbook-cover" aria-hidden />
        <div key={page} className="aop-spellbook-spread">
          <div className="aop-spell-page">
            <span className="aop-rune-ring" aria-hidden>ᚨ ᚱ ᚲ ᚨ ᚾ ᚨ</span>
            <header><BookOpen className="mx-auto h-7 w-7" /><h2>{character.name}&apos;s {bookTitle}</h2><p>Level {character.level} {character.class} · {character.class === "Cleric" ? "Domain" : "Subclass"}: {extra.subclass || "Not recorded"}</p></header>
            {(preparedMax !== null || cantripsMax !== null) && (
              <p className="-mt-2 mb-3 text-center text-[11px] text-[#6b4a2e]">
                {cantripsMax !== null && <>Cantrips {cantrips.length} / {cantripsMax}</>}
                {cantripsMax !== null && preparedMax !== null && " · "}
                {preparedMax !== null && (
                  <span className={cn(prepared.length > preparedMax && "font-semibold text-[#8f2f2f]")}>
                    {preparedNoun} {prepared.length} / {preparedMax}
                  </span>
                )}
                {cadenceLabel && <><br /><em>{cadenceLabel}</em></>}
              </p>
            )}
            {page === 0 ? <SpellList title="Cantrips" spells={cantrips} empty="No cantrips recorded." /> : page === 1 ? <SpellList title="Prepared / Memorized" spells={prepared} empty="No prepared spells recorded." /> : <DomainIndex selected={clericDomain} />}
          </div>
          <div className="aop-spell-page">
            <button type="button" onClick={requestClose} className="absolute right-5 top-4 z-10 text-[#6b3e25] hover:text-black" aria-label={`Close ${bookTitle}`}><X className="h-5 w-5" /></button>
            <p className="mb-4 rounded border border-[#7f5d3c]/45 bg-[#7d5223]/10 p-3 text-xs leading-relaxed">D&amp;D 5E: {ruleNote}</p>
            {page === 0 ? <SpellList title={character.class === "Cleric" ? "Domain Spells · Always Prepared" : "Subclass Spells"} spells={domainSpells} empty={className === "cleric" ? "Choose and record a Player's Handbook domain in The Forge." : "No subclass spells recorded."} /> : page === 1 ? <SpellList title={className === "wizard" ? "Spellbook" : "Known / Available"} spells={known} empty="No known spell records attached." /> : <DomainProgression domain={clericDomain} progression={domainProgression} />}
            <p className="absolute bottom-12 left-8 right-8 text-center text-[10px] italic text-[#725038]">Counts and swap timing follow the 2024 class tables (SRD 5.2.1). The domain list is from the 2014 Player&apos;s Handbook. Only recorded choices are shown.</p>
          </div>
        </div>
      </div>
      <div className="aop-page-controls"><button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>← Previous</button><span>Leaves {page + 1} / {maxPage + 1}</span><button type="button" disabled={page === maxPage} onClick={() => setPage((current) => Math.min(maxPage, current + 1))}>Next →</button></div>
      <a href="/forge" className="aop-spellbook-forge">Manage recorded spells in The Forge</a>
    </section>
    )}
  </div>
}

function SpellList({ title, spells, empty }: { title: string; spells: string[]; empty: string }) {
  return <section className="overflow-hidden rounded border border-[#76502e]/55 bg-[#8c5d27]/5"><h3 className="border-b border-[#76502e]/45 px-3 py-2 font-serif text-xs uppercase tracking-wider text-[#653a24]">{title}</h3>{spells.length ? <ul className="divide-y divide-[#76502e]/25">{spells.map((spell) => <li key={spell} className="px-3 py-2 font-serif text-sm text-[#40271a]">✧ {spell}</li>)}</ul> : <p className="p-4 text-xs italic text-[#77604a]">{empty}</p>}</section>
}

function DomainIndex({ selected }: { selected?: string }) {
  return <section><h3 className="mb-3 text-center font-serif text-lg text-[#53301e]">Player&apos;s Handbook Domains</h3><div className="grid grid-cols-2 gap-2">{Object.keys(PHB2014_CLERIC_DOMAINS).map((domain) => <div key={domain} className={cn("rounded border px-3 py-2 text-center font-serif", selected === domain ? "border-[#935f24] bg-amber-900/15 font-bold" : "border-[#846344]/35")}>{domain}</div>)}</div></section>
}

function DomainProgression({ domain, progression }: { domain?: string; progression: Array<{ level: number; spells: string[] }> }) {
  return <section><h3 className="mb-3 text-center font-serif text-lg text-[#53301e]">{domain ? `${domain} Domain` : "Select a Domain in The Forge"}</h3>{progression.length ? progression.map((entry) => <div key={entry.level} className="flex border-b border-[#76502e]/30 py-2 text-sm"><b>Cleric {entry.level}</b><span className="ml-auto text-right">{entry.spells.join(" · ")}</span></div>) : <p className="text-center text-sm italic text-[#765941]">No domain is recorded, so no domain spell list has been assigned.</p>}</section>
}

type StatKind = "ac" | "initiative" | "proficiency" | "speed"

const abilityNames: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" }

function AbilityScoreCard({ ability, onClick, sheet = false }: { ability: { key: string; score: number; mod: number }; onClick?: () => void; sheet?: boolean }) {
  const order = ["str", "dex", "con", "int", "wis", "cha"]
  const index = Math.max(0, order.indexOf(ability.key.toLowerCase()))
  const x = index === 0 ? "0%" : index === 5 ? "100%" : `${index * 20}%`
  const name = abilityNames[ability.key.toLowerCase()] ?? ability.key
  // In the six-up rail each card is only ~45px wide, so the full ability name
  // cannot fit and was being cut mid-word ("CONSTITUTE", "INTELLIGENC").
  // The rail shows the standard 5E abbreviation; the wide two-column sheet has
  // room for the full name. Either way the full name is on hover and in the
  // native tooltip, so nothing is lost.
  const label = sheet ? name : ability.key.toUpperCase()
  return <button type="button" onClick={onClick} className={cn("group relative min-w-0 overflow-hidden rounded-sm border border-[#5e481f] bg-[#090807] shadow-[0_3px_7px_#000] transition-[transform,border-color,box-shadow] duration-200 delay-0 hover:z-20 hover:border-[#d8ad5c] hover:shadow-[0_8px_24px_#000,0_0_14px_#b7833844] hover:delay-500 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d7b369]", sheet ? "h-[190px] hover:scale-110 focus-visible:scale-110" : "h-[132px] hover:scale-125 focus-visible:scale-125")} title={`${name}: ${ability.score} (${ability.mod >= 0 ? "+" : ""}${ability.mod})`}>
    <span className="absolute inset-0 block bg-[url('/images/ui/ability-score-icons.png')] bg-[length:600%_auto] bg-no-repeat" style={{ backgroundPosition: `${x} 3%` }} />
    <span className="absolute inset-x-0 top-2 z-10 bg-black/0 px-0.5 py-1 text-center font-serif text-[6px] font-bold uppercase tracking-[.04em] text-[#d3ae6b]/0 transition-[color,background-color,text-shadow] duration-200 delay-0 group-hover:bg-black/80 group-hover:text-[#ffe4a8] group-hover:[text-shadow:0_0_7px_#d79b3a] group-hover:delay-500">{name}</span>
    <span className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/92 to-transparent", sheet ? "h-11" : "h-[52px]")} />
    <span className={cn("absolute inset-x-0 text-center font-serif leading-none text-[#f0d9aa] drop-shadow-[0_1px_2px_#000]", sheet ? "bottom-[19px] text-[15px]" : "bottom-[25px] text-[17px]")}>{ability.score}</span>
    <span className={cn("absolute inset-x-0 text-center font-serif leading-none text-[#d7ab62]", sheet ? "bottom-[8px] text-[9px]" : "bottom-[13px] text-[10px]")}>{ability.mod >= 0 ? "+" : ""}{ability.mod}</span>
    <span className={cn("absolute inset-x-0 truncate text-center font-bold uppercase text-[#bfa36d]", sheet ? "bottom-0 px-0.5 text-[5px] tracking-[.05em]" : "bottom-[3px] px-0.5 text-[7px] tracking-[.12em]")}>{label}</span>
  </button>
}

function StatShield({ kind, label, value, onClick, tooltip }: { kind: StatKind; label: string; value: string; onClick: () => void; tooltip?: string }) {
  const spritePosition: Record<StatKind, string> = {
    ac: "0% 40%",
    speed: "33.333% 40%",
    initiative: "66.666% 40%",
    proficiency: "100% 40%",
  }
  return <button type="button" onClick={onClick} className="group relative flex h-[82px] min-w-0 flex-col items-center justify-end rounded border border-transparent pb-0.5 transition hover:-translate-y-0.5 hover:border-[#8c6b32] hover:bg-[#21180b]/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d7b369]" title={tooltip ?? `Open ${label} details`}>
    <span className="absolute inset-x-1 top-0 h-[66px] overflow-hidden drop-shadow-[0_4px_5px_#000]" style={{ clipPath: "polygon(50% 0, 94% 14%, 91% 72%, 78% 90%, 50% 100%, 22% 90%, 9% 72%, 6% 14%)" }}>
      <span className="block h-full w-full scale-[1.12] bg-[url('/images/ui/character-stat-shields.png')] bg-[length:400%_auto] bg-no-repeat" style={{ backgroundPosition: spritePosition[kind] }} />
    </span>
    <b className="absolute bottom-[14px] z-10 rounded-full border border-[#c49b4f] bg-[#080604]/90 px-1.5 py-0.5 font-serif text-[9px] leading-none text-[#f3dfb4] shadow-[0_1px_5px_#000]">{value}</b>
    <span className="relative z-10 max-w-full truncate px-0.5 text-[6px] font-bold uppercase tracking-[.08em] text-[#cdb276]">{label}</span>
  </button>
}

function StatDetailModal({ kind, character, acBreakdown, onClose }: { kind: StatKind; character?: Character; acBreakdown?: string; onClose: () => void }) {
  // Pull the derived total straight out of the breakdown ("… = 13") so this
  // modal shows the same computed AC as the shield, never the stale stored value.
  const derivedAc = acBreakdown ? acBreakdown.split("=").pop()?.trim() ?? String(character?.ac ?? 10) : String(character?.ac ?? 10)
  const content: Record<StatKind, { title: string; summary: string; rows: Array<[string, string]> }> = {
    ac: { title: "Armor Class", summary: "How difficult this hero is to hit. The visible total is derived from equipped armor and ability modifiers, never a hand-entered number.", rows: [["Current AC", derivedAc], ["Breakdown", acBreakdown ?? `10 + ${signed(character?.dex_modifier ?? 0)} DEX`], ["Dexterity modifier", signed(character?.dex_modifier ?? 0)], ["When attacked", "Enemy roll must meet or exceed AC"]] },
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
