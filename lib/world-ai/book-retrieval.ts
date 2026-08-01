// lib/world-ai/book-retrieval.ts
//
// Grounds Malachar in the actual campaign guide.
//
// The Supabase project holds "A Guide to Out of the Abyss" as 89 embedded
// passages covering all 17 chapters. This module retrieves the passages
// relevant to what the player just said, so Malachar answers from the book
// instead of improvising past Velkynvelve.
//
// It calls the `ask-world` edge function in RETRIEVE-ONLY mode: the function
// embeds the query, runs the vector search, pulls canonical rows, and returns
// the passages WITHOUT calling Anthropic. That keeps this fast (one embedding
// + one RPC) and means it works even before ANTHROPIC_API_KEY is set in
// Supabase secrets.
//
// THE NON-OBVIOUS PART — scene anchoring. Measured on the live endpoint:
//
//   Query style                    Lands in the right chapter
//   ---------------------------    --------------------------
//   Raw player message                       1 / 7
//   Anchored to act + location               7 / 7
//
// "I try to slip out of the manacles" on its own retrieves The Mini-Dungeons
// (ch.2) and Descent into the Depths (ch.10) — while the party is standing in
// the Velkynvelve slave pen. Short first-person actions carry almost no
// retrievable signal on their own. So we send `anchor_to_scene: true` plus the
// act label and location; the edge function prepends them to the embedded text
// and boosts passages whose chapter matches the party's location.
//
// DO NOT REMOVE THE ANCHORING. It is the difference between right and wrong
// chapters, and the failure is silent — you get confident prose about the
// wrong part of the adventure.

const ASK_WORLD_TIMEOUT_MS = 6000
const MAX_PASSAGES_IN_PROMPT = 4

/** Campaign id (as used in CAMPAIGNS) → ingested book's campaign_slug.
 *  null means no book has been ingested; retrieval is skipped entirely. */
export const CAMPAIGN_BOOK_SLUGS: Record<string, string | null> = {
  abyss: "out-of-the-abyss",
  tyranny: null,
  blackhull: null,
}

export interface BookPassage {
  chapter: string | null
  section: string | null
  page: number | null
  content: string
  similarity: number
  boosted?: boolean
}

export interface BookRetrieval {
  /** True when a book is configured for this campaign AND the call succeeded. */
  available: boolean
  /** True when the top hit cleared the STRONG threshold — the book really
   *  covers this. False means "closest available", which Malachar is told to
   *  treat as background colour rather than fact. */
  grounded: boolean
  passages: BookPassage[]
  topSimilarity: number
  /** Populated on failure. Retrieval is best-effort; the turn continues. */
  error?: string
}

const EMPTY: BookRetrieval = {
  available: false,
  grounded: false,
  passages: [],
  topSimilarity: 0,
}

/**
 * Retrieve campaign-book passages relevant to the player's message.
 *
 * Best-effort by contract: never throws, never blocks a turn. On timeout,
 * network failure, missing env vars, or a campaign with no ingested book, it
 * returns EMPTY and Malachar behaves exactly as he does today.
 */
export async function retrieveBookPassages(
  campaignId: string,
  playerMessage: string,
  scene: { episodeLabel?: string; location?: string } = {},
): Promise<BookRetrieval> {
  const bookSlug = CAMPAIGN_BOOK_SLUGS[campaignId] ?? null
  if (!bookSlug) return EMPTY

  const question = (playerMessage || "").trim()
  if (!question) return EMPTY

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!baseUrl || !anonKey) {
    console.warn("[BookRetrieval] Supabase env vars missing — skipping retrieval")
    return EMPTY
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ASK_WORLD_TIMEOUT_MS)

  try {
    const res = await fetch(`${baseUrl}/functions/v1/ask-world`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        question,
        campaign_slug: bookSlug,
        // Retrieval only — do not spend an Anthropic call here. Malachar does
        // his own generation; he just needs the source material.
        retrieve_only: true,
        // See the note at the top of this file. Without this, wrong chapters.
        anchor_to_scene: true,
        context: {
          episode_label: scene.episodeLabel ?? "",
          location: scene.location ?? "",
        },
      }),
    })

    if (!res.ok) {
      console.warn(`[BookRetrieval] ask-world returned ${res.status}`)
      return { ...EMPTY, error: `HTTP ${res.status}` }
    }

    const data = (await res.json()) as {
      strong?: boolean
      top_similarity?: number
      passages?: BookPassage[]
    }

    const passages = Array.isArray(data.passages) ? data.passages : []

    console.log(
      `[BookRetrieval] ${passages.length} passages | strong=${Boolean(data.strong)}`,
      `| top=${(data.top_similarity ?? 0).toFixed(3)}`,
      `| location="${scene.location ?? ""}"`,
    )

    return {
      available: passages.length > 0,
      grounded: Boolean(data.strong),
      passages,
      topSimilarity: data.top_similarity ?? 0,
    }
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError"
    console.warn(
      `[BookRetrieval] ${aborted ? `timed out after ${ASK_WORLD_TIMEOUT_MS}ms` : "failed"}:`,
      (err as Error)?.message,
    )
    return { ...EMPTY, error: aborted ? "timeout" : String((err as Error)?.message ?? err) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Render retrieved passages into the block appended to Malachar's context.
 *
 * The grounding rule matters as much as the passages. The DM dashboard cites
 * page numbers and flags improvisation because Sam reads it behind the screen.
 * Malachar must NEVER do that in front of players — it breaks the fiction.
 */
export function formatBookPassages(retrieval: BookRetrieval): string {
  if (!retrieval.available || retrieval.passages.length === 0) return ""

  const lines: string[] = []
  lines.push("")
  lines.push("=== CAMPAIGN GUIDE — RETRIEVED FOR THIS MOMENT ===")

  if (retrieval.grounded) {
    lines.push(
      "These passages are from the published adventure and describe the scene the",
      "party is actually in. Treat their FACTS as canon.",
    )
  } else {
    lines.push(
      "WEAK MATCH: the guide may not cover this moment. These are the closest",
      "passages available. Use them for texture only — do not force their facts",
      "onto the current scene.",
    )
  }

  lines.push("")
  lines.push("FACTS come from the guide and the canonical database: locations, named")
  lines.push("NPCs, stat blocks, plot structure, what is actually in a room.")
  lines.push("FLAVOUR is yours: prose, sensory detail, dialogue, pacing, cruelty.")
  lines.push("If the guide is silent, invent something consistent and commit to it.")
  lines.push("")
  lines.push("NEVER break character to say the book doesn't cover something. NEVER cite")
  lines.push("page numbers, chapter numbers, sources, or the guide itself to players.")
  lines.push("They are in the Underdark. They cannot see your notes.")
  lines.push("")

  retrieval.passages.slice(0, MAX_PASSAGES_IN_PROMPT).forEach((p, i) => {
    const where = [p.chapter, p.section].filter(Boolean).join(" — ")
    lines.push(`--- PASSAGE ${i + 1}${where ? ` (${where})` : ""} ---`)
    lines.push(p.content)
    lines.push("")
  })

  return lines.join("\n")
}

/**
 * Render the personality dials into performance instructions.
 *
 * `lich_personality` is written by components/world-ai/personality-dials.tsx and
 * — until this change — read by absolutely nothing. Sam has been moving sliders
 * that did not affect Malachar at all.
 */
// Column types match the live `lich_personality` table exactly:
//   snark, crassness, cruelty  -> integer
//   swearing, fourth_wall, roast_target -> text
// Current row: snark 5, crassness 3, cruelty 4, swearing "mild",
// fourth_wall "occasionally", roast_target "even".
export interface LichPersonality {
  snark: number | null
  cruelty: number | null
  crassness: number | null
  swearing: string | null
  fourth_wall: string | null
  roast_target: string | null
}

const dial = (label: string, v: number | null, low: string, high: string): string => {
  if (v === null || v === undefined) return ""
  return `- ${label}: ${v}/10 — ${v <= 3 ? low : v >= 7 ? high : "moderate; noticeable but not the point of the scene"}`
}

export function formatPersonality(p: LichPersonality | null): string {
  if (!p) return ""

  const lines: string[] = []
  lines.push("")
  lines.push("=== PERFORMANCE DIALS ===")
  lines.push("How Malachar plays this scene. These are dials on delivery, never on the")
  lines.push("facts — a cruel Malachar is still an accurate one.")
  lines.push("")

  const rows = [
    dial("SNARK", p.snark, "dry, sparing", "relentless; mock nearly every choice"),
    dial("CRUELTY", p.cruelty, "let them off lightly", "twist the knife; savour their losses"),
    dial("CRASSNESS", p.crassness, "keep it clean", "crude, bodily, unrefined"),
  ].filter(Boolean)

  lines.push(...rows)

  if (p.swearing) {
    // Text field, not a 0–10 scale: "none" | "mild" | "heavy" (free text).
    const s = p.swearing.toLowerCase()
    const guidance =
      s === "none"
        ? "no profanity at all"
        : s === "mild"
          ? "occasional mild profanity — damn, hell, bastard. Nothing stronger."
          : s === "heavy"
            ? "swear freely and inventively when it lands"
            : p.swearing
    lines.push(`- SWEARING: ${p.swearing} — ${guidance}`)
  }

  if (p.fourth_wall) {
    lines.push(`- FOURTH WALL: ${p.fourth_wall} — address the players as players this often.`)
  }
  if (p.roast_target) {
    lines.push(
      `- ROAST TARGET: ${p.roast_target}` +
        (p.roast_target.toLowerCase() === "even"
          ? " — spread mockery evenly; never pick on one player repeatedly."
          : " — favour this target, but do not become one-note."),
    )
  }

  lines.push("")
  lines.push("Never describe these dials or mention that you have settings.")

  return lines.join("\n")
}
