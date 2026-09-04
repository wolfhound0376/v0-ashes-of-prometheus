/**
 * WHO THE PLAYER JUST SPOKE TO.
 *
 * Sam asked the pen, in as many words: "what do you think eldeth". Malachar
 * answered in her voice — "Three minutes. Maybe four if Gorvan stops to
 * scratch himself" — and the line was filed as NARRATOR, with no npc_id and
 * no voice_id, so the dwarf's answer came out of the Lich's mouth.
 *
 * The segmenter is a Haiku call, and its prompt already carries the right
 * instruction: an unattributed quote "is almost always the NPC the player most
 * recently addressed ... Prefer that NPC over NARRATOR." It still said
 * NARRATOR. The likely reason is the shape of the ask: the roster holds
 * "Eldeth Feldrun" and the player typed a bare lowercase "eldeth", so the
 * model would not commit.
 *
 * This is not a thing to ask a model twice. It is a string match, and a string
 * match is free, deterministic, and testable. Whoever was named in the
 * player's own message is known before the model is ever called.
 */

export interface RosterNpc {
  id?: string
  name: string
  aliases?: string[] | null
}

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim()

/**
 * Every way a player might reasonably name this NPC: the full name, each word
 * of it long enough to be distinctive, and any alias already recorded.
 *
 * "Feldrun" counts as much as "Eldeth" — a table uses surnames too. Short
 * fragments do not: "the" out of "the Awakened" would match every sentence
 * ever typed, and three letters is the floor at which a name stops being a
 * name. That is why Stool, at five, still works and a two-letter alias
 * would not.
 */
/**
 * Words that are a ROLE or a SPECIES, never a name.
 *
 * "Drow Guard" would otherwise contribute "guard", and every sentence about a
 * guard walking past would be read as somebody addressing him. Same for the
 * "Spider" in Giant Spider and the "Prince" in Prince Derendil — the part that
 * identifies him is Derendil. The full name still matches in every case; only
 * the generic HALF is refused.
 */
const NOT_A_NAME = new Set([
  "the", "of", "and", "a", "an",
  "prince", "princess", "king", "queen", "lord", "lady", "sir", "captain", "master",
  "guard", "guards", "warrior", "elite", "priestess", "priest", "soldier", "sentry",
  "spider", "horror", "hook", "ooze", "gray", "grey", "giant", "awakened",
  "drow", "dwarf", "gnome", "orc", "goblin", "quaggoth", "myconid", "kuo-toa",
])

export function namesFor(npc: RosterNpc): string[] {
  const out = new Set<string>()
  const full = clean(npc.name)
  if (full) out.add(full)
  for (const w of full.split(" ")) if (w.length >= 4 && !NOT_A_NAME.has(w)) out.add(w)
  for (const a of npc.aliases ?? []) {
    const c = clean(String(a ?? ""))
    if (c.length >= 4) out.add(c)
  }
  return [...out]
}

/**
 * The NPC this message speaks to, or null.
 *
 * LONGEST MATCH WINS, so "Eldeth Feldrun" beats a bare "Eldeth" and a message
 * naming two NPCs resolves to the more specific one rather than whichever the
 * roster happened to list first.
 *
 * Returns null when two DIFFERENT NPCs are named equally well: "ask Jimjar and
 * Eldeth" is a question to the room, and guessing one of them would put words
 * in the wrong mouth — which is the whole failure this exists to prevent.
 */
export function addressedNpc(message: string | null | undefined, roster: RosterNpc[]): string | null {
  const text = clean(String(message ?? ""))
  if (!text || !roster?.length) return null
  const hay = ` ${text} `
  let best: { name: string; len: number } | null = null
  let tie = false
  for (const npc of roster) {
    for (const n of namesFor(npc)) {
      if (!hay.includes(` ${n} `)) continue
      if (!best || n.length > best.len) { best = { name: npc.name, len: n.length }; tie = false }
      else if (n.length === best.len && npc.name !== best.name) tie = true
    }
  }
  return best && !tie ? best.name : null
}
