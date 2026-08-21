"use client"

/**
 * The simplified dashboard — what the table sees by default.
 *
 * The full v4 dashboard is three columns of panels around a scene that ends up
 * roughly a third of the screen. Most people at the table are not reading nine
 * panels; they are looking at the picture and picking what their character
 * does. So this view keeps exactly that — the media, the chips, the input —
 * gives the media the space the panels were using, and folds everything else
 * into a rail of icons.
 *
 * The stat bar across the top is Sam's design: the six abilities with modifier
 * over score, then proficiency, speed, AC and hit points. Those are the numbers
 * a player checks mid-turn, so they stay visible and the sheet stops needing to
 * be opened for most of a session.
 *
 * DELIBERATELY NOT A FORK. This renders the same props as V4Dashboard and owns
 * no game logic of its own: no cinematic resolution, no dice, no claim rules.
 * Anything mechanical belongs in the full dashboard or in a shared module, so
 * the two views cannot drift into disagreeing about the rules.
 */

import { useState } from "react"
import { Backpack, LayoutGrid, Map as MapIcon, MessageSquare, Mic, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import MapPanel from "@/components/map/map-panel"
import { SuggestionChips } from "./suggestion-chips"
import { CinematicOverlay } from "./cinematic-overlay"
import { DmNarration } from "./dm-narration"
import { npcWindowStyle, type StageFramingRow } from "@/lib/stage-framing"
import { useSceneCinematic } from "@/lib/hooks/use-scene-cinematic"
import { isVideoUrl } from "@/lib/media-url"
import type { Suggestion } from "@/lib/suggestions"
import type { Character, EquipmentItem, InventoryItem, NpcEncounter } from "@/lib/types/database"

type DialogueEntry = { id?: string; speaker: string; text: string }

/** Static fallbacks. The observe chip must survive a failed generation. */
const QUICK_REPLIES: Suggestion[] = [
  { text: "Listen for anything nearby", skill: null },
  { text: "Speak up", skill: null },
  { text: "Wait and watch", skill: null },
  { text: "Look around", skill: null, kind: "observe" },
]

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha"
const ABILITIES: Array<{ key: AbilityKey; label: string }> = [
  { key: "str", label: "Strength" },
  { key: "dex", label: "Dexterity" },
  { key: "con", label: "Constitution" },
  { key: "int", label: "Intelligence" },
  { key: "wis", label: "Wisdom" },
  { key: "cha", label: "Charisma" },
]

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

/** Same sprite sheets the full dashboard uses — one source of art, not a copy. */
const SHIELD_SPRITE: Record<"ac" | "speed" | "initiative" | "proficiency", string> = {
  ac: "0% 40%",
  speed: "33.333% 40%",
  initiative: "66.666% 40%",
  proficiency: "100% 40%",
}
const SHIELD_CLIP = "polygon(50% 0, 94% 14%, 91% 72%, 78% 90%, 50% 100%, 22% 90%, 9% 72%, 6% 14%)"

function AbilityTile({ label, abbr, score, mod, index }: { label: string; abbr: string; score: number; mod: number; index: number }) {
  const x = index === 0 ? "0%" : index === 5 ? "100%" : `${index * 20}%`
  return (
    <div className="relative h-[68px] min-w-[54px] flex-1 overflow-hidden rounded-sm border border-[#5e481f] bg-[#090807] shadow-[0_3px_7px_#000]" title={`${label}: ${score} (${signed(mod)})`}>
      <span className="absolute inset-0 block bg-[url('/images/ui/ability-score-icons.png')] bg-[length:600%_auto] bg-no-repeat" style={{ backgroundPosition: `${x} 3%` }} />
      <span className="absolute inset-x-0 bottom-0 h-[34px] bg-gradient-to-t from-black via-black/92 to-transparent" />
      <span className="absolute inset-x-0 bottom-[15px] text-center font-serif text-[13px] leading-none text-[#f0d9aa] drop-shadow-[0_1px_2px_#000]">{score}</span>
      <span className="absolute inset-x-0 bottom-[7px] text-center font-serif text-[8px] leading-none text-[#d7ab62]">{signed(mod)}</span>
      <span className="absolute inset-x-0 bottom-0 truncate px-0.5 text-center text-[6px] font-bold uppercase tracking-[.12em] text-[#bfa36d]">{abbr}</span>
    </div>
  )
}

function StatShieldTile({ kind, label, value }: { kind: keyof typeof SHIELD_SPRITE; label: string; value: string }) {
  return (
    <div className="relative flex h-[68px] min-w-[54px] flex-1 flex-col items-center justify-end pb-0.5" title={`${label}: ${value}`}>
      <span className="absolute inset-x-1 top-0 h-[54px] overflow-hidden drop-shadow-[0_4px_5px_#000]" style={{ clipPath: SHIELD_CLIP }}>
        <span className="block h-full w-full scale-[1.12] bg-[url('/images/ui/character-stat-shields.png')] bg-[length:400%_auto] bg-no-repeat" style={{ backgroundPosition: SHIELD_SPRITE[kind] }} />
      </span>
      <b className="absolute bottom-[12px] z-10 rounded-full border border-[#c49b4f] bg-[#080604]/90 px-1.5 py-0.5 font-serif text-[9px] leading-none text-[#f3dfb4] shadow-[0_1px_5px_#000]">{value}</b>
      <span className="relative z-10 max-w-full truncate px-0.5 text-[6px] font-bold uppercase tracking-[.08em] text-[#cdb276]">{label}</span>
    </div>
  )
}

export interface SimpleDashboardProps {
  environment: { name: string; region: string; timeOfDay: string; imageUrl: string; description?: string | null }
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
  dmMode?: boolean
  /** Hand back to the full three-column dashboard. */
  onExpand: () => void
}

type Panel = null | "map" | "sheet" | "bag" | "log"

export function SimpleDashboard(props: SimpleDashboardProps) {
  const [panel, setPanel] = useState<Panel>(null)
  const [speakingNpc, setSpeakingNpc] = useState<{ id: string; name: string } | null>(null)
  const cinematic = useSceneCinematic({
    locationName: props.environment.name,
    seatId: props.selectedCharacterId,
    dmMode: props.dmMode,
  })
  const selected = props.selectedCharacter ?? props.characters.find((c) => c.id === props.selectedCharacterId) ?? props.characters[0]
  const party = props.characters.filter((c) => c.is_player).slice(0, 4)

  const mod = (k: AbilityKey) => (selected?.[`${k}_modifier` as keyof Character] as number) ?? 0
  const score = (k: AbilityKey) => (selected?.[`${k}_score` as keyof Character] as number) ?? 10
  const hpCurrent = selected?.hp_current ?? 0
  const hpMax = selected?.hp_max ?? 0
  const hpTemp = (selected as unknown as { sheet_hp_temp?: number } | undefined)?.sheet_hp_temp ?? 0

  // Who is on stage. Same derivation the full dashboard uses; it is
  // presentation, not rules, so it is safe to read the same rows twice.
  const speakingRow = speakingNpc ? props.npcEncounters.find((n) => n.id === speakingNpc.id) : undefined
  const speakingPlayer = speakingNpc && !speakingRow ? props.characters.find((c) => c.id === speakingNpc.id) : undefined
  const activeNpc = props.npcEncounters.find((npc) => npc.is_active) ?? props.npcEncounters[0]
  const shownNpc = speakingRow ?? activeNpc
  const onStage = speakingPlayer ?? shownNpc
  const npcName = speakingPlayer?.name ?? shownNpc?.name ?? "No one on stage"
  const npcPortrait = speakingPlayer
    ? speakingPlayer.avatar_image_url
    : (shownNpc as { portrait_url?: string | null; face_url?: string | null } | undefined)?.portrait_url ??
      (shownNpc as { face_url?: string | null } | undefined)?.face_url ??
      null
  const npcFrame = npcWindowStyle(speakingPlayer ? undefined : ((speakingRow ?? shownNpc) as StageFramingRow | undefined))
  const lastNpcLine = [...props.dialogue].reverse().find((e) => e.speaker === npcName)?.text?.slice(0, 160) ?? null

  const rail: Array<{ id: Exclude<Panel, null>; icon: typeof MapIcon; label: string }> = [
    { id: "map", icon: MapIcon, label: "Map" },
    { id: "sheet", icon: Shield, label: "Character sheet" },
    { id: "bag", icon: Backpack, label: "Inventory" },
    { id: "log", icon: MessageSquare, label: "Story so far" },
  ]

  return (
    <main className="aop-lich-dashboard flex min-h-0 flex-1 flex-col gap-0 overflow-hidden bg-[#0d0b08]">
      {/* Stat bar — the numbers you check mid-turn, always on screen. */}
      <div className="flex shrink-0 flex-wrap items-stretch gap-1.5 border-b border-[#3a2d14] bg-[#120f0a] px-2 py-1.5">
        {ABILITIES.map(({ key, label }, i) => (
          <AbilityTile key={key} label={label} abbr={key.toUpperCase()} score={score(key)} mod={mod(key)} index={i} />
        ))}
        <StatShieldTile kind="proficiency" label="Proficiency" value={signed(selected?.proficiency_bonus ?? 2)} />
        <StatShieldTile kind="speed" label="Speed" value={String(selected?.speed ?? "30 ft.")} />
        <StatShieldTile kind="ac" label="Armor Class" value={String(selected?.ac ?? 10)} />
        <StatShieldTile kind="initiative" label="Initiative" value={signed(selected?.initiative ?? 0)} />
        <div className="flex min-w-[132px] flex-[1.4] items-center gap-2 rounded border border-[#4b3a19] bg-[#1a1610] px-2 py-1">
          <div className="flex-1 text-center">
            <div className="text-[7px] uppercase tracking-[.12em] text-[#8a7a55]">Current</div>
            <div className="font-serif text-base leading-tight text-[#e8dcc4]">{hpCurrent}</div>
          </div>
          <div className="font-serif text-sm text-[#5f5540]">/</div>
          <div className="flex-1 text-center">
            <div className="text-[7px] uppercase tracking-[.12em] text-[#8a7a55]">Max</div>
            <div className="font-serif text-base leading-tight text-[#e8dcc4]">{hpMax}</div>
          </div>
          <div className="flex-1 text-center">
            <div className="text-[7px] uppercase tracking-[.12em] text-[#8a7a55]">Temp</div>
            <div className="font-serif text-base leading-tight text-[#b9a986]">{hpTemp > 0 ? hpTemp : "—"}</div>
          </div>
        </div>
        <button
          onClick={props.onExpand}
          title="Open the full dashboard"
          className="flex shrink-0 items-center gap-1.5 rounded border border-[#8a6d2f] bg-[#2a2110] px-2.5 text-[10px] text-[#e8dcc4] hover:bg-[#33280f]"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Full dashboard
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Icon rail — every panel the simplified view drops lives behind one of these. */}
        <nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-[#3a2d14] bg-[#120f0a] py-2">
          {rail.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              title={label}
              aria-label={label}
              onClick={() => setPanel(panel === id ? null : id)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded",
                panel === id ? "border border-[#8a6d2f] bg-[#2a2110] text-[#e8dcc4]" : "text-[#7a6a48] hover:text-[#cdb276]",
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Who is speaking. Compact here — a name, what they just said, and
              their face — because in the simplified view the scene is the hero
              and the speaker is a strip across the top of it, not a whole
              panel. DmNarration rides along so the voices work; it renders its
              own toggles. */}
          <div className="flex shrink-0 items-stretch gap-3 border-b border-[#3a2d14] bg-[#120f0a] px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate font-serif text-[13px] font-bold text-white">{npcName}</h2>
                <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[8px] uppercase tracking-[.14em]", speakingNpc ? "border-[#b8913f] bg-[#1c1408] text-[#f0cd7a]" : "border-[#3b3325] bg-black/40 text-[#6d6450]")}>
                  {speakingNpc ? <>Speaking <span className="ml-1 animate-pulse">▮▮▯▯</span></> : onStage ? <>Silent <span className="ml-1">▯▯▯▯</span></> : "Awaiting an entrance"}
                </span>
                <span className="ml-auto shrink-0"><DmNarration dialogue={props.dialogue} npcs={props.npcEncounters} players={props.characters.filter((c) => c.is_player).map((c) => ({ id: c.id, name: c.name, voice_id: c.voice_id ?? null, voice_description: c.voice_description ?? null }))} onSpeakingChange={(npc) => setSpeakingNpc(npc ? { id: npc.id, name: npc.name } : null)} /></span>
              </div>
              <p className="truncate text-[9px] text-[#a4916d]">
                {speakingPlayer ? `Level ${speakingPlayer.level} ${speakingPlayer.class}` : onStage ? (shownNpc as { description?: string | null } | undefined)?.description || "Present in the scene" : "No one has stepped forward yet"}
              </p>
              {lastNpcLine ? <blockquote className="mt-1.5 border-l-2 border-red-700 pl-2 text-[10px] italic leading-[1.4] text-[#e4d8bf]">“{lastNpcLine}”</blockquote> : null}
            </div>
            <div className="relative h-[74px] w-[110px] shrink-0 overflow-hidden rounded border border-[#6b5123] bg-[radial-gradient(circle_at_50%_30%,#302314,#050403_70%)]">
              {npcPortrait ? (
                isVideoUrl(npcPortrait)
                  ? <video key={npcPortrait} src={npcPortrait} autoPlay loop muted playsInline style={npcFrame} className="absolute inset-0 h-full w-full object-contain object-top" />
                  : <img src={npcPortrait} alt={npcName} style={npcFrame} className="absolute inset-0 h-full w-full object-contain object-top" />
              ) : (
                <span className="flex h-full items-center justify-center px-1 text-center text-[7px] uppercase tracking-wider text-[#6d6450]">
                  {onStage ? "Portrait loads from NPC canon" : "The stage is empty"}
                </span>
              )}
              <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#c49b4e]/20" />
            </div>
          </div>

          {/* The picture is the interface. */}
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#11151f]">
            {isVideoUrl(props.environment.imageUrl) ? (
              <video key={props.environment.imageUrl} src={props.environment.imageUrl} autoPlay loop muted playsInline className="h-full w-full object-cover" />
            ) : (
              <img src={props.environment.imageUrl} alt={props.environment.name} className="h-full w-full object-cover" />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
            <div className="absolute bottom-3 left-3 rounded border border-[#6b5123] bg-[#080705]/85 px-2 py-1">
              <span className="block text-[8px] uppercase tracking-wider text-[#8f8061]">Point of view</span>
              <b className="font-serif text-[10px] text-[#e1d0a8]">{selected?.name ?? "Active character"} · {props.environment.name}</b>
            </div>

            {/* Slide-over: one panel at a time, over the scene, closes back to it. */}
            {panel && (
              <div className="absolute inset-y-0 right-0 flex w-full max-w-[380px] flex-col border-l border-[#4b3a19] bg-[#0d0b08]/97">
                <div className="flex shrink-0 items-center justify-between border-b border-[#3a2d14] px-3 py-2">
                  <b className="font-serif text-[11px] uppercase tracking-[.14em] text-[#cdb276]">{rail.find((r) => r.id === panel)?.label}</b>
                  <button onClick={() => setPanel(null)} className="text-[11px] text-[#8f8061] hover:text-[#e8dcc4]">Close</button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[11px] text-[#ddd2bc]">
                  {panel === "map" && <MapPanel initial="location" onBack={() => setPanel(null)} />}
                  {panel === "sheet" && selected && (
                    <div className="space-y-2">
                      <p><b className="text-[#cdb276]">{selected.name}</b> — {selected.class} {selected.level}</p>
                      <p className="text-[#8f8061]">XP {selected.xp ?? 0} / {selected.xp_to_next ?? 300}</p>
                      <p>Initiative {signed(selected.initiative ?? 0)} · AC {selected.ac ?? 10} · Speed {selected.speed ?? "30 ft."}</p>
                      {props.equipment.length > 0 && (
                        <div className="pt-1">
                          <b className="text-[#cdb276]">Equipped</b>
                          <ul className="mt-1 space-y-0.5">
                            {props.equipment.map((eq) => (
                              <li key={eq.slot} className="flex justify-between gap-2 border-b border-[#241d10] pb-0.5">
                                <span className="text-[#8f8061]">{eq.slot}</span><span className="truncate">{eq.name ?? "—"}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <button onClick={props.onExpand} className="mt-2 rounded border border-[#8a6d2f] bg-[#2a2110] px-2 py-1 text-[10px] text-[#e8dcc4]">
                        Open the full sheet
                      </button>
                    </div>
                  )}
                  {panel === "bag" && (
                    props.inventory.length ? (
                      <ul className="space-y-1">
                        {props.inventory.map((item) => (
                          <li key={item.id} className="flex justify-between gap-2 border-b border-[#241d10] pb-1">
                            <span className="truncate">{item.name}</span>
                            <span className="shrink-0 text-[#8f8061]">{item.quantity > 1 ? `x${item.quantity}` : ""}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-[#8f8061]">Nothing but rags.</p>
                  )}
                  {panel === "log" && (
                    <div className="space-y-2">
                      {props.dialogue.slice(-40).map((entry, i) => (
                        <p key={i}><b className="text-[#cdb276]">{entry.speaker}: </b>{entry.text}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-[#3a2d14]">
            <SuggestionChips
              character={selected?.is_player ? selected : undefined}
              dialogue={props.dialogue}
              inventory={props.inventory}
              location={props.environment.name}
              fallback={QUICK_REPLIES}
              disabled={!!props.isThinking}
              onPick={(text, isObserve) => {
                // The action always reaches Malachar; the cinematic rides on
                // top the first time, so a look with no film left still reads
                // as an ordinary look rather than a dead button.
                props.onQuickReply?.(text)
                if (isObserve) void cinematic.play()
              }}
            />
            <div className="flex items-center gap-2 px-3 py-2">
              <input
                value={props.dialogueInput}
                onChange={(e) => props.setDialogueInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && props.onDialogueSubmit()}
                placeholder="Type your response or action…"
                className="aop-lich-input h-8 min-w-0 flex-1 px-3 text-[11px]"
              />
              <button className="aop-square-action h-8 w-8" title="Dictate your response" aria-label="Dictate your response">
                <Mic className="m-auto h-3 w-3" />
              </button>
            </div>

            {/* Party: a face and a health bar. Everything else is a click away. */}
            <div className="flex items-stretch gap-1.5 border-t border-[#3a2d14] bg-[#120f0a] px-2 py-1.5">
              {party.map((member) => {
                const active = member.id === props.selectedCharacterId
                const pct = member.hp_max ? Math.max(0, (member.hp_current / member.hp_max) * 100) : 0
                return (
                  <button
                    key={member.id}
                    onClick={() => props.onCharacterSelect?.(member.id)}
                    className={cn("flex min-w-0 flex-1 items-center gap-2 rounded border px-1.5 py-1 text-left", active ? "border-[#bd9143] bg-[#1d1710]" : "border-transparent hover:border-[#3a2d14]")}
                  >
                    <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-[#8d6d35] bg-[#20180d]">
                      {member.avatar_image_url
                        ? <img src={member.avatar_image_url} alt="" className="h-full w-full object-cover object-[center_14%]" />
                        : <span className="flex h-full items-center justify-center font-serif text-[11px] text-[#cdb276]">{member.name[0]}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-[10px] text-[#ddd2bc]">{member.name}</span>
                      <span className="mt-1 block h-1 rounded bg-[#281315]">
                        <span className="block h-1 rounded bg-[#b62d38]" style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      {cinematic.src ? <CinematicOverlay src={cinematic.src} onClose={cinematic.clear} /> : null}
    </main>
  )
}
