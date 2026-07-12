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
  description: string | null
  portrait_url: string | null
  // Optional dedicated face close-up. When present it is used for the featured
  // "active speaker" view instead of cropping the full-body portrait_url.
  face_url?: string | null
  // Per-NPC voice. voice_id is a resolved ElevenLabs voice id; voice_description
  // is the free-text description used to resolve one when voice_id is unset.
  voice_id?: string | null
  voice_description?: string | null
  is_active: boolean
  hp_current?: number | null
  hp_max?: number | null
}

interface DialogueEntry {
  speaker: string
  text: string
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
  onTelemetryPush?: (event: string, data: Record<string, unknown>) => void
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

// Parse a DM message for NPC dialogue and return the speaking NPC's id.
//
// The message must contain quoted speech (someone is talking). A roster NPC is
// considered the active speaker if their name appears ANYWHERE in that message
// — not only before the quote. Real DM narration frequently refers to an NPC by
// epithet ("the dwarf woman"), lets them speak, and only names them afterward
// (e.g. a self-introduction *inside* the quote: `"...Eldeth Feldrun, scout of
// Gauntlgrym..."`). We also match on the first-name token so later lines that
// drop the surname (`Eldeth says, "..."`) still attribute correctly. When
// several NPCs are named, the one whose mention sits closest to any quote wins.
function detectActiveSpeaker(text: string, roster: NpcEncounter[]): string | null {
  if (!text) return null
  // Collect every quote-character position (straight and curly).
  const quotePositions: number[] = []
  const quoteRe = /["“”„]/g
  let qm: RegExpExecArray | null
  while ((qm = quoteRe.exec(text)) !== null) quotePositions.push(qm.index)
  if (quotePositions.length === 0) return null

  const nearestQuoteDist = (idx: number) =>
    Math.min(...quotePositions.map((q) => Math.abs(q - idx)))

  let best: { id: string; dist: number } | null = null
  for (const npc of roster) {
    if (!npc.name) continue
    // Try the full name, then the first-name token (>=3 chars to avoid noise).
    const candidates = [npc.name]
    const firstToken = npc.name.trim().split(/\s+/)[0]
    if (firstToken && firstToken.length >= 3 && firstToken !== npc.name) {
      candidates.push(firstToken)
    }
    let idx = -1
    for (const c of candidates) {
      const found = findNameIndex(text, c)
      if (found !== -1 && (idx === -1 || found < idx)) idx = found
    }
    if (idx === -1) continue
    const dist = nearestQuoteDist(idx)
    if (!best || dist < best.dist) best = { id: npc.id, dist }
  }
  return best?.id ?? null
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

// Distance from a quote to the closest name mention, strongly preferring a
// mention that appears BEFORE the quote (the "X says, '...'" pattern). Returns
// Infinity when the name never appears. Preceding mentions always beat trailing
// ones so "Fifi leans closer. '...'" attributes to Fifi, not a later NPC name.
function attributionScore(nameIdx: number[], quotePos: number): number {
  let bestPreceding = Infinity
  let bestFollowing = Infinity
  for (const idx of nameIdx) {
    if (idx <= quotePos) bestPreceding = Math.min(bestPreceding, quotePos - idx)
    else bestFollowing = Math.min(bestFollowing, idx - quotePos)
  }
  if (bestPreceding !== Infinity) return bestPreceding
  // No preceding mention: fall back to a following one, but penalized so any
  // preceding mention of the other speaker wins.
  return bestFollowing === Infinity ? Infinity : bestFollowing + 100000
}

// Pull the featured NPC's spoken line out of a DM message for the caption.
// Only quotes attributable to `npcName` are kept — quotes the narrator frames as
// the player character (`playerName`) speaking are excluded — and when the NPC
// has several quotes we keep only the LAST one or two, never a concatenation of
// the whole message. Handles straight and curly quotes.
function extractSpokenLine(text: string, npcName?: string | null, playerName?: string | null): string | null {
  if (!text) return null
  const player = playerName || "Fifi of Copperas Cove"
  const npcIdx = allNameIndices(text, npcName)
  const playerIdx = allNameIndices(text, player)

  const re = /["“„]([^"“”„]+)["”]/g
  const npcQuotes: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const s = m[1].trim()
    if (!s) continue
    const quotePos = m.index
    const npcScore = attributionScore(npcIdx, quotePos)
    const playerScore = attributionScore(playerIdx, quotePos)
    // Exclude quotes the player is speaking. When neither name is anywhere in
    // the text we still show the quote (the featured NPC is the only speaker).
    if (playerScore < npcScore) continue
    npcQuotes.push(s)
  }

  if (!npcQuotes.length) return null
  // Keep only the last one or two NPC quotes.
  return npcQuotes.slice(-2).join(" ")
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
  // Filter active encounters
  const activeEncounters = npcEncounters.filter(e => e.is_active)

  // --- Active speaker detection ---------------------------------------------
  // The featured speaker is DERIVED from the last dialogue entry rather than
  // tracked via append-counting. Deriving is resilient to every way the real
  // app mutates `dialogue`: optimistic appends, realtime INSERT appends, a full
  // array replace on initial fetch / campaign restore, and — critically — the
  // npc roster arriving AFTER the message (an append-counter would early-return
  // and never re-evaluate; a memo re-runs whenever `npcEncounters` changes).
  //
  // Rule: if the most recent entry is a DM message containing NPC dialogue,
  // feature that NPC; a player/system message (or a DM message with no NPC
  // dialogue) clears the featured view back to the normal tile grid.
  const { activeSpeakerId, activeLine } = useMemo(() => {
    const last = dialogue[dialogue.length - 1]
    if (!last || last.speaker !== DM_SPEAKER) {
      return { activeSpeakerId: null as string | null, activeLine: null as string | null }
    }
    const speakerId = detectActiveSpeaker(last.text, npcEncounters)
    const speakerNpc = speakerId ? npcEncounters.find(n => n.id === speakerId) : null
    return {
      activeSpeakerId: speakerId,
      activeLine: speakerId ? extractSpokenLine(last.text, speakerNpc?.name, characterName) : null,
    }
  }, [dialogue, npcEncounters, characterName])

  const activeSpeaker = activeSpeakerId
    ? npcEncounters.find(n => n.id === activeSpeakerId) ?? null
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
              <FeaturedSpeaker speaker={activeSpeaker} line={activeLine} hasOthers={otherEncounters.length > 0} />
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

function FeaturedSpeaker({ speaker, line, hasOthers = false }: { speaker: NpcEncounter; line?: string | null; hasOthers?: boolean }) {
  const face = speaker.face_url || speaker.portrait_url
  const [muted, setMuted] = useState(ttsMuted)
  const [speaking, setSpeaking] = useState(false)

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
          body: JSON.stringify({ npcId: speaker.id, text: line }),
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
        }
        audio.onerror = () => setSpeaking(false)
        await audio.play().catch(() => setSpeaking(false))
      } catch {
        if (!cancelled) setSpeaking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [line, speaker.id])

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
                head/face (upper portion of the square) in frame. */}
            <div className="absolute inset-0 flex items-center justify-center">
              <img
                src={face}
                alt={speaker.name}
                className="h-full w-auto aspect-[4/5] object-cover"
                style={{ objectPosition: "50% 30%" }}
              />
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
          {line && (
            <p
              key={line}
              className="max-w-[94%] text-center font-serif italic text-[13px] leading-snug text-[#e6c878]/90 drop-shadow-lg line-clamp-3"
              style={{ animation: "aopCaptionFade 0.5s ease-out" }}
            >
              {`\u201C${line}\u201D`}
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
