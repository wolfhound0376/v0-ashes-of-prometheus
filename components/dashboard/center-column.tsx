"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { quickAbilities, getClassSpellcasting } from "@/lib/game-data"
import {
  SpellbookIcon,
  AbilityIcon,
  DashIcon,
  DisengageIcon,
  HelpIcon,
  ReadyIcon,
  SearchIcon,
  RitualIcon,
  MageHandIcon,
  FireBoltIcon,
  ShieldSpellIcon,
  MagicMissileIcon,
  DetectMagicIcon,
  LockedAbilityIcon,
  IconFrame,
} from "@/components/ui/fantasy-icons"
import { BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { DiceRoller } from "./dice-roller"
import { ReactionsPanel } from "./reactions-panel"
import { ConditionBadges } from "@/components/conditions/condition-badges"
import { createClient } from "@/lib/supabase/client"

interface Action {
  id: string
  name: string
  description: string
  icon: string
  iconUrl?: string | null
  type: "action" | "bonus" | "reaction"
  hasSubmenu?: boolean
}

// Cunning Action sub-options (D&D 5E: Rogues can Dash, Disengage, or Hide as a bonus action)
const cunningActionOptions = [
  { id: "cunning-dash", name: "Dash", description: "Double movement as bonus action", iconUrl: "/icons/actions/dash.png" },
  { id: "cunning-disengage", name: "Disengage", description: "Avoid opportunity attacks", iconUrl: "/icons/actions/disengage.png" },
  { id: "cunning-hide", name: "Hide", description: "Make a Stealth check to hide", iconUrl: "/icons/actions/hide.png" },
]

interface Resources {
  action: number
  bonusAction: number
  reaction: number
  spellSlots: number
  maxSpellSlots: number
  sorceryPoints: number
  maxSorceryPoints: number
  arcaneCharges: number
  maxArcaneCharges: number
}

interface NpcEncounter {
  id: string
  name: string
  aliases?: string[] | null
  description: string | null
  portrait_url: string | null
  // Optional dedicated face close-up. When present it is used for the featured
  // "active speaker" view instead of cropping the full-body portrait_url.
  face_url?: string | null
  // Optional looping face videos for the animated talking-head. idle_url plays
  // while the NPC is silent (blinking/breathing); talking_url plays while TTS
  // audio is playing (lips moving). Both are muted, looped, object-cover.
  idle_url?: string | null
  talking_url?: string | null
  // Per-NPC voice. voice_id is a resolved ElevenLabs voice id; voice_description
  // is the free-text description used to resolve one when voice_id is unset.
  voice_id?: string | null
  voice_description?: string | null
  is_active: boolean
  hp_current?: number | null
  hp_max?: number | null
  // Active conditions (jsonb string[]) affecting this NPC.
  conditions?: string[] | null
  // Optional social state. These columns may or may not exist on the table; the
  // roster fetch below is defensive so a missing column never breaks the query.
  // When absent, the featured window renders no disposition/attitude rows.
  disposition?: string | null
  attitude?: string | null
}

interface PersistedSpeechSegment {
  speaker: string
  line: string
  npc_id: string | null
  voice_id: string | null
}

interface DialogueEntry {
  id?: string
  speaker: string
  text: string
  speech_segments?: PersistedSpeechSegment[] | null
}

interface CenterColumnProps {
  selectedAction: string | null
  onActionSelect: (actionId: string) => void
  actions: Action[]
  resources: Resources
  characterClass?: string
  characterLevel?: number
  characterName?: string
  availableActionIds?: string[]
  onTelemetryPush?: (actionType: string, intent: string, roll?: number) => void
  onSendToLich?: (message: string) => void
  sceneImageUrl?: string
  npcEncounters?: NpcEncounter[]
  dialogue?: DialogueEntry[]
}

// The DM / narrator speaks under this name in the dialogue log.
const DM_SPEAKER = "Malachar"

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Index of the first word-boundary occurrence of `needle` in `text`, or -1.
function findNameIndex(text: string, needle: string): number {
  if (!needle) return -1
  const m = new RegExp(`\\b${escapeRegExp(needle)}\\b`).exec(text)
  return m ? m.index : -1
}

export interface SpeakerSegment {
  npcId: string | null   // null = pure narration
  line: string           // the spoken text (quotes stripped) for TTS
  raw: string            // the full slice, for captions
  voiceId?: string | null // server-persisted voice for this resolved NPC row
}

// Describes-but-never-names fallbacks. Attribution by name fails for NPCs the
// DM refers to obliquely ("the glowing mushroom-creature"), so match on
// distinguishing words too. Keys are matched case-insensitively against the
// NARRATION around a quote, never against the quote itself.
const NPC_ALIASES: Record<string, RegExp> = {
  Stool: /myconid|mushroom[- ]creature|fungal (?:child|sprout)|glowing (?:cap|fungus)/i,
  Eldeth: /dwarf(?: woman)?|shield dwarf/i,
  Jimjar: /deep gnome|gnome|svirfneblin/i,
  Ront: /\borc\b/i,
  Derendil: /quaggoth/i,
  Shuushar: /kuo-toa|fish[- ]like/i,
  Sarith: /drow soldier/i,
}

/**
 * Split a DM message into ordered speaker segments.
 *
 * Attribution priority for each quote, strongest first:
 *   1. A name or alias in the NARRATION immediately BEFORE the quote
 *      ("The dwarf woman doesn't look over, but she speaks. \"...\"")
 *   2. A name or alias in the narration immediately AFTER the quote
 *      ("\"...\" He rattles his manacles.")
 *   3. The previous quote's speaker — consecutive quotes with no intervening
 *      attribution belong to whoever spoke last.
 *   4. Names appearing INSIDE the quote — weakest, and only when nothing else
 *      resolved. This is the rule whose absence caused the bug.
 */
export function segmentBySpeaker(text: string, roster: NpcEncounter[]): SpeakerSegment[] {
  if (!text) return []

  // Pair up quotes: odd-indexed quote chars close, even-indexed open.
  const quoteRe = /["“”„]/g
  const positions: number[] = []
  let m: RegExpExecArray | null
  while ((m = quoteRe.exec(text)) !== null) positions.push(m.index)
  if (positions.length < 2) return []

  const quotes: Array<{ start: number; end: number }> = []
  for (let i = 0; i + 1 < positions.length; i += 2) {
    quotes.push({ start: positions[i], end: positions[i + 1] })
  }

  const matchIn = (window: string): string | null => {
    if (!window.trim()) return null
    let best: { id: string; idx: number } | null = null
    for (const npc of roster) {
      if (!npc.name) continue
      const canonicalFirst = npc.name.trim().split(/\s+/)[0]
      const names = [npc.name, ...(Array.isArray(npc.aliases) ? npc.aliases : [])]
      let idx = -1
      for (const name of names) {
        const exactIdx = findNameIndex(window, name)
        const first = name.trim().split(/\s+/)[0]
        const firstIdx = first && first.length >= 3 ? findNameIndex(window, first) : -1
        idx = Math.max(idx, exactIdx, firstIdx)
      }
      if (idx === -1) {
        const alias = NPC_ALIASES[canonicalFirst]
        if (alias) {
          const am = window.match(alias)
          if (am && am.index !== undefined) idx = am.index
        }
      }
      // Latest match wins in the "before" window (closest to the quote).
      if (idx !== -1 && (!best || idx > best.idx)) best = { id: npc.id, idx }
    }
    return best?.id ?? null
  }

  // A leading parenthetical or dash-delimited phrase after a closing quote is
  // descriptive prose, not speaker attribution. Remove only that leading aside
  // before applying the weaker post-quote name rule.
  const withoutLeadingAside = (window: string): string => {
    const trimmed = window.trimStart()
    if (trimmed.startsWith("(")) {
      const close = trimmed.indexOf(")")
      if (close !== -1) return trimmed.slice(close + 1)
    }
    if (/^[—–-]/.test(trimmed)) {
      const close = trimmed.slice(1).search(/[—–-]/)
      if (close !== -1) return trimmed.slice(close + 2)
      return ""
    }
    return window
  }

  const segments: SpeakerSegment[] = []
  let previousSpeaker: string | null = null

  quotes.forEach((q, i) => {
    const prevEnd = i === 0 ? 0 : quotes[i - 1].end + 1
    const before = text.slice(prevEnd, q.start)
    const after = text.slice(q.end + 1, quotes[i + 1]?.start ?? text.length)
    const inside = text.slice(q.start + 1, q.end)

    const speaker =
      matchIn(before) ??
      matchIn(withoutLeadingAside(after)) ??
      (before.trim().length < 3 ? previousSpeaker : null) ??
      matchIn(inside)

    if (speaker) previousSpeaker = speaker
    segments.push({ npcId: speaker, line: inside.trim(), raw: inside.trim() })
  })

  // Merge consecutive segments from the same speaker so one NPC saying two
  // sentences in a row is a single beat, not two portrait flashes.
  const merged: SpeakerSegment[] = []
  for (const seg of segments) {
    const last = merged[merged.length - 1]
    if (last && last.npcId === seg.npcId) {
      last.line = `${last.line} ${seg.line}`.trim()
      last.raw = `${last.raw} ${seg.raw}`.trim()
    } else {
      merged.push({ ...seg })
    }
  }
  return merged.filter((s) => s.npcId && s.line)
}

// All word-boundary indices where any name token (full name + first-name token,
// >=3 chars) appears in the text. Used to attribute a quote to a speaker.
function allNameIndices(text: string, name: string | undefined | null): number[] {
  if (!name) return []
  const tokens = [name.trim()]
  const first = name.trim().split(/\s+/)[0]
  if (first && first.length >= 3 && first !== name.trim()) tokens.push(first)
  const indices: number[] = []
  for (const tok of tokens) {
    const re = new RegExp(`\\b${escapeRegExp(tok)}\\b`, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) indices.push(m.index)
  }
  return indices
}

// Minimal on-screen caption derived from the spoken line. The dialogue log
// already shows the full text, so the featured panel only teases the opening
// words followed by an ellipsis (keeps the portrait uncluttered).
function captionPreview(speech: string | null, wordCount = 4): string | null {
  if (!speech) return null
  const words = speech.trim().split(/\s+/)
  if (words.length <= wordCount) return speech.trim()
  return words.slice(0, wordCount).join(" ") + "…"
}

const actionIconMap: Record<string, React.FC<{ className?: string }>> = {
  "cast-spell": SpellbookIcon,
  "use-ability": AbilityIcon,
  dash: DashIcon,
  disengage: DisengageIcon,
  help: HelpIcon,
  ready: ReadyIcon,
  search: SearchIcon,
  "cast-ritual": RitualIcon,
}

const quickAbilityIconMap: Record<string, React.FC<{ className?: string }>> = {
  "mage-hand": MageHandIcon,
  "fire-bolt": FireBoltIcon,
  shield: ShieldSpellIcon,
  "magic-missile": MagicMissileIcon,
  "detect-magic": DetectMagicIcon,
  locked: LockedAbilityIcon,
}

// Action type color configuration matching D&D 5E conventions
const actionTypeColors = {
  action: {
    border: "border-[#4a8a4a]/60",
    bg: "bg-[#1a2a1a]/40",
    text: "text-[#7ac87a]",
    label: "Action",
    labelBg: "bg-[#2a4a2a]",
  },
  bonus: {
    border: "border-[#8a7a3a]/60",
    bg: "bg-[#2a2a1a]/40",
    text: "text-[#d4b454]",
    label: "Bonus",
    labelBg: "bg-[#4a4a2a]",
  },
  reaction: {
    border: "border-[#7a4a8a]/60",
    bg: "bg-[#2a1a2a]/40",
    text: "text-[#b87ac8]",
    label: "Reaction",
    labelBg: "bg-[#3a2a4a]",
  },
}

type ActionTab = "action" | "bonus" | "reaction"

export function CenterColumn({ selectedAction, onActionSelect, actions, resources, characterClass, characterLevel, characterName, onSendToLich, sceneImageUrl, npcEncounters = [], dialogue = [] }: CenterColumnProps) {
  // Filter active encounters for the tile strip, but attribution uses a separate
  // one-time fetch of the FULL roster so inactive NPCs remain resolvable.
  const activeEncounters = npcEncounters.filter(e => e.is_active)
  const supabase = useMemo(() => createClient(), [])
  const [fullNpcRoster, setFullNpcRoster] = useState<NpcEncounter[]>([])
  const [persistedSegments, setPersistedSegments] = useState<PersistedSpeechSegment[] | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const BASE_COLS =
      "id, name, aliases, description, portrait_url, face_url, idle_url, talking_url, voice_id, voice_description, is_active, hp_current, hp_max, conditions"
    // Prefer selecting the optional social columns. If they don't exist on the
    // table, Postgres errors — so retry with the base column list. Either way
    // the roster loads; disposition/attitude simply stay undefined when absent.
    ;(async () => {
      let { data, error } = await supabase
        .from("npc_encounters")
        .select(`${BASE_COLS}, disposition, attitude`)
      if (error) {
        ;({ data } = await supabase.from("npc_encounters").select(BASE_COLS))
      }
      if (!cancelled) setFullNpcRoster((data as NpcEncounter[] | null) || [])
    })()
    return () => { cancelled = true }
  }, [supabase])

  const lastDialogue = dialogue[dialogue.length - 1]
  useEffect(() => {
    let cancelled = false
    if (!lastDialogue || lastDialogue.speaker !== DM_SPEAKER) {
      setPersistedSegments(undefined)
      return () => { cancelled = true }
    }
    if (lastDialogue.speech_segments !== undefined) {
      setPersistedSegments(lastDialogue.speech_segments)
      return () => { cancelled = true }
    }

    // The parent keeps a lightweight dialogue shape. Read the just-inserted DM
    // row so its persisted server attribution is available before any TTS plays.
    setPersistedSegments(undefined)
    supabase
      .from("dialogue")
      .select("speech_segments")
      .eq("speaker", DM_SPEAKER)
      .eq("text", lastDialogue.text)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: { speech_segments?: PersistedSpeechSegment[] | null } | null }) => {
        if (!cancelled) setPersistedSegments(data?.speech_segments ?? null)
      })
    return () => { cancelled = true }
  }, [lastDialogue, supabase])

  // Server segments are authoritative. Only a persisted null (old row or failed
  // model pass) enables the regex fallback; undefined means the DB read is still
  // pending, so no potentially misattributed voice is allowed to start.
  const segments = useMemo(() => {
    if (!lastDialogue || lastDialogue.speaker !== DM_SPEAKER) return []
    if (Array.isArray(persistedSegments)) {
      return persistedSegments
        .filter((segment) => segment.npc_id && segment.line)
        .map((segment) => ({
          npcId: segment.npc_id,
          line: segment.line,
          raw: segment.line,
          voiceId: segment.voice_id,
        }))
    }
    if (persistedSegments === null) {
      return segmentBySpeaker(lastDialogue.text, fullNpcRoster)
    }
    return []
  }, [lastDialogue, persistedSegments, fullNpcRoster])

  const [segIndex, setSegIndex] = useState(0)

  // Reset to the first beat whenever a new DM message arrives (segments change).
  useEffect(() => { setSegIndex(0) }, [segments])

  const current = segments[segIndex] ?? null
  const activeSpeakerId = current?.npcId ?? null
  const activeLine = current?.line ?? null
  const activeCaption = captionPreview(activeLine)

  // Safety timer: if a beat is featured but never reports completion (TTS can
  // fail silently, or be muted), advance anyway so the sequence never stalls.
  useEffect(() => {
    if (!current || segments.length <= 1) return
    if (segIndex >= segments.length - 1) return
    const ms = Math.max(3000, (activeLine?.length ?? 0) * 55)
    const t = setTimeout(() => {
      setSegIndex(i => Math.min(i + 1, segments.length - 1))
    }, ms)
    return () => clearTimeout(t)
  }, [current, segIndex, segments.length, activeLine])

  const activeSpeaker = activeSpeakerId
    ? fullNpcRoster.find(n => n.id === activeSpeakerId) ?? npcEncounters.find(n => n.id === activeSpeakerId) ?? null
    : null
  // Remaining active encounters shown dimmed/shrunk beneath the featured speaker.
  const otherEncounters = activeSpeaker
    ? activeEncounters.filter(e => e.id !== activeSpeaker.id)
    : activeEncounters
  
  // Check if character can cast spells based on D&D 5E rules
  const spellcasting = getClassSpellcasting(characterClass || "", characterLevel || 1)
  
  // Action type tab state
  const [activeTab, setActiveTab] = useState<ActionTab>("action")
  
  // Filter actions by current tab (reactions always visible)
  const filteredActions = actions.filter(a => a.type === activeTab)
  const reactionActions = actions.filter(a => a.type === "reaction")
  
  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      <FantasyPanel title="NPC / Monster Interactions" className="flex-shrink-0">
        <div className={`relative overflow-hidden rounded-sm transition-[height] duration-300 ease-in-out ${activeSpeaker ? "h-[46vh] min-h-[380px]" : "h-[260px]"}`}>
          <CombatFxKeyframes />
          {activeSpeaker ? (
            <div className="h-full flex flex-col gap-2 p-2">
              <FeaturedSpeaker
                speaker={activeSpeaker}
                line={activeLine}
                voiceId={current?.voiceId ?? activeSpeaker.voice_id ?? null}
                caption={activeCaption}
                hasOthers={otherEncounters.length > 0}
                onLineComplete={() => setSegIndex(i => Math.min(i + 1, segments.length - 1))}
              />
              {otherEncounters.length > 0 && (
                <div className="flex gap-2 overflow-x-auto flex-shrink-0 h-[64px] opacity-60">
                  {otherEncounters.map((encounter) => (
                    <NpcEncounterCard key={encounter.id} encounter={encounter} solo={false} compact />
                  ))}
                </div>
              )}
            </div>
          ) : activeEncounters.length > 0 ? (
            <div className="h-full flex gap-2 p-2 overflow-x-auto">
              {activeEncounters.map((encounter) => (
                <NpcEncounterCard
                  key={encounter.id}
                  encounter={encounter}
                  solo={activeEncounters.length === 1}
                />
              ))}
            </div>
          ) : sceneImageUrl ? (
            <>
              <img
                src={sceneImageUrl}
                alt="NPC or monster encountered"
                className="absolute inset-0 w-full h-full object-cover object-top opacity-70"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a1614] via-transparent to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1614] via-[#2a2018] to-[#1a1614]" />
          )}
          {!activeSpeaker && activeEncounters.length === 0 && (
            <div className="relative h-full flex items-end justify-center p-3">
              <p className="text-stone-400 italic text-sm drop-shadow-lg">
                {sceneImageUrl ? "" : "No one is interacting with you right now."}
              </p>
            </div>
          )}
        </div>
      </FantasyPanel>

      {/* Available Actions */}
      <FantasyPanel className="flex-1 min-h-0 flex flex-col">
        {/* Tab Header */}
        <div className="px-2 py-2 border-b border-[#3d3428]/60">
          <div className="flex gap-1">
            {/* Action Tab */}
            <button
              onClick={() => setActiveTab("action")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-all",
                activeTab === "action"
                  ? "bg-[#2a4a2a] text-[#7ac87a] border border-[#4a8a4a]/60"
                  : "text-stone-500 hover:text-stone-300 hover:bg-[#2a2420]/40"
              )}
            >
              <span>Actions</span>
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px]",
                activeTab === "action" ? "bg-[#4a8a4a]/40" : "bg-[#3d3428]/60"
              )}>
                {resources.action}
              </span>
            </button>
            
            {/* Bonus Action Tab */}
            <button
              onClick={() => setActiveTab("bonus")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-all",
                activeTab === "bonus"
                  ? "bg-[#4a4a2a] text-[#d4b454] border border-[#8a7a3a]/60"
                  : "text-stone-500 hover:text-stone-300 hover:bg-[#2a2420]/40"
              )}
            >
              <span>Bonus</span>
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px]",
                activeTab === "bonus" ? "bg-[#8a7a3a]/40" : "bg-[#3d3428]/60"
              )}>
                {resources.bonusAction}
              </span>
            </button>
          </div>
        </div>

        {/* Actions List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredActions.length > 0 ? (
            <div className="space-y-1">
              {filteredActions.map((action) => (
                <ActionButton key={action.id} action={action} isSelected={selectedAction === action.id} onSelect={onActionSelect} />
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-stone-500 text-sm italic">
              No {activeTab === "action" ? "actions" : "bonus actions"} available
            </div>
          )}
        </div>

        {/* Reactions - Always visible at bottom */}
        {reactionActions.length > 0 && (
          <div className="border-t border-[#3d3428]/40 p-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn("text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded", actionTypeColors.reaction.labelBg, actionTypeColors.reaction.text)}>
                Reactions
              </span>
              <span className="w-4 h-4 rounded-full bg-[#3a2a4a] flex items-center justify-center text-[10px] text-[#b87ac8]">
                {resources.reaction}
              </span>
              <div className="flex-1 h-px bg-[#7a4a8a]/30" />
            </div>
            <div className="space-y-1">
              {reactionActions.map((action) => (
                <ActionButton key={action.id} action={action} isSelected={selectedAction === action.id} onSelect={onActionSelect} />
              ))}
            </div>
          </div>
        )}
      </FantasyPanel>

      {/* Magical Resources - Only show for spellcasting classes */}
      {spellcasting.canCast && (
        <FantasyPanel title="Magical Resources & Abilities" className="flex-shrink-0">
          <div className="p-3">
            <div className="flex gap-2">
              {/* Spell Slots - for all casters */}
              <ResourceBox
                label="Spell Slots"
                current={resources.spellSlots}
                max={resources.maxSpellSlots}
                color="purple"
              />
              {/* Sorcery Points - only for Sorcerers */}
              {spellcasting.hasSorceryPoints && (
                <ResourceBox
                  label="Sorcery Points"
                  current={resources.sorceryPoints}
                  max={resources.maxSorceryPoints}
                  color="pink"
                />
              )}
              {/* Pact Slots/Arcane Charges - only for Warlocks */}
              {spellcasting.hasArcaneCharges && (
                <ResourceBox
                  label="Pact Slots"
                  current={resources.arcaneCharges}
                  max={resources.maxArcaneCharges}
                  color="blue"
                />
              )}
              {/* Spellbook - only for Wizards */}
              {spellcasting.hasSpellbook && (
                <button className="flex-1 flex flex-col items-center justify-center gap-1 p-2 rounded-sm bg-[#1a1614] border border-[#3d3428]/60 hover:border-[#5a4a3a]/80 transition-colors group">
                  <BookOpen className="w-6 h-6 text-[#8b7355] group-hover:text-[#c9b896] transition-colors" />
                  <span className="text-[10px] uppercase tracking-wider text-[#8b7355] group-hover:text-[#c9b896]">
                    Spellbook
                  </span>
                </button>
              )}
            </div>
          </div>
        </FantasyPanel>
      )}

      {/* Quick Abilities - Only show for spellcasting classes */}
      {spellcasting.canCast && (
        <FantasyPanel title="Quick Abilities" className="flex-shrink-0">
          <div className="p-3">
            <div className="flex gap-2 justify-center">
              {quickAbilities.map((ability) => {
                const IconComponent = quickAbilityIconMap[ability.icon] || LockedAbilityIcon
                return (
                  <button
                    key={ability.id}
                    disabled={!ability.unlocked}
                    className={cn(
                      "flex flex-col items-center gap-1 p-1 rounded-sm transition-all",
                      ability.unlocked
                        ? "hover:bg-[#2a2420]/60 group cursor-pointer"
                        : "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <IconFrame 
                      className="w-14 h-14" 
                      disabled={!ability.unlocked}
                    >
                      <div className={cn(
                        "w-full h-full bg-gradient-to-br overflow-hidden",
                        ability.unlocked 
                          ? "from-[#1a2a35] to-[#0f1a20]" 
                          : "from-[#1a1614] to-[#0d0b0a]"
                      )}>
                        {ability.iconUrl ? (
                          <img 
                            src={ability.iconUrl} 
                            alt={ability.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <IconComponent className="w-full h-full p-1" />
                        )}
                      </div>
                    </IconFrame>
                    <span
                      className={cn(
                        "text-[10px] text-center leading-tight",
                        ability.unlocked ? "text-stone-400" : "text-stone-600"
                      )}
                    >
                      {ability.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </FantasyPanel>
      )}

      {/* Collapsible Reactions Panel */}
      <ReactionsPanel
        reactions={[]}
        reactionCount={resources.reaction}
        onReactionUse={(reactionId) => {
          onActionSelect(reactionId)
          // Notify Lich of reaction use
          if (onSendToLich) {
            onSendToLich(`[Reaction] ${characterName || "Player"} uses ${reactionId}`)
          }
        }}
        characterClass={characterClass}
      />

      {/* Dice Roller */}
      <DiceRoller
        onSendToLich={onSendToLich}
        characterName={characterName}
      />
    </div>
  )
}

// Injects the combat animation keyframes once into the NPC panel.
function CombatFxKeyframes() {
  return (
    <style>{`
      @keyframes aopDmgFloat {
        0%   { transform: translateY(8px) scale(0.6); opacity: 0; }
        18%  { transform: translateY(0) scale(1.25); opacity: 1; }
        100% { transform: translateY(-54px) scale(1); opacity: 0; }
      }
      @keyframes aopHpShake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-3px); }
        40% { transform: translateX(3px); }
        60% { transform: translateX(-2px); }
        80% { transform: translateX(2px); }
      }
      @keyframes aopSpeakerPulse {
        0%, 100% {
          box-shadow: 0 0 8px 2px rgba(201,168,104,0.35), inset 0 0 14px rgba(201,168,104,0.18);
          border-color: rgba(201,168,104,0.55);
        }
        50% {
          box-shadow: 0 0 24px 7px rgba(212,168,86,0.75), inset 0 0 20px rgba(212,168,86,0.3);
          border-color: rgba(240,196,110,0.95);
        }
      }
      @keyframes aopCaptionFade {
        0%   { opacity: 0; transform: translateY(6px); }
        100% { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  )
}

// Large featured close-up of the NPC who is currently speaking. Portraits are
// square head-and-shoulders images. The featured box itself is wide-and-short,
// so instead of cropping the square into that wide box (which would zoom in and
// clip the face to a thin forehead-to-eyes band) we place the sharp face inside
// a CENTERED PORTRAIT-ASPECT frame. Because that frame is taller than it is
// wide, object-cover becomes height-driven and always shows the full image
// height (forehead to chin), cropping only the sides — the whole face stays in
// view and vertically centered regardless of the panel width. A blurred copy
// fills the full width behind it as atmosphere. An amber/gold border pulse
// signals that this character is talking.
// Mute preference + line dedup live at module scope so they survive
// FeaturedSpeaker unmounting whenever the active speaker changes/clears.
let ttsMuted = false
let lastSpokenKey: string | null = null
let activeNpcAudio: HTMLAudioElement | null = null

function stopNpcAudio() {
  if (activeNpcAudio) {
    activeNpcAudio.pause()
    activeNpcAudio.src = ""
    activeNpcAudio = null
  }
}

function FeaturedSpeaker({ speaker, line, voiceId, caption, hasOthers = false, onLineComplete }: { speaker: NpcEncounter; line?: string | null; voiceId?: string | null; caption?: string | null; hasOthers?: boolean; onLineComplete?: () => void }) {
  const face = speaker.face_url || speaker.portrait_url
  const [muted, setMuted] = useState(ttsMuted)
  const [speaking, setSpeaking] = useState(false)

  // Keep the completion callback in a ref so the audio effect (which only
  // depends on [line, speaker.id]) always calls the freshest version without
  // re-running and re-triggering TTS.
  const onLineCompleteRef = useRef(onLineComplete)
  useEffect(() => { onLineCompleteRef.current = onLineComplete }, [onLineComplete])

  // Animated talking-head: looping muted videos layered over the static face.
  // talking_url plays while TTS audio is playing; idle_url plays while silent.
  // Both are always mounted (preloaded) and crossfade via opacity so switching
  // states never pops. The static <img> beneath is the graceful fallback for
  // whichever video is missing (or both — exact legacy behavior).
  const idleUrl = speaker.idle_url || null
  const talkingUrl = speaker.talking_url || null
  const idleVideoRef = useRef<HTMLVideoElement | null>(null)
  const talkingVideoRef = useRef<HTMLVideoElement | null>(null)
  // Which video should be visible right now.
  const showTalking = speaking && !!talkingUrl
  const showIdle = !showTalking && !!idleUrl

  // Force muted + playing whenever sources change (React's muted prop and
  // autoplay can be unreliable; TTS must remain the ONLY audio source).
  useEffect(() => {
    for (const v of [idleVideoRef.current, talkingVideoRef.current]) {
      if (!v) continue
      v.muted = true
      v.defaultMuted = true
      v.play().catch(() => {})
    }
  }, [idleUrl, talkingUrl])

  // Auto-play the quoted line (dialogue only — narration is never passed here)
  // through the per-NPC voice. Each unique speaker+line plays at most once.
  useEffect(() => {
    if (!line || !speaker.id) return
    const key = `${speaker.id}::${line}`
    if (key === lastSpokenKey) return // never speak the same line twice
    if (ttsMuted) {
      lastSpokenKey = key // honor "played once" even while muted
      return
    }
    lastSpokenKey = key
    let cancelled = false
    stopNpcAudio()
    setSpeaking(true)
    ;(async () => {
      try {
        const res = await fetch("/api/npc-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Send the full voice contract the route expects: an explicit voice_id
          // if the NPC already has one, else the voice_description so the route
          // can resolve a voice. npcId scopes any write-back to exactly this NPC
          // row so a resolved voice is never smeared onto other characters.
          body: JSON.stringify({
            text: line,
            // Never inherit a voice from the featured panel or previous beat.
            // This id and description belong only to the resolved NPC row.
            voiceId: voiceId ?? undefined,
            voiceDescription: voiceId ? undefined : speaker.voice_description ?? undefined,
            npcName: speaker.name,
            npcId: speaker.id,
          }),
        })
        if (!res.ok || cancelled) {
          setSpeaking(false)
          return
        }
        const blob = await res.blob()
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        activeNpcAudio = audio
        audio.onended = () => {
          setSpeaking(false)
          URL.revokeObjectURL(url)
          if (activeNpcAudio === audio) activeNpcAudio = null
          onLineCompleteRef.current?.() // advance to the next speaker beat
        }
        audio.onerror = () => {
          setSpeaking(false)
          onLineCompleteRef.current?.() // don't strand the sequence on a TTS failure
        }
        await audio.play().catch(() => setSpeaking(false))
      } catch {
        if (!cancelled) setSpeaking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [line, speaker.id, speaker.name, speaker.voice_description, voiceId])

  // Stop any in-flight audio when the featured speaker unmounts (speaker clears).
  useEffect(() => () => stopNpcAudio(), [])

  const toggleMute = () => {
    const next = !muted
    ttsMuted = next
    setMuted(next)
    if (next) {
      stopNpcAudio()
      setSpeaking(false)
    }
  }

  return (
    <div className="relative w-full min-h-0 flex-1">
      <div
        className="relative w-full h-full overflow-hidden rounded-sm border-2"
        style={{ animation: "aopSpeakerPulse 2s ease-in-out infinite", borderColor: "rgba(201,168,104,0.55)" }}
      >
        {face ? (
          <>
            {/* Blurred fill spanning the full width so the sides read as
                atmosphere rather than empty letterbox bars. */}
            <img
              src={face}
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-40"
            />
            {/* Sharp face in a centered portrait frame. aspect-[4/5] is narrower
                than the square source, forcing object-cover to fit by height and
                reveal the entire face top-to-bottom. object-position keeps the
                head/face (upper portion of the square) in frame. The static
                image is the base layer; talking/idle videos crossfade above it
                when present, and fall back to this image when absent. */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative h-full aspect-[4/5]">
                <img
                  src={face}
                  alt={speaker.name}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: "50% 30%" }}
                />
                {idleUrl && (
                  <video
                    ref={idleVideoRef}
                    src={idleUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-in-out"
                    style={{ objectPosition: "50% 30%", opacity: showIdle ? 1 : 0 }}
                  />
                )}
                {talkingUrl && (
                  <video
                    ref={talkingVideoRef}
                    src={talkingUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-in-out"
                    style={{ objectPosition: "50% 30%", opacity: showTalking ? 1 : 0 }}
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#2a2018] to-[#1a1614] flex items-center justify-center">
            <span className="text-5xl text-stone-600">?</span>
          </div>
        )}

        {/* Readability gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0908]/95 via-transparent to-transparent" />

        {/* Speaking indicator + mute/stop toggle */}
        <div className="absolute top-1.5 right-2 flex items-center gap-1.5">
          {speaking && !muted && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#e6c878] animate-pulse" />
              <span className="text-[9px] uppercase tracking-widest text-[#c9a868]/90 drop-shadow">Speaking</span>
            </>
          )}
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute NPC voice" : "Mute / stop NPC voice"}
            title={muted ? "Unmute NPC voice" : "Mute / stop NPC voice"}
            className="flex items-center justify-center w-6 h-6 rounded-sm bg-[#0a0908]/70 border border-[#c9a868]/40 text-[#c9a868] hover:text-[#e6c878] hover:border-[#c9a868]/70 transition-colors"
          >
            {muted ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>
        </div>

        {/* Name + current spoken line beneath the portrait */}
        <div className="absolute bottom-0 left-0 right-0 p-3 flex flex-col items-center gap-1.5">
          <div className="flex items-center justify-center gap-2 max-w-full">
            <span className="h-px w-8 bg-[#c9a868]/40 flex-shrink-0" />
            <p className="text-sm font-serif font-semibold text-[#e6c878] text-center tracking-wide drop-shadow truncate">
              {speaker.name}
            </p>
            <span className="h-px w-8 bg-[#c9a868]/40 flex-shrink-0" />
          </div>
          {/* Disposition / Attitude — only when the encounter record carries them.
              No placeholders are ever invented for a record that lacks these. */}
          {(speaker.disposition || speaker.attitude) && (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {speaker.disposition && (
                <span className="inline-flex items-center gap-1 rounded-sm border border-[#c9a868]/40 bg-[#0a0908]/70 px-1.5 py-0.5 text-[10px] text-[#e6c878]/90 drop-shadow">
                  <span className="uppercase tracking-wider text-stone-500">Disposition</span>
                  <span className="font-medium">{speaker.disposition}</span>
                </span>
              )}
              {speaker.attitude && (
                <span className="inline-flex items-center gap-1 rounded-sm border border-[#c9a868]/40 bg-[#0a0908]/70 px-1.5 py-0.5 text-[10px] text-[#e6c878]/90 drop-shadow">
                  <span className="uppercase tracking-wider text-stone-500">Attitude</span>
                  <span className="font-medium">{speaker.attitude}</span>
                </span>
              )}
            </div>
          )}
          {speaker.conditions && speaker.conditions.length > 0 && (
            <div className="flex justify-center max-w-full">
              <ConditionBadges conditions={speaker.conditions} size="sm" />
            </div>
          )}
          {caption && (
            <p
              key={caption}
              className="max-w-[94%] text-center font-serif italic text-[13px] leading-snug text-[#e6c878]/90 drop-shadow-lg line-clamp-2"
              style={{ animation: "aopCaptionFade 0.5s ease-out" }}
            >
              {`\u201C${caption}\u201D`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// A single NPC portrait card that reacts to damage: when its HP drops, a red
// "-N" floats up over the portrait and the HP bar shakes — BG3-style feedback.
function NpcEncounterCard({ encounter, solo, compact = false }: { encounter: NpcEncounter; solo: boolean; compact?: boolean }) {
  const prevHp = useRef<number | null>(encounter.hp_current ?? null)
  const hitKey = useRef(0)
  const [hits, setHits] = useState<{ id: number; amount: number }[]>([])
  const [shake, setShake] = useState(false)

  useEffect(() => {
    const cur = encounter.hp_current ?? null
    const prev = prevHp.current
    if (cur != null && prev != null && cur < prev) {
      const id = ++hitKey.current
      const amount = prev - cur
      setHits((h) => [...h, { id, amount }])
      setShake(true)
      setTimeout(() => setHits((h) => h.filter((x) => x.id !== id)), 1100)
      setTimeout(() => setShake(false), 500)
    }
    prevHp.current = cur
  }, [encounter.hp_current])

  const hp = encounter.hp_current
  const hpMax = encounter.hp_max
  const hasHp = hp != null && hpMax != null && hpMax > 0

  return (
    <div className="flex-shrink-0 relative overflow-hidden rounded-sm" style={{ width: solo ? "100%" : compact ? "84px" : "140px" }}>
      {encounter.portrait_url ? (
        <>
          {/* Blurred, zoomed copy fills the card edge-to-edge so there are no empty bars */}
          <img
            src={encounter.portrait_url}
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-40"
          />
          {/* Full portrait, never cropped */}
          <img
            src={encounter.portrait_url}
            alt={encounter.name}
            className="absolute inset-0 w-full h-full object-contain object-top"
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#2a2018] to-[#1a1614] flex items-center justify-center">
          <span className="text-4xl text-stone-600">?</span>
        </div>
      )}
      {/* Gradient overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0908]/90 via-transparent to-transparent" />

      {/* Floating damage numbers */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {hits.map((hit) => (
          <span
            key={hit.id}
            className="absolute font-serif font-extrabold text-[#ff5a4a] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
            style={{ fontSize: solo ? "2.6rem" : "1.7rem", animation: "aopDmgFloat 1.1s ease-out forwards" }}
          >
            -{hit.amount}
          </span>
        ))}
      </div>

      {/* Name & HP info overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-1.5">
        <p className="text-xs text-[#c9a868] font-semibold text-center truncate drop-shadow">{encounter.name}</p>
        {hasHp && (
          <div className="mt-0.5" style={shake ? { animation: "aopHpShake 0.45s ease-in-out" } : undefined}>
            <div className="text-[9px] text-stone-400 text-center mb-0.5">{hp}/{hpMax} HP</div>
            <div className="h-1.5 bg-[#1a1614] rounded-full overflow-hidden border border-[#3d3428]/60">
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  hp! <= 0 ? "bg-[#4a3a3a]" :
                  hp! <= hpMax! * 0.3 ? "bg-[#c84a3a]" :
                  hp! <= hpMax! * 0.6 ? "bg-[#d4a856]" :
                  "bg-[#5ab85a]"
                )}
                style={{ width: `${Math.max(0, (hp! / hpMax!) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ActionButton({ action, isSelected, onSelect }: { action: Action; isSelected: boolean; onSelect: (id: string) => void }) {
  const [showSubmenu, setShowSubmenu] = useState(false)
  const IconComponent = actionIconMap[action.id] || SpellbookIcon
  const typeColors = actionTypeColors[action.type]
  
  // Dark red border for bonus actions
  const bonusBorderClass = action.type === "bonus" ? "ring-2 ring-[#8a2a2a]/60" : ""
  
  const handleClick = () => {
    if (action.hasSubmenu) {
      setShowSubmenu(!showSubmenu)
    } else {
      onSelect(action.id)
    }
  }
  
  return (
    <div className="relative">
      <button
        onClick={handleClick}
        className={cn(
          "w-full flex items-center gap-3 p-2 rounded-sm transition-all text-left border",
          "hover:bg-[#2a2420]/60 group",
          isSelected 
            ? cn(typeColors.bg, typeColors.border, "shadow-[0_0_10px_rgba(100,150,100,0.15)]")
            : "border-transparent"
        )}
      >
        <IconFrame 
          className={cn("w-10 h-10 flex-shrink-0", bonusBorderClass)} 
          selected={isSelected}
        >
          {action.iconUrl ? (
            <img src={action.iconUrl} alt={action.name} className="w-full h-full object-cover" />
          ) : (
            <IconComponent className="w-full h-full" />
          )}
        </IconFrame>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm font-medium",
              isSelected ? typeColors.text : "text-stone-200 group-hover:text-white"
            )}
          >
            {action.name}
          </p>
          <p className="text-xs text-stone-500 truncate">{action.description}</p>
        </div>
        {/* Submenu indicator for Cunning Action */}
        {action.hasSubmenu && (
          <span className="text-stone-500 text-xs mr-1">{showSubmenu ? "▼" : "▶"}</span>
        )}
        {/* Type indicator dot */}
        <div className={cn(
          "w-2 h-2 rounded-full flex-shrink-0",
          action.type === "action" && "bg-[#4a8a4a]",
          action.type === "bonus" && "bg-[#8a7a3a]",
          action.type === "reaction" && "bg-[#7a4a8a]"
        )} />
      </button>
      
      {/* Cunning Action Submenu */}
      {action.hasSubmenu && showSubmenu && (
        <div className="ml-4 mt-1 p-2 bg-[#1a1614] border border-[#8a2a2a]/60 rounded-sm shadow-lg">
          <p className="text-[10px] uppercase tracking-wider text-[#8a2a2a] mb-2 px-1">Choose Action</p>
          <div className="flex gap-2">
            {cunningActionOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => {
                  onSelect(option.id)
                  setShowSubmenu(false)
                }}
                className="flex flex-col items-center gap-1 p-1 rounded-sm hover:bg-[#2a2420]/60 transition-all group"
              >
                <div className="w-12 h-12 rounded-md overflow-hidden border-2 border-[#8a2a2a] shadow-[0_0_8px_rgba(138,42,42,0.4)]">
                  <img 
                    src={option.iconUrl} 
                    alt={option.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-[9px] text-stone-400 group-hover:text-white text-center leading-tight">
                  {option.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionCounter({ label, value, type }: { label: string; value: number; type: "action" | "bonus" | "reaction" }) {
  const colorConfig = {
    action: {
      bg: "from-[#2a3a2a] to-[#1a251a]",
      border: "border-[#4a7a4a]/60",
      text: value > 0 ? "text-[#7ab87a]" : "text-stone-600",
      glow: "drop-shadow-[0_0_8px_rgba(100,180,100,0.5)]"
    },
    bonus: {
      bg: "from-[#3a2a1a] to-[#251a0f]",
      border: "border-[#8a6a3a]/60",
      text: value > 0 ? "text-[#d4a454]" : "text-stone-600",
      glow: "drop-shadow-[0_0_8px_rgba(200,150,80,0.5)]"
    },
    reaction: {
      bg: "from-[#2a2a3a] to-[#1a1a25]",
      border: "border-[#6a6a9a]/60",
      text: value > 0 ? "text-[#9a9ac8]" : "text-stone-600",
      glow: "drop-shadow-[0_0_8px_rgba(150,150,200,0.5)]"
    }
  }

  const config = colorConfig[type]

  return (
    <div className={cn(
      "text-center p-2 rounded-sm bg-gradient-to-br border",
      config.bg,
      config.border
    )}>
      <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">{label}</p>
      <div
        className={cn(
          "text-2xl font-serif font-bold",
          config.text,
          value > 0 && config.glow
        )}
      >
        {value}
      </div>
    </div>
  )
}

function ResourceBox({
  label,
  current,
  max,
  color,
}: {
  label: string
  current: number
  max: number
  color: "purple" | "pink" | "blue"
}) {
  const colorClasses = {
    purple: "from-[#2a1a35] to-[#1a0f20] border-[#6a4a8a]/40 text-[#a87ac8]",
    pink: "from-[#351a2a] to-[#200f1a] border-[#8a4a6a]/40 text-[#c87a9a]",
    blue: "from-[#1a2a35] to-[#0f1a20] border-[#4a7a9a]/40 text-[#7aa8c8]",
  }

  const dotColors = {
    purple: "bg-[#8a5aaa]",
    pink: "bg-[#aa5a8a]",
    blue: "bg-[#5a8aaa]",
  }

  return (
    <div
      className={cn(
        "flex-1 p-2 rounded-sm text-center",
        "bg-gradient-to-br border",
        colorClasses[color]
      )}
    >
      <p className="text-[9px] uppercase tracking-wider text-stone-500 mb-1">{label}</p>
      <div className="flex justify-center gap-1 mb-1">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-2.5 h-2.5 rounded-full transition-all",
              i < current
                ? cn(dotColors[color], "shadow-[0_0_6px_rgba(150,100,200,0.6)]")
                : "bg-stone-700/50"
            )}
          />
        ))}
      </div>
      <p className="text-xs font-medium">
        {current} / {max}
      </p>
    </div>
  )
}
