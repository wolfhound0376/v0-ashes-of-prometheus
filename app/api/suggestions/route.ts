import { NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { capBait, dropAbsent, ensureObserveChip, parseSuggestions, publicSuggestions, type Suggestion } from "@/lib/suggestions"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadMoment } from "@/lib/moment-store"
import { knownNames, momentBrief } from "@/lib/moment"
import { bankMayAnswer, bankSet, parseBank } from "@/lib/option-bank"

// Same direct-Anthropic provider as /api/chat — bypasses the Vercel AI Gateway.
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Per-player action suggestions. (PR-3)
 *
 * Given the latest exchange (narration + NPC lines, oldest first), who the
 * character is talking to, and ONE character's sheet summary, ask Haiku
 * (extraction-flavored work — deliberately not Opus) for 2–4 diegetic action
 * suggestions. The client renders them as chips; clicking one sends the text
 * as that player's message through the normal player-message path.
 *
 * Cost note: the game caps at four players and each browser generates only for
 * its own selected character, so a narration beat costs at most four calls.
 *
 * Failure mode is always an empty list with HTTP 200 — the dashboard falls
 * back to its static quick replies and the table never sees an error.
 *
 * WHOSE OPTIONS, AND WHY EACH ONE (Sam, 2026-11-23: "Malachar's options he gives you are in tune with what is
 * happening at that exact moment. They MUST all be Germaine or misleading in some way but ON PURPOSE … This is the
 * case with all main NPCs." Design: project doc claude/Malachar_Options_2026-11-23.md, PR 1 of 3.)
 *   - THE MOMENT (lib/moment.ts) is read from the game, not guessed from talk: the hero's plate, a fight on it, a
 *     roll they owe, who is actually with them, who they are talking to. The talk is cut to the last 3 lines.
 *   - THE AUTHOR is the NPC being talked to when they have an Agent Card, otherwise Malachar. Every option is either
 *     GERMANE (answers the exact moment) or BAIT (a real, attemptable option the author wants taken because it is
 *     worse than it looks; at most one). Bait never names a thing that is not there and is never impossible.
 *   - The intent tags never reach a player: publicSuggestions() strips them. They are kept in suggestion_sets,
 *     which is also the cache: one set per (beat, hero), so a reload or a second screen pays nothing.
 *   - A chip that names someone who is not with the hero is dropped (dropAbsent) after the model answers.
 *   - FILES FIRST (PR 2): the author's option bank (npc_agents.option_bank, lib/option-bank.ts) answers routine
 *     beats with no model call; the model is called only when a player has just spoken or the bank is too thin.
 *     suggestion_sets.source says which ("bank" or "model"), so the saving shows on The Cast.
 */

interface SuggestionPayload {
  character?: {
    name?: string
    class?: string
    level?: number
    skills?: string | null
    conditions?: string[] | null
  }
  inventory?: string[]
  sceneText?: string
  /** Who the character is in conversation with, if anyone. */
  talkingTo?: string | null
  /** Named NPCs who just spoke or are on stage. */
  present?: string[]
  location?: string
  /** The beat this set answers (the latest DM-or-NPC row) and the hero it is for: the cache key. */
  beatKey?: string | null
  characterId?: string | null
  /** {action:"picked"}: the player took one of the chips (the audit of bait taken). */
  action?: string
  text?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const cleanName = (value: unknown): string | null =>
  typeof value === "string" ? value.replace(/[^\p{L}\s'’-]/gu, "").trim().slice(0, 60) || null : null

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SuggestionPayload
    const characterId = typeof body.characterId === "string" && UUID.test(body.characterId) ? body.characterId : null
    const beatKey = typeof body.beatKey === "string" ? body.beatKey.slice(0, 200) : null
    if (body.action === "picked") {
      if (characterId && beatKey && typeof body.text === "string") {
        try { await createAdminClient().from("suggestion_sets").update({ picked: body.text.slice(0, 120) }).eq("beat_key", beatKey).eq("character_id", characterId) } catch { /* audit only */ }
      }
      return NextResponse.json({ ok: true })
    }
    let db: ReturnType<typeof createAdminClient> | null = null
    try { db = createAdminClient() } catch { db = null }
    if (db && characterId && beatKey) {
      const { data: cached } = await db.from("suggestion_sets").select("suggestions").eq("beat_key", beatKey).eq("character_id", characterId).maybeSingle()
      if (cached && Array.isArray(cached.suggestions) && cached.suggestions.length) {
        return NextResponse.json({ suggestions: publicSuggestions(cached.suggestions as Suggestion[]) })
      }
    }
    const character = body.character
    const sceneText = (body.sceneText ?? "").trim()
    if (!character?.name || !character?.class || !sceneText) {
      return NextResponse.json({ suggestions: [] })
    }

    const items = Array.isArray(body.inventory)
      ? body.inventory.filter((name): name is string => typeof name === "string" && !!name.trim()).slice(0, 25)
      : []
    const conditions = Array.isArray(character.conditions) ? character.conditions.filter(Boolean) : []
    const talkingTo = cleanName(body.talkingTo)
    const present = Array.isArray(body.present)
      ? body.present.map(cleanName).filter((name): name is string => !!name).slice(0, 8)
      : []
    if (talkingTo && !present.includes(talkingTo)) present.unshift(talkingTo)

    // THE MOMENT, from the game (lib/moment.ts). Who is with the hero comes from the walk when it knows; the
    // client's list (names in the recent talk) only fills in when the walk has no row for this hero.
    const { moment, cards } = db ? await loadMoment(db, { characterId, talkingTo }) : { moment: null, cards: [] }
    const here = moment && moment.plate ? moment.present : present
    const author = moment?.author ?? { name: "Malachar" }
    const isMalachar = author.name.toLowerCase().startsWith("malachar")
    // The talk is cut to its last 3 lines: the moment carries the rest, and stale lines are what made old chips stale.
    const lastLines = sceneText.split("\n").slice(-3).join("\n").slice(-900)

    // FILES FIRST (lib/option-bank.ts; Sam, 2026-11-23: "agentic AI intelligence for things that are required,
    // otherwise from informational files to save tokens"). The author's option bank answers the beat with no model
    // call when the beat is routine (no player line just answered) and the bank has enough options for THIS moment.
    const keep = async (set: Suggestion[], source: "bank" | "model") => {
      if (!(db && characterId && beatKey)) return
      // Kept with its intent tags for the DM (The Cast) and as the cache for this beat. Best-effort.
      try {
        await db.from("suggestion_sets").upsert(
          { beat_key: beatKey, character_id: characterId, author: author.name, moment: moment ?? {}, suggestions: set, source },
          { onConflict: "beat_key,character_id", ignoreDuplicates: true },
        )
      } catch (e) { console.error("[suggestions] keep failed:", e) }
    }
    if (moment) {
      const card = cards.find((c) => c.key === moment.authorKey)
      const bank = parseBank(card?.option_bank)
      if (bank.length && bankMayAnswer(sceneText, knownNames(cards))) {
        const fromBank = bankSet(bank, { ...moment, present: here }, { items, conditions }, moment.presentKeys, beatKey ?? sceneText)
        const lawful = fromBank ? dropAbsent(fromBank, knownNames(cards, present), here) : null
        if (lawful && lawful.filter((x) => x.kind !== "observe").length >= 2) {
          await keep(lawful, "bank")
          return NextResponse.json({ suggestions: publicSuggestions(lawful) })
        }
      }
    }

    // === FILMED MOMENTS ===
    // Some actions in a location have a cinematic shot for them. A player can
    // only reach one by DOING the thing, and until now they had to guess the
    // words — the film existed but nothing pointed at it.
    //
    // So the cue names are handed to the suggester as SUBJECT MATTER, not as
    // buttons. It renders them into ordinary in-character actions; the player
    // picks one; Malachar narrates it and emits the cue himself. The chip is
    // fiction the whole way down, which is Sam's standing rule (18 Aug 2026):
    // the camera cue belongs inside the fiction as something the character
    // does, never a meta-button bolted on beside it.
    //
    // Deliberately NOT filtered by what this character has already seen. A
    // filmed action is a good action either way, and filtering would turn the
    // chip row into a content checklist that empties as the scene is explored.
    let filmedMoments: string[] = []
    if (body.location) {
      try {
        const admin = createAdminClient()
        const { data: key } = await admin.rpc("scene_key", { p_name: body.location })
        if (key) {
          const { data: rows } = await admin
            .from("cinematic_clips")
            .select("state")
            .eq("kind", "action")
            .eq("scene_key", key as string)
            .not("state", "is", null)
            .not("video_url", "is", null)
            .gt("weight", 0)
          filmedMoments = Array.from(
            new Set((rows || []).map((r: { state: string | null }) => (r.state || "").trim()).filter(Boolean)),
          )
        }
      } catch (e) {
        // Chips must never fail on account of film. No list simply means the
        // suggester works exactly as it did before this feature existed.
        console.error("[suggestions] filmed-moment lookup failed:", e)
      }
    }

    const filmedBlock = filmedMoments.length
      ? `
LAST, AND ONLY IF IT COSTS NOTHING: some moments here have film shot for them —
${filmedMoments.join(", ")} — hyphenated shorthand for things a character can do
(e.g. "sharpen-shard" is working an edge onto a shard).

This list is the lowest priority in this prompt and it is USUALLY IGNORED.
Consider it only after you already have a full set of real options, and use it
only if one of them is ALREADY among the strongest things this character would
plausibly do in the scene as described. Never bend a suggestion toward this
list, never crowd out a better option for it, never offer more than one, and
never let it override the rules above. The scene decides; this list does not.
If the scene has moved somewhere these no longer make sense, ignore it entirely.
When you do use one, write it as ordinary in-character speech — never the
shorthand, never any hint that something is filmed.`
      : ""

    const motive = isMalachar
      ? `You are Malachar, the lich who runs this world. You want these mortals dead or broken, you are bound by the rules of 5E and you never lie about the world.`
      : `You are choosing these options as ${author.name} would lay them out, because ${author.name} is the one in front of the hero.${author.wants ? ` ${author.name} wants ${author.wants}.` : ""}${author.fears ? ` Fears ${author.fears}.` : ""}${author.turns ? ` ${author.turns}.` : ""}${author.secret ? ` What ${author.name} hides (never state it; let it shape the bait): ${author.secret}.` : ""}`

    const prompt = `${motive}

You write the options ONE hero sees right now in a D&D 5e game in the Underdark (Out of the Abyss). They are the hero's own actions, said as the player would say them.

Return ONLY a JSON array, no prose, of 3 to 4 entries shaped:
  {"text": "...", "skill": "..." | null, "observe": true | false, "bait": true | false}

THE LAW OF THESE OPTIONS. Every entry is one of two things, and nothing else:
- GERMANE ("bait": false): it answers THIS exact moment. The last thing said, to the one who said it, in the place the hero is standing, with what the hero carries. If a fight is on, it is about the fight. If a roll is waiting, it is about that roll.
- BAIT ("bait": true): a real option the hero can truly attempt, laid on the table ON PURPOSE because ${isMalachar ? "you" : author.name} want${isMalachar ? "" : "s"} it taken and it is worse than it looks: the trusting answer to someone who should not be trusted, the shortcut that costs more, the gift that disarms them. It must still fit the moment exactly. At most ONE bait, and only when there is a reason for it here; a set with no bait is fine.
- Filler is forbidden: an option that is neither germane to this moment nor deliberate bait does not belong.
- Never lie about the world. Bait works by what it tempts, never by naming a person, item, door or way out that is not there. Never an option the hero cannot actually attempt.
- Nothing in the wording may reveal which option is bait. Do not make the safe option look wise or the bait look dangerous.

THE MOMENT (from the game; trust this over the talk):
${moment ? momentBrief({ ...moment, present: here }) : `Here with the hero: ${here.join(", ") || "no one named"}.\nTalking to: ${talkingTo ?? "no one in particular"}.`}
Never direct an option at anyone not listed above as here.

${talkingTo ? `${character.name} is talking to ${talkingTo}. At least two options answer ${talkingTo}'s LAST line directly: answer, press, read, bargain, lie, refuse, walk away.` : "Answer whoever last spoke to the hero, if anyone did."}

The hero: ${character.name}, ${character.class} ${character.level ?? 1}. Proficient in: ${character.skills || "none recorded"}. Conditions: ${conditions.length ? conditions.join(", ") : "none"} (a manacled hero cannot walk away). Carrying: ${items.length ? items.join(", ") : "nothing but rags"} (never an item they do not carry).

The last words (oldest first; "Narration" is the DM):
${lastLines}

Form:
- Genuinely different options, not three phrasings of one idea.
- EXACTLY ONE is an observation (looking around, studying what is here) with "observe": true, in the hero's voice; it is never bait.
- "text" is 60 characters or fewer, no dice, no rules words. "skill" is the one most relevant 5e skill, spell or ability, or null.
${filmedBlock}`

    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      messages: [{ role: "user", content: prompt }],
    })

    // ensureObserveChip is the backstop: if the model ignored the observe rule
    // the deterministic chip is appended anyway. The look-around action is a
    // load-bearing game mechanic (it is what plays a location's cinematic), so
    // its presence is guaranteed here rather than left to the model.
    // The law, enforced after the model: no chip about someone who is not here, at most one bait.
    const parsed = capBait(dropAbsent(parseSuggestions(result.text), knownNames(cards, present), here))
    // An empty parse must stay empty: the client reads [] as "generation
    // failed" and falls back to the four static chips, which carry their own
    // look-around. Returning a lone observe chip here would replace that whole
    // fallback row with a single button.
    if (!parsed.length) return NextResponse.json({ suggestions: [] })
    const set = ensureObserveChip(parsed)
    await keep(set, "model")
    return NextResponse.json({ suggestions: publicSuggestions(set) })
  } catch (error) {
    console.error("[suggestions] generation failed:", error)
    return NextResponse.json({ suggestions: [] })
  }
}
