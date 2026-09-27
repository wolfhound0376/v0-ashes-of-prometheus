"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  BookOpen,
  Compass,
  Flame,
  GraduationCap,
  Hammer,
  HandCoins,
  Heart,
  Maximize2,
  MessageCircle,
  Music,
  Search,
  Send,
  Shield,
  Sparkles,
  Sprout,
  Tent,
  Target,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react"
import { CAMP_ACTIONS_NOT_YET, CRAFT_CATEGORIES, CRAFT_CATEGORY_LABEL, type CampAction, type CraftCategory, type CraftMenu } from "@/lib/camp"
import { SRD_SKILLS } from "@/lib/roll-requests"
import { cn } from "@/lib/utils"
import type { Character } from "@/lib/types/database"

// The phone / camp view. Same page state as the full dashboard — same
// dialogue, same send path, same claim — laid out for one hand: story, camp,
// party, and a short sheet. Camp actions are sent as ordinary player lines;
// Malachar and /api/chat decide what they cost and roll for them.

type Entry = { id?: string; speaker: string; text: string; pending?: boolean }
type Npc = { id: string; name: string; face_url: string | null; portrait_url: string | null }

interface CompactDashboardProps {
  environment: { name: string; region: string; timeOfDay: string; imageUrl: string }
  dialogue: Entry[]
  dialogueInput: string
  setDialogueInput: (value: string) => void
  onDialogueSubmit: () => void
  onQuickReply: (text: string) => void
  characters: Character[]
  selectedCharacter?: Character
  npcEncounters: Npc[]
  isThinking?: boolean
  onExitCompact: () => void
  /** Opens the talk mini-dashboard once someone is chosen by the fire. */
  onTalkStart?: (name: string) => void
}

type Tab = "story" | "camp" | "party" | "sheet"

const CAMP_MENU: { id: CampAction; label: string; icon: LucideIcon; hint: string; line: string }[] = [
  { id: "talk", label: "Talk", icon: MessageCircle, hint: "Sit with someone by the fire", line: "" },
  { id: "forage", label: "Forage", icon: Sprout, hint: "Survival check for food", line: "I spend my camp action foraging for food and water nearby." },
  { id: "hunt", label: "Hunt", icon: Target, hint: "Survival check for game", line: "I spend my camp action hunting for game." },
  { id: "perform", label: "Perform", icon: Music, hint: "Performance for the party", line: "I spend my camp action performing for the party around the fire." },
  { id: "pray", label: "Pray", icon: Sparkles, hint: "Speak to your god", line: "I spend my camp action in prayer." },
  { id: "explore", label: "Explore", icon: Compass, hint: "Look around the area", line: "I spend my camp action exploring the area around camp." },
  { id: "investigate", label: "Identify", icon: Search, hint: "Study a magic item", line: "I spend my camp action studying an item to identify it." },
  { id: "decipher", label: "Decipher", icon: BookOpen, hint: "Arcana on writing", line: "I spend my camp action trying to decipher writing I found." },
  { id: "attune", label: "Attune", icon: Sparkles, hint: "Bond with an item", line: "I spend my camp action attuning to a magic item." },
  { id: "mend", label: "Mend", icon: Wrench, hint: "Repair gear", line: "I spend my camp action mending my gear." },
  { id: "trade", label: "Trade", icon: HandCoins, hint: "Only if a merchant came", line: "I spend my camp action trading with the merchant at camp." },
  { id: "level_up", label: "Level up", icon: Shield, hint: "When you have the XP", line: "I spend my camp action to level up." },
  { id: "train", label: "Train", icon: GraduationCap, hint: "Learn a skill from a master", line: "I spend my camp action training." },
  // One button for all three crafts; it opens the menu below (camp doc §16).
  { id: "artifice", label: "Craft", icon: Hammer, hint: "Alchemy, Construct, Artifice", line: "" },
]

const CRAFT_ICON: Record<CraftCategory, LucideIcon> = { alchemy: Flame, construct: Hammer, artifice: Wrench }

const ABILITIES = [
  ["STR", "str"],
  ["DEX", "dex"],
  ["CON", "con"],
  ["INT", "int"],
  ["WIS", "wis"],
  ["CHA", "cha"],
] as const

const signed = (n: number | null | undefined) => {
  const v = Number(n) || 0
  return v >= 0 ? `+${v}` : `${v}`
}

function HpBar({ current, max, className }: { current: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-[#2a2219]", className)} aria-hidden="true">
      <div className={cn("h-full rounded-full", pct > 30 ? "bg-[#c24a3a]" : "bg-[#e0651a]")} style={{ width: `${pct}%` }} />
    </div>
  )
}

function Avatar({ src, name, size = "md" }: { src: string | null | undefined; name: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-9 w-9" : "h-11 w-11"
  return src ? (
    <img src={src} alt="" className={cn(dim, "shrink-0 rounded-full border border-[#7a5f33] object-cover")} style={{ objectPosition: "center 14%" }} />
  ) : (
    <span className={cn(dim, "flex shrink-0 items-center justify-center rounded-full border border-[#7a5f33] bg-[#1d1812] font-serif text-sm text-[#c9a868]")}>
      {name.slice(0, 1)}
    </span>
  )
}

export function CompactDashboard(props: CompactDashboardProps) {
  const { environment, dialogue, selectedCharacter: me, characters, isThinking } = props
  const [tab, setTab] = useState<Tab>("story")
  const [talkOpen, setTalkOpen] = useState(false)
  // Train: pick the teacher, then the skill. Malachar's tag needs both.
  const [trainOpen, setTrainOpen] = useState(false)
  const [trainTeacher, setTrainTeacher] = useState<string | null>(null)
  const [craftOpen, setCraftOpen] = useState(false)
  const logEnd = useRef<HTMLDivElement>(null)

  const recent = useMemo(() => dialogue.slice(-80), [dialogue])

  useEffect(() => {
    if (tab === "story") logEnd.current?.scrollIntoView({ block: "end" })
  }, [recent.length, tab, isThinking])

  const send = (line: string) => {
    props.onQuickReply(line)
    setTab("story")
  }

  const talkTargets = [
    ...characters.filter((c) => c.id !== me?.id).map((c) => ({ id: c.id, name: c.name, img: c.avatar_image_url })),
    ...props.npcEncounters.map((n) => ({ id: n.id, name: n.name, img: n.face_url || n.portrait_url })),
  ]

  const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: "story", label: "Story", icon: BookOpen },
    { id: "camp", label: "Camp", icon: Tent },
    { id: "party", label: "Party", icon: Users },
    { id: "sheet", label: "Sheet", icon: Shield },
  ]

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#0a0806] text-stone-200">
      <header className="flex items-center gap-3 border-b border-[#7a5f33]/50 bg-[#110e0a] px-3 py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-sm text-[#e2c98e]">{environment.name}</h1>
          <p className="truncate text-xs text-stone-400">
            {environment.region} · {environment.timeOfDay}
          </p>
        </div>
        {me && (
          <div className="flex items-center gap-2">
            <div className="flex w-20 flex-col gap-1">
              <span className="text-right text-xs text-stone-300">
                <Heart className="mr-1 inline h-3 w-3 text-[#c24a3a]" aria-hidden="true" />
                {me.hp_current}/{me.hp_max}
              </span>
              <HpBar current={me.hp_current} max={me.hp_max} />
            </div>
            <Avatar src={me.avatar_image_url} name={me.name} size="sm" />
          </div>
        )}
        <button
          type="button"
          onClick={props.onExitCompact}
          aria-label="Switch to the full dashboard"
          className="rounded-sm border border-[#3d3428] p-2 text-stone-400 hover:border-[#c9a868] hover:text-[#e2c98e]"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === "story" && (
          <div className="flex flex-col">
            <div className="relative aspect-[16/7] w-full overflow-hidden border-b border-[#3d3428]">
              <img src={environment.imageUrl || "/placeholder.svg"} alt={environment.name} className="h-full w-full object-cover" />
            </div>
            <ol className="flex flex-col gap-3 px-4 py-4" aria-live="polite">
              {recent.length === 0 && <li className="text-sm text-stone-500">The fire is quiet. Say something.</li>}
              {recent.map((entry, i) => {
                const isDm = entry.speaker === "Malachar"
                const isMe = entry.speaker === me?.name
                return (
                  <li key={entry.id ?? i} className={cn("text-[15px] leading-relaxed", entry.pending && "opacity-60")}>
                    <span className={cn("mr-1.5 font-serif text-xs uppercase tracking-wider", isDm ? "text-[#e0651a]" : isMe ? "text-[#e2c98e]" : "text-[#b9ac93]")}>
                      {entry.speaker}
                    </span>
                    <span className={isDm ? "text-stone-200" : "text-stone-300"}>{entry.text}</span>
                  </li>
                )
              })}
              {isThinking && <li className="text-sm italic text-stone-500">Malachar is considering…</li>}
            </ol>
            <div ref={logEnd} />
          </div>
        )}

        {tab === "camp" && (
          <div className="flex flex-col gap-4 p-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => send("We make camp here for the night.")}
                className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-[#c9a868] px-3 py-3 font-serif text-sm text-[#0a0806] hover:bg-[#e2c98e]"
              >
                <Tent className="h-4 w-4" aria-hidden="true" />
                Make camp
              </button>
              <button
                type="button"
                onClick={() => send("We break camp and move on.")}
                className="flex flex-1 items-center justify-center gap-2 rounded-sm border border-[#7a5f33] px-3 py-3 font-serif text-sm text-[#e2c98e] hover:border-[#c9a868]"
              >
                Break camp
              </button>
            </div>
            <section aria-labelledby="camp-actions-heading" className="flex flex-col gap-2">
              <h2 id="camp-actions-heading" className="font-serif text-xs uppercase tracking-[0.2em] text-[#c9a868]">
                Camp actions
              </h2>
              <p className="text-sm leading-relaxed text-stone-400">
                A full rest gives two actions, a partial rest one. Malachar calls for any roll.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {CAMP_MENU.map((a) => {
                  const notYet = a.id === "artifice" ? undefined : CAMP_ACTIONS_NOT_YET[a.id]
                  const Icon = a.icon
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={!!notYet || isThinking}
                      title={notYet}
                      onClick={() =>
                        a.id === "talk"
                          ? setTalkOpen(true)
                          : a.id === "train"
                            ? (setTrainTeacher(null), setTrainOpen(true))
                            : a.id === "artifice"
                              ? setCraftOpen(true)
                              : send(a.line)
                      }
                      className={cn(
                        "flex items-start gap-2.5 rounded-sm border p-3 text-left transition-colors",
                        a.id === "talk"
                          ? "col-span-2 border-[#e0651a]/60 bg-[#1d130c] hover:border-[#e0651a]"
                          : "border-[#3d3428] bg-[#15110c] hover:border-[#c9a868]",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                      )}
                    >
                      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", a.id === "talk" ? "text-[#e0651a]" : "text-[#c9a868]")} aria-hidden="true" />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-serif text-sm text-[#e2c98e]">{a.label}</span>
                        <span className="text-xs leading-snug text-stone-400">{notYet ? "Not ready yet" : a.hint}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
            {craftOpen && <CraftMenuPanel characterId={me?.id ?? null} onClose={() => setCraftOpen(false)} onCraft={send} busy={!!isThinking} />}
          </div>
        )}

        {tab === "party" && (
          <ul className="flex flex-col gap-2 p-4">
            {characters.map((c) => (
              <li key={c.id} className={cn("flex items-center gap-3 rounded-sm border p-3", c.id === me?.id ? "border-[#7a5f33] bg-[#15110c]" : "border-[#3d3428]")}>
                <Avatar src={c.avatar_image_url} name={c.name} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-serif text-sm text-[#e2c98e]">{c.name}</span>
                    <span className="shrink-0 text-xs text-stone-400">
                      {c.hp_current}/{c.hp_max} HP · AC {c.ac}
                    </span>
                  </div>
                  <HpBar current={c.hp_current} max={c.hp_max} />
                  <span className="text-xs text-stone-500">
                    {c.class} {c.level}
                    {c.conditions?.length ? ` · ${c.conditions.join(", ")}` : ""}
                  </span>
                </div>
              </li>
            ))}
            {props.npcEncounters.length > 0 && (
              <li className="pt-3 font-serif text-xs uppercase tracking-[0.2em] text-[#c9a868]">Nearby</li>
            )}
            {props.npcEncounters.map((n) => (
              <li key={n.id} className="flex items-center gap-3 rounded-sm border border-[#3d3428] p-3">
                <Avatar src={n.face_url || n.portrait_url} name={n.name} size="sm" />
                <span className="flex-1 truncate text-sm text-stone-300">{n.name}</span>
                <button
                  type="button"
                  onClick={() => send(`I go over and talk with ${n.name}.`)}
                  className="rounded-sm border border-[#7a5f33] px-2.5 py-1 text-xs text-[#e2c98e] hover:border-[#c9a868]"
                >
                  Talk
                </button>
              </li>
            ))}
          </ul>
        )}

        {tab === "sheet" && (
          <div className="flex flex-col gap-4 p-4">
            {!me ? (
              <p className="text-sm text-stone-500">No character selected on this device.</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Avatar src={me.avatar_image_url} name={me.name} />
                  <div>
                    <h2 className="font-serif text-base text-[#e2c98e]">{me.name}</h2>
                    <p className="text-xs text-stone-400">
                      {me.class} · Level {me.level} · {me.xp}/{me.xp_to_next} XP
                    </p>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["HP", `${me.hp_current}/${me.hp_max}`],
                    ["AC", me.ac],
                    ["Init", signed(me.initiative)],
                    ["Prof", signed(me.proficiency_bonus)],
                    ["Speed", me.speed ?? "30 ft."],
                    ["Pass. Perc", me.passive_perception],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-sm border border-[#3d3428] bg-[#15110c] p-2">
                      <dt className="text-[11px] uppercase tracking-wider text-stone-500">{label}</dt>
                      <dd className="font-serif text-base text-[#e2c98e]">{value}</dd>
                    </div>
                  ))}
                </dl>
                <dl className="grid grid-cols-6 gap-1.5 text-center">
                  {ABILITIES.map(([label, key]) => (
                    <div key={key} className="rounded-sm border border-[#3d3428] py-2">
                      <dt className="text-[10px] tracking-wider text-stone-500">{label}</dt>
                      <dd className="font-serif text-sm text-stone-200">{me[`${key}_score`]}</dd>
                      <dd className="text-xs text-[#c9a868]">{signed(me[`${key}_modifier`])}</dd>
                    </div>
                  ))}
                </dl>
                {me.conditions?.length ? (
                  <p className="text-sm text-[#e0651a]">Conditions: {me.conditions.join(", ")}</p>
                ) : null}
                <button
                  type="button"
                  onClick={props.onExitCompact}
                  className="rounded-sm border border-[#7a5f33] py-2.5 font-serif text-sm text-[#e2c98e] hover:border-[#c9a868]"
                >
                  Open the full dashboard
                </button>
              </>
            )}
          </div>
        )}
      </main>

      <form
        className="flex items-center gap-2 border-t border-[#3d3428] bg-[#110e0a] px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault()
          props.onDialogueSubmit()
          setTab("story")
        }}
      >
        <label htmlFor="compact-input" className="sr-only">
          Your response or action
        </label>
        <input
          id="compact-input"
          value={props.dialogueInput}
          onChange={(e) => props.setDialogueInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
          }}
          placeholder="What do you do?"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-sm border border-[#3d3428] bg-[#0a0806] px-3 py-2.5 text-base text-stone-200 placeholder:text-stone-500 focus:border-[#c9a868] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!props.dialogueInput.trim() || isThinking}
          aria-label="Send"
          className="rounded-sm bg-[#c9a868] p-2.5 text-[#0a0806] hover:bg-[#e2c98e] disabled:opacity-40"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>

      <nav aria-label="Compact dashboard" className="grid grid-cols-4 border-t border-[#3d3428] bg-[#0d0b08] pb-[env(safe-area-inset-bottom)]">
        {tabs.map((t) => {
          const Icon = t.icon
          const on = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={on ? "page" : undefined}
              className={cn("flex flex-col items-center gap-0.5 py-2.5 text-xs", on ? "text-[#e2c98e]" : "text-stone-500 hover:text-stone-300")}
            >
              <Icon className={cn("h-5 w-5", on && t.id === "camp" && "text-[#e0651a]")} aria-hidden="true" />
              {t.label}
            </button>
          )
        })}
      </nav>

      {trainOpen && (
        <div className="fixed inset-0 z-[300] flex items-end bg-[#0a0806]/70" onClick={() => setTrainOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="train-heading"
            className="flex max-h-[70dvh] w-full flex-col gap-3 rounded-t-lg border-t border-[#7a5f33] bg-[#15110c] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="train-heading" className="font-serif text-sm uppercase tracking-[0.2em] text-[#e2c98e]">
                {trainTeacher ? `Learn from ${trainTeacher}` : "Train with someone"}
              </h2>
              <button type="button" onClick={() => setTrainOpen(false)} aria-label="Close" className="text-stone-400 hover:text-stone-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-stone-400">
              {trainTeacher
                ? "Which skill? They have to be a master of it — Malachar will say if they are not."
                : "An evening of lessons. Enough evenings and the teacher will test you."}
            </p>
            {!trainTeacher ? (
              <ul className="flex flex-col gap-2 overflow-y-auto">
                {talkTargets.length === 0 && <li className="text-sm text-stone-500">Nobody else is at camp.</li>}
                {talkTargets.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTrainTeacher(t.name)}
                      className="flex w-full items-center gap-3 rounded-sm border border-[#3d3428] p-2.5 text-left hover:border-[#c9a868]"
                    >
                      <Avatar src={t.img} name={t.name} size="sm" />
                      <span className="font-serif text-sm text-stone-200">{t.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid grid-cols-2 gap-2 overflow-y-auto">
                {SRD_SKILLS.map((skill) => {
                  const label = skill.replace(/_/g, " ")
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => {
                        setTrainOpen(false)
                        send(`I spend my camp action training with ${trainTeacher} in ${label}.`)
                      }}
                      className="rounded-sm border border-[#3d3428] p-2.5 text-left font-serif text-sm capitalize text-stone-200 hover:border-[#c9a868]"
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {talkOpen && (
        <div className="fixed inset-0 z-[300] flex items-end bg-[#0a0806]/70" onClick={() => setTalkOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="talk-heading"
            className="flex max-h-[70dvh] w-full flex-col gap-3 rounded-t-lg border-t border-[#7a5f33] bg-[#15110c] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="talk-heading" className="font-serif text-sm uppercase tracking-[0.2em] text-[#e2c98e]">
                Talk by the fire
              </h2>
              <button type="button" onClick={() => setTalkOpen(false)} aria-label="Close" className="text-stone-400 hover:text-stone-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="flex flex-col gap-2 overflow-y-auto">
              {talkTargets.length === 0 && <li className="text-sm text-stone-500">Nobody else is at camp.</li>}
              {talkTargets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTalkOpen(false)
                      send(`I spend my camp action sitting with ${t.name} by the fire and talking.`)
                      props.onTalkStart?.(t.name)
                    }}
                    className="flex w-full items-center gap-3 rounded-sm border border-[#3d3428] p-2.5 text-left hover:border-[#e0651a]"
                  >
                    <Avatar src={t.img} name={t.name} size="sm" />
                    <span className="font-serif text-sm text-stone-200">{t.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The crafting menu (camp doc §16). Sam, 27 Sep 2026: "a list (Alchemy,
// Construct, Artifice). Options available light up if you have the
// proficiency and items." What lights an option is lib/camp `craftMenu`; this
// only draws it. Until the crafting roll is wired, a lit option says so
// rather than offering a button that would cost nothing and make nothing.
// ---------------------------------------------------------------------------

function CraftMenuPanel({
  characterId,
  onClose,
  onCraft,
  busy,
}: {
  characterId: string | null
  onClose: () => void
  onCraft: (line: string) => void
  busy: boolean
}) {
  const [category, setCategory] = useState<CraftCategory>("alchemy")
  const [menu, setMenu] = useState<CraftMenu | null>(null)
  const [error, setError] = useState<string | null>(null)
  const notYet = CAMP_ACTIONS_NOT_YET.artifice

  useEffect(() => {
    if (!characterId) return
    let live = true
    setError(null)
    fetch(`/api/camp/craft-menu?characterId=${encodeURIComponent(characterId)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        const body = (await r.json()) as { menu?: CraftMenu }
        if (live) setMenu(body.menu ?? null)
      })
      .catch(() => live && setError("The crafting list could not be read."))
    return () => {
      live = false
    }
  }, [characterId])

  const options = menu?.[category] ?? []

  return (
    <section aria-labelledby="craft-menu-heading" className="flex flex-col gap-3 rounded-sm border border-[#7a5f33] bg-[#110e0a] p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="craft-menu-heading" className="font-serif text-xs uppercase tracking-[0.2em] text-[#c9a868]">
          Craft
        </h2>
        <button type="button" onClick={onClose} aria-label="Close the crafting list" className="rounded-sm p-1 text-stone-400 hover:text-[#e2c98e]">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div role="tablist" aria-label="Kind of craft" className="grid grid-cols-3 gap-1">
        {CRAFT_CATEGORIES.map((c) => {
          const Icon = CRAFT_ICON[c]
          const lit = menu?.[c].filter((o) => o.available).length ?? 0
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-sm border px-2 py-2 font-serif text-xs",
                category === c ? "border-[#c9a868] bg-[#1d1812] text-[#e2c98e]" : "border-[#3d3428] text-stone-400 hover:border-[#7a5f33]",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {CRAFT_CATEGORY_LABEL[c]}
              {lit > 0 && <span className="rounded-full bg-[#c9a868] px-1.5 text-[10px] leading-4 text-[#0a0806]">{lit}</span>}
            </button>
          )
        })}
      </div>

      {!characterId && <p className="text-sm text-stone-400">Choose your character to see what you can make.</p>}
      {error && <p className="text-sm text-[#e0651a]">{error}</p>}
      {characterId && !menu && !error && <p className="text-sm text-stone-400">Reading your pack…</p>}
      {menu && options.length === 0 && (
        <p className="text-sm leading-relaxed text-stone-400">
          No {CRAFT_CATEGORY_LABEL[category]} recipes in the catalog yet.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {options.map((o) => (
          <li
            key={o.itemId}
            className={cn(
              "flex flex-col gap-1 rounded-sm border p-3",
              o.available ? "border-[#c9a868] bg-[#1d1812] shadow-[0_0_12px_rgba(201,168,104,0.25)]" : "border-[#3d3428] opacity-50",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("font-serif text-sm", o.available ? "text-[#e2c98e]" : "text-stone-300")}>{o.name}</span>
              <span className="shrink-0 text-xs text-stone-400">{o.materialsGp} gp materials</span>
            </div>
            <span className="text-xs text-stone-400">
              {o.available ? o.tool : o.tools}
              {o.dc != null && ` · DC ${o.dc}`}
              {o.advantage && ` · advantage (${o.advantage})`}
              {o.checks != null && ` · ${o.checks} good hour${o.checks === 1 ? "" : "s"}`}
            </span>
            {o.progress && (
              <span className="text-xs text-[#c9a868]">
                Under way: {o.progress.successes} of {o.progress.checks} done — materials already paid.
              </span>
            )}
            {o.available ? (
              notYet ? (
                <span className="text-xs text-[#c9a868]">Ready — the crafting roll is coming soon.</span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onCraft(
                      `I spend my camp action ${o.progress ? "working on" : "crafting"} ${o.name} with my ${o.tool}.` +
                        (o.advantage ? ` My ${o.advantage} training gives me advantage on the roll.` : ""),
                    )
                  }
                  className="mt-1 self-start rounded-sm bg-[#c9a868] px-3 py-1.5 font-serif text-xs text-[#0a0806] hover:bg-[#e2c98e] disabled:opacity-40"
                >
                  {o.progress ? "Keep working" : "Craft"}
                </button>
              )
            ) : (
              <ul className="flex flex-col gap-0.5">
                {o.missing.map((m) => (
                  <li key={m} className="text-xs text-stone-400">
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
