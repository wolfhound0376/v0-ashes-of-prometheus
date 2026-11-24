/**
 * MALACHAR'S BARGAIN: the words he speaks when he steps out of his portal (the visit, public/velkynvelve-walk
 * "MALACHAR VISITS"), and the two answers the party chooses between.
 *
 * Sam, 2026-11-23: he comes "when the party does too well and he wants to offer a difficult option", and, asked what
 * "too well" means: "At the end of each ACT". So at an Act's end the map asks /api/malachar-offer for the bargain, and
 * the DM can ask for a draft by hand from DM tools.
 *
 * What the model may and may not do. A bargain is narration, which is Malachar's (AGENTS.md: "facts are canon, flavour
 * is the AI's"), but its terms are where invention would creep in. So:
 *   - he may offer and demand only people and things the map named for this moment (the heroes, who is with them,
 *     where they stand) and what happened in the Act's own story lines; nothing new is named;
 *   - no game words (hit points, levels, checks, rolls, spell slots): he is a lich, not a DM (Sam, 2026-11-10);
 *   - short: Sam (2026-11-17) "when Malachar speaks he's not talking too much";
 *   - the price is real and the gain is real, but what either costs in play is ruled after the answer, by Malachar's
 *     next turn and the DM. Nothing here awards or takes anything.
 * Pure: the prompt and the parser. The route (app/api/malachar-offer) does the I/O.
 */

export const OFFER_WORD_CAP = 40
export const ANSWER_WORD_CAP = 7
export const STORY_LINES = 30

export interface OfferInput {
  act: number
  actLabel: string
  where: string
  heroes: string[]
  others: string[]
  story: string[]
  /** his NPC-agent card brief (memories of this run, the DM's coaching); may be empty */
  brief: string
}

export interface Offer { words: string; accept: string; refuse: string }

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean)
const capWords = (s: string, n: number) => { const w = words(s); return w.length <= n ? w.join(" ") : w.slice(0, n).join(" ").replace(/[,;:]$/, "") + "…" }
const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().replace(/^["“'‘]+|["”'’]+$/g, "") : "")

/** The task, after his persona. `act` 0 means a visit the DM calls mid-Act. */
export function offerPrompt(i: OfferInput): string {
  const when = i.act > 0
    ? `${i.actLabel || `Act ${i.act}`} is ending: the party has come through it. That is why you come now, in person, through your portal.`
    : `The party is doing too well. That is why you come now, in person, through your portal.`
  const list = (xs: string[]) => (xs.length ? xs.join(", ") : "(none named)")
  return `${when}
You step out before them and offer ONE bargain: something they badly want, at a price that hurts. It must be a real choice. Accepting must cost them; refusing must cost them too, or leave them worse placed. You never say why you want them broken.

WHERE: ${i.where || "the Underdark"}
THE HEROES: ${list(i.heroes)}
OTHERS HERE: ${list(i.others)}
WHAT HAPPENED (their story, oldest first):
${i.story.length ? i.story.map((l) => `- ${l}`).join("\n") : "- (nothing recorded)"}
${i.brief ? `\n${i.brief}\n` : ""}
RULES FOR THE BARGAIN
- Use only the people, places and things named above. Name no new person, place, item, spell or creature.
- No game words: never hit points, levels, checks, rolls, rests, slots, damage or turns.
- You speak it yourself, terse and cold, at most ${OFFER_WORD_CAP} words. Offer and price both in it.
- Then two answers the PARTY could say, each at most ${ANSWER_WORD_CAP} words: the first accepts, the second refuses.

Reply with only JSON: {"words": "...", "accept": "...", "refuse": "..."}`
}

/** The model's reply, held to the caps; null when it is unusable. */
export function parseOffer(text: string | null | undefined): Offer | null {
  if (!text) return null
  const m = String(text).match(/\{[\s\S]*\}/)
  if (!m) return null
  let j: Record<string, unknown>
  try { j = JSON.parse(m[0]) } catch { return null }
  const w = clean(j.words), a = clean(j.accept), r = clean(j.refuse)
  if (!w || !a || !r || a.toLowerCase() === r.toLowerCase()) return null
  if (/\b(hit points?|hp|level(s|ed)? up|saving throw|ability check|roll(s|ed)?|spell slots?|short rest|long rest|initiative)\b/i.test(w)) return null
  return { words: capWords(w, OFFER_WORD_CAP), accept: capWords(a, ANSWER_WORD_CAP), refuse: capWords(r, ANSWER_WORD_CAP) }
}

/** Short, plain lines for the prompt: trimmed, deduped, the newest STORY_LINES kept, oldest first. */
export function storyFor(lines: string[]): string[] {
  const seen = new Set<string>(), out: string[] = []
  for (const l of lines) { const t = String(l || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 220); if (t && !seen.has(t)) { seen.add(t); out.push(t) } }
  return out.slice(-STORY_LINES)
}
