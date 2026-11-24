/**
 * THE CAST — the DM's page for each agent's whole package (Sam, 2026-11-23: "I want an artifact or module where I
 * can deal with the agents with their knowledge, abilities, character aspects and actor aspects, files repository,
 * video files, pixel art, (essentially the whole package)"). Page: app/dm/cast/page.tsx; route: app/api/cast.
 *
 * This file holds the parts that are rules rather than reads, so they can be tested (lib/cast.test.ts):
 *   - what each agent can DO in the game today, read from the code that does it (npc-help, npc-advice, npc-asks)
 *     plus the PRs Sam asked for, so the list is never a wish list;
 *   - where their files live in storage, and how an uploaded file is named.
 * Pure: no Supabase.
 */
import { HELPERS, helperKey, type HelpKind } from "@/lib/npc-help"
import { adviserFor } from "@/lib/npc-advice"
import { askerFor } from "@/lib/npc-asks"

export interface Ability { what: string; from: string }

const HELP_WORDS: Record<HelpKind, string> = {
  lock: "picks a lock with you (Help: advantage)",
  "trap-find": "spots traps with you",
  "trap-disarm": "disarms a trap with you, if the party has the kit",
  eyes: "a second pair of eyes on Perception/Investigation (Help)",
  might: "lends strength on Athletics/Strength (Help)",
  words: "carries meaning on Persuasion/Insight (Help)",
}

/** Built behaviour, keyed by agent: what the game already does with them, and the PR that did it. */
const BUILT: Record<string, Ability[]> = {
  malachar: [
    { what: "Runs every Parley turn: narration, rulings, NPC voices (the inline tag protocol)", from: "app/api/chat" },
    { what: "Commands named NPCs' fight turns (one line, inside the legal options)", from: "/api/npc-mind" },
    { what: "Talk to Malachar: the DM-only box from the map, mood loops, red eyes when angry", from: "PRs #1218, #1232" },
    { what: "Terse lich voice and word cap", from: "PRs #1230, #1430, #1431" },
  ],
  eldeth: [{ what: "Triumph pose after a hard kill", from: "PR #1228" }, { what: "Hungry-night brawl with Ront", from: "PR #1414" }],
  ront: [
    { what: "Rage (bonuses, red tint)", from: "PR #1223" },
    { what: "Triumph pose after a hard kill", from: "PR #1228" },
    { what: "Starts the hungry-night brawl with Eldeth", from: "PR #1414" },
  ],
  derendil: [
    { what: "Rage (bonuses, red tint)", from: "PR #1223" },
    { what: "Triumph pose after a hard kill", from: "PR #1228" },
    { what: "Rages on hungry nights", from: "PR #1414" },
  ],
  jimjar: [{ what: "Guide's advice at the outpost's exits (Blingdenstone)", from: "PR #1234" }],
  sarith: [],
  buppido: [
    { what: "Ledge shove on the rope bridge and the cliff (calls it an accident)", from: "PR #1408" },
    { what: "Rises as a zombie wherever he dies", from: "PRs #1142, #1408" },
    { what: "Goes after a sleeping hero on hungry nights", from: "PR #1414" },
  ],
  jorlan: [
    { what: "Named fight AI: picks attacks, calls for help, commands guards", from: "/api/npc-mind" },
    { what: "Arrives with the 2nd or 3rd watch; gives and keeps his word to unlock the pen", from: "PRs #1270, #1324" },
  ],
}

/** Everything this agent can do in the game, from the code. */
export function abilitiesOf(key: string, name: string): Ability[] {
  const out: Ability[] = [...(BUILT[key] ?? [])]
  const hk = helperKey(name)
  if (hk) for (const k of HELPERS[hk].kinds) out.push({ what: `Helps on checks: ${HELP_WORDS[k]}`, from: "lib/npc-help.ts (PRs #1231, #1411)" })
  if (adviserFor(name)) out.push({ what: "Speaks up with advice on where to go, if inclined", from: "lib/npc-advice.ts (PR #1234)" })
  const asker = askerFor(name)
  if (asker) out.push({ what: `Asks heroes for ${asker.wants.join(", ")} (${asker.temper})`, from: "lib/npc-asks.ts (PR #1193)" })
  return out
}

// --- files ---------------------------------------------------------------------------------------------------------

export const BUCKET = "vtt-assets"
/** Each agent's own shelf for whatever Sam drops in. */
export const agentFolder = (key: string) => `agents/${key}`
/** Folders where the game already keeps character media; searched by the agent's names. */
export const MEDIA_FOLDERS = ["character-loops", "character-stills", "portraits", "cinematics", "heroes", "character-refs", "tokens", "narration"] as const

/** The words to look for in storage names ("Eldeth Feldrun" → eldeth, feldrun; "Prince Derendil" → derendil). */
export function searchWords(name: string, aliases: string[] = []): string[] {
  const skip = new Set(["prince", "the", "lady", "lord"])
  const words = new Set<string>()
  for (const n of [name, ...aliases]) for (const w of n.toLowerCase().split(/[^a-z]+/)) if (w.length >= 3 && !skip.has(w)) words.add(w)
  return [...words]
}

/** A safe storage name for an upload: lower-case, no paths, extension kept, timestamped so nothing is overwritten. */
export function uploadPath(key: string, filename: string, now = Date.now()): string | null {
  const base = String(filename || "").split(/[\\/]/).pop() ?? ""
  const m = base.match(/^(.*?)(\.[a-z0-9]{1,6})?$/i)
  const stem = (m?.[1] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
  const ext = (m?.[2] ?? "").toLowerCase()
  if (!stem || !/^[a-z][a-z0-9-]{1,30}$/.test(key)) return null
  return `${agentFolder(key)}/${now}-${stem}${ext}`
}

export type FileKind = "image" | "video" | "audio" | "doc" | "other"
export function fileKind(path: string): FileKind {
  const ext = path.toLowerCase().split(".").pop() ?? ""
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image"
  if (["mp4", "webm", "mov"].includes(ext)) return "video"
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio"
  if (["md", "txt", "pdf", "json", "docx"].includes(ext)) return "doc"
  return "other"
}
