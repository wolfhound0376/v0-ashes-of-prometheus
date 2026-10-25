// The stage director: what the narration DID to the room, when Malachar wrote it in prose and forgot the tag.
//
// Sam, 2026-10-25: "The pixel NPCs (especially drow guards/jorlan) MUST match the story. If there is a guard
// rotation then they must perform a change. If they leave it unattended they all MUST be gone… The pixel art
// NPCs in the pen MUST behave like their narration. If one is talking to you they should be near."
//
// The map draws exactly the stage roster (lib/stage-roster.ts), and the roster is written only from tags. Tags
// are the contract and stay the contract — but a reply that says "the guards trudge off toward the tower and the
// bridge stands empty" with no tag leaves two drow standing on the bridge, and that is the bug Sam saw. So after
// every reply a small, cheap pass (Haiku, the State Extractor tier of Layer 1) reads the narration against the
// roster and returns only what HAPPENED in it, as the same stage events the tags make. Anything the reply
// already tagged wins and is not touched; the pass only fills gaps.
//
// What it may say, and nothing else:
//   watch     the outpost's watch: "changing" (one watch hands over to the next), "unattended" (nobody at the
//             posts), "posted" (guards back at their posts)
//   gate      the pen gate: "unlocked", "open", "locked" — done to it in this narration, by anyone
//   moves     someone in the cast changes position ("at the bars", "on the bridge", "beside Fifi")
//   leaves    someone walks out of the party's sight (never a death: deaths need damage tags)
//   approaches someone comes over to a character to talk → a move to "beside <character>"
//
// It never invents a creature (names are resolved against the cast it is shown, unknown names are dropped),
// never reads a plan, an offer or a threat as a fact ("at the next change I will leave it unlocked" is
// nothing), and never kills anyone.

import { gateStateOf, slugOf, watchStateOf, type GateState, type StageEvent, type WatchState } from "@/lib/stage-roster"

export type DirectorCast = { name: string; aliases?: string[] }
export type DirectorInput = {
  narration: string
  cast: DirectorCast[]                 // who may be moved: the stage roster plus the area's own story cast
  characters: string[]                 // the player characters, by the names the narration uses
  watch: WatchState | null
  gate: GateState | null
}
/** What the reply already settled with its own tags; the director leaves those alone. */
export type AlreadyTagged = { names: Set<string>; watch: boolean; gate: boolean }

/** Worth a pass at all: there is prose, and either someone on stage or a word about the watch or the gate. */
export function wantsDirector(input: DirectorInput): boolean {
  const t = input.narration.trim()
  if (t.length < 40) return false
  if (input.cast.length) return true
  return /\b(guard|guards|watch|shift|relief|post|gate|door|bars|jorlan)\b/i.test(t)
}

export function directorPrompt(input: DirectorInput): string {
  return `You read one turn of narration from a D&D game and report what physically HAPPENED in the room in it, so a map can show it.

NARRATION:
"""
${input.narration.slice(0, 6000)}
"""

CAST IN THE AREA (use these exact names): ${JSON.stringify(input.cast.map((c) => c.name))}
PLAYER CHARACTERS: ${JSON.stringify(input.characters)}
THE WATCH RIGHT NOW: ${input.watch ?? "posted (assumed)"}
THE PEN GATE RIGHT NOW: ${input.gate ?? "locked (assumed)"}

Report ONLY what happens in this narration, now. NOT plans, offers, promises, threats, warnings, memories, rumours,
questions or anything said in dialogue about the future: "at the next shift change I will leave it unlocked" is NOTHING.
Things a character only says are nothing unless the narration shows them happen.

Return ONLY strict JSON, nothing else:
{"watch": null | "changing" | "unattended" | "posted",
 "gate": null | "unlocked" | "open" | "locked",
 "moves": [{"name": "<cast name>", "where": "<short place: at the bars | on the bridge | on the landing | at the tower | inside the pen>"}],
 "leaves": ["<cast name>"],
 "approaches": [{"name": "<cast name>", "to": "<player character name>"}]}

- watch "changing": the guards hand over to a relief watch (shift change, relief arrives, the watch rotates).
- watch "unattended": the posts are left empty — the guards and the gatekeeper are gone from sight, nobody watches the pen.
- watch "posted": guards are back at their posts after they had gone.
- gate: only when the gate is actually unlocked, opened or locked in this narration.
- moves: a cast member walks somewhere in the area. Not someone who merely looks, speaks or gestures.
- leaves: a cast member walks out of sight (off the bridge, round the corner, away to the tower). Never a death.
- approaches: a cast member comes over to a player character, sits beside them, leans close to talk to them.
- Leave a field null or [] when nothing of that kind happens. When in doubt, leave it out.`
}

function resolveCast(raw: unknown, cast: DirectorCast[]): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  const s = slugOf(raw)
  for (const c of cast) {
    const names = [c.name, ...(c.aliases ?? [])].map(slugOf)
    if (names.includes(s)) return c.name
  }
  // a first name ("Jorlan") for "Jorlan Duskryn", only when exactly one cast member answers to it
  const first = cast.filter((c) => [c.name, ...(c.aliases ?? [])].some((n) => slugOf(n).split("-")[0] === s.split("-")[0] && s.split("-")[0].length > 2))
  return first.length === 1 ? first[0].name : null
}
function resolveCharacter(raw: unknown, characters: string[]): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  const s = slugOf(raw)
  const hit = characters.filter((c) => slugOf(c) === s || slugOf(c).split("-")[0] === s.split("-")[0])
  return hit.length === 1 ? hit[0] : null
}

/** The model's JSON (or garbage) → stage events, minus whatever the reply already tagged. Never throws. */
export function parseDirector(reply: string, input: DirectorInput, tagged: AlreadyTagged): StageEvent[] {
  let j: any
  try {
    const t = String(reply || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    const a = t.indexOf("{"), b = t.lastIndexOf("}")
    if (a < 0 || b <= a) return []
    j = JSON.parse(t.slice(a, b + 1))
  } catch { return [] }
  if (!j || typeof j !== "object") return []
  const out: StageEvent[] = []
  const taken = new Set([...tagged.names].map(slugOf))
  const free = (name: string) => !taken.has(slugOf(name))
  if (!tagged.watch && typeof j.watch === "string") {
    const w = watchStateOf(j.watch)
    // "posted" when it is already posted says nothing; a change is always news
    if (w && (w === "changing" || w !== (input.watch ?? "posted"))) out.push({ kind: "watch", state: w })
  }
  if (!tagged.gate && typeof j.gate === "string") {
    const g = gateStateOf(j.gate)
    if (g && g !== (input.gate ?? "locked")) out.push({ kind: "gate", state: g })
  }
  const seen = new Set<string>()
  for (const m of Array.isArray(j.approaches) ? j.approaches : []) {
    const name = resolveCast(m?.name, input.cast), to = resolveCharacter(m?.to, input.characters)
    if (!name || !to || !free(name) || seen.has(name)) continue
    seen.add(name); out.push({ kind: "place", name, where: `beside ${to}` })
  }
  for (const m of Array.isArray(j.moves) ? j.moves : []) {
    const name = resolveCast(m?.name, input.cast)
    const where = typeof m?.where === "string" ? m.where.trim().slice(0, 80) : ""
    if (!name || !where || !free(name) || seen.has(name)) continue
    seen.add(name); out.push({ kind: "place", name, where })
  }
  for (const raw of Array.isArray(j.leaves) ? j.leaves : []) {
    const name = resolveCast(raw, input.cast)
    if (!name || !free(name) || seen.has(name)) continue
    seen.add(name); out.push({ kind: "leave", name, dead: false })
  }
  return out
}

/** Names the reply's own tags already placed, moved, brought on or took off — the director must not overrule them. */
export function namesTaggedIn(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(/\[(?:NPC_MOVE|NPC_LEAVE|NPC_ENCOUNTER|NPC_WANTS_WORD):\s*([^|\]]+)/gi)) out.add(m[1].trim())
  return out
}
