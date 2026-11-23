/**
 * WHAT THE COMPANY SAYS ON THE PIXEL ROAD.
 *
 * Sam, 2026-11-23: "Occasionally the NPCs should offer help, speak up about something, suggest rest, etc."
 *
 * Three kinds of remark, dealt once per stretch of road for the companions actually walking with the party:
 *   rest    one of them asks to stop, and ONLY when the day's march says so: the fatigue gauge's own bands
 *           (lib/travel/march.ts `fatigue`: weary from the sixth hour, spent at eight, forced past it).
 *   advice  where to go. WHAT each knows is the book's (GUIDES, OotA D&D Encounters ch.2 p.22) and the words are
 *           the ones lib/npc-advice.ts already has; nobody the book calls useless offers a direction.
 *   help    an offer of a hand on the march, in their own voice.
 *
 * WHOSE THESE ARE. The fatigue bands and the guides are the book's. The chances (0.3 before each one's own lean, the
 * same base lib/npc-advice.ts gives a stranger), the cap of two voices beside a rest (its MAX_ADVICE), and every
 * `rest` and `help` line below are CLAUDE'S DRAFTS, not book text: Sam's to rewrite.
 *
 * NOT YET RULES: a `help` line is talk. It gives no bonus on the road until Sam says what it should buy.
 * Pure: no network, no clock. The map deals them (components/map/underdark-map-module.tsx) and the road page only
 * shows what it is handed.
 */
import { fatigue, MARCH_HOURS_PER_DAY } from "@/lib/travel/march"
import { ADVISERS, adviceLine, adviceNote, guideFor, MAX_ADVICE } from "@/lib/npc-advice"
import { COMPANION_NAMES } from "@/lib/camp-roster"

export type RoadRemarkKind = "rest" | "advice" | "help"
export interface RoadRemark {
  /** the companion's sprite slug */
  who: string
  name: string
  kind: RoadRemarkKind
  line: string
  /** the rule behind the words, for the small print under them */
  note: string | null
}

export const ROAD_REMARK_CHANCE = 0.3

/** Drafts in each one's voice, not book text. `{you}` is how they address the leader. */
const REST_LINES: Readonly<Record<string, string>> = {
  eldeth: "A dwarf knows when the legs are done, {you}. We should make camp.",
  derendil: "Forgive me, {you}. Even a prince must rest. Shall we stop?",
  jimjar: "I'll wager nobody here makes another mile standing, {you}. Camp?",
  ront: "Ront is not tired. The small ones are tired. Stop, {you}.",
  sarith: "Tired feet are loud feet, {you}. Rest, before something hears us.",
  shuushar: "The body is a vessel, {you}, and ours are near empty. Let us be still a while.",
  buppido: "So tired, friend {you}. Buppido will keep watch while you all sleep. Oh yes.",
  topsy: "Turvy's dragging. So am I. Can we stop, {you}?",
  turvy: "Mm. Stop, {you}. Stop now.",
  stool: "(Stool's spores drift low and slow. It is very tired, {you}.)",
}
const HELP_LINES: Readonly<Record<string, string>> = {
  eldeth: "Put me beside whoever is finding the way, {you}. I can't name these tunnels, but I can read the stone.",
  derendil: "If anyone flags, {you}, I will carry them. It is no burden.",
  jimjar: "I'll take the rear and count heads, {you}. Five gold says I spot trouble before it spots us.",
  ront: "Give Ront the heavy pack, {you}. Ront does not get tired.",
  sarith: "Stay close where the tunnel forks, {you}. I will say which way.",
  shuushar: "I will listen for water as we go, {you}. Here it all runs one way.",
  buppido: "Buppido can walk in front, {you}. Buppido sees very well in the dark.",
  topsy: "Something ahead smells wrong, {you}. I'll tell you if it gets worse.",
  turvy: "Mm. I'll sniff ahead, {you}.",
  stool: "(A drift of spores. Stool wants to help, {you}, and is not sure how.)",
}
/** Who asks for the halt first, when several walk with the party. */
const REST_ORDER = ["eldeth", "derendil", "jimjar", "sarith", "shuushar", "topsy", "ront", "turvy", "buppido", "stool"]

const say = (line: string, you: string) => line.replace("{you}", you)
const nameOf = (slug: string) => COMPANION_NAMES[slug] ?? slug

/** The rest remark the day's hours call for, or null while the party is fresh or walks alone. */
export function restRemark(companions: readonly string[], hoursToday: number, you: string): RoadRemark | null {
  const f = fatigue(hoursToday)
  if (f.band === "fresh") return null
  const who = REST_ORDER.find((s) => companions.includes(s) && REST_LINES[s])
  if (!who) return null
  const h = Math.round(f.hours * 10) / 10
  const note = f.band === "forced"
    ? `${h} hours on the road: a forced march. The next hour asks a DC ${f.nextDc} Constitution save.`
    : f.band === "spent"
      ? `${h} hours on the road: the day's ${MARCH_HOURS_PER_DAY} are walked. Further is a forced march.`
      : `${h} of the day's ${MARCH_HOURS_PER_DAY} hours walked.`
  return { who, name: nameOf(who), kind: "rest", line: say(REST_LINES[who], you), note }
}

/**
 * The remarks for one stretch of road. A rest remark comes first when the hours call for one; then at most
 * MAX_ADVICE other voices, each companion speaking at most once.
 */
export function roadRemarks(o: { companions: readonly string[]; hoursToday: number; you: string; rand: () => number }): RoadRemark[] {
  const you = o.you.trim() || "friend"
  const out: RoadRemark[] = []
  const rest = restRemark(o.companions, o.hoursToday, you)
  if (rest) out.push(rest)
  const others: RoadRemark[] = []
  for (const slug of [...new Set(o.companions)]) {
    if (!(slug in COMPANION_NAMES) || slug === rest?.who) continue
    const adviser = ADVISERS.find((a) => a.key === slug) ?? null
    const guide = guideFor(slug)
    const knowsARoad = !!guide && guide.familiarWith !== "none"
    // a direction, from those the book says know one
    if (adviser && knowsARoad && o.rand() < Math.max(0, Math.min(0.95, ROAD_REMARK_CHANCE + adviser.lean))) {
      others.push({ who: slug, name: nameOf(slug), kind: "advice", line: adviceLine(adviser, you, o.rand()), note: adviceNote(guide) })
      continue
    }
    if (HELP_LINES[slug] && o.rand() < ROAD_REMARK_CHANCE) {
      others.push({ who: slug, name: nameOf(slug), kind: "help", line: say(HELP_LINES[slug], you), note: slug === "eldeth" ? adviceNote(guide) : null })
    }
  }
  // which two are heard: drawn, not first-come
  while (others.length > MAX_ADVICE) others.splice(Math.min(others.length - 1, Math.floor(o.rand() * others.length)), 1)
  return [...out, ...others]
}
