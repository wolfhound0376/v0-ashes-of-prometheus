// Quests — the journal IS the quest log.
//
// Design of record: docs/claude_Journal_Sections.md (2026-09-29), §10 build
// order step 4. Sam: "Quests accepted automatically get journaled into the
// Quest section." This is that, and it is the first section to be wired
// because it is the only one that needs no consent window — accepting the
// quest WAS the consent.
//
// Pure, like lib/journal and lib/journal-sections. No Supabase, no React.
//
// WHY THERE IS NO `quests` TABLE
//
// There was no quest system in this project at all before this file: no table,
// no tag, and a "Quests" nav button that opens the generic World AI panel
// (AGENTS.md open work). The obvious move was a quests table. The better move
// is that a quest log IS a journal — Sam's design already says quests file
// into the journal's `quests` section, and a second store would immediately
// disagree with the first about what the party is doing.
//
// APPEND-ONLY, BECAUSE A JOURNAL IS A RECORD
//
// `journal_entries` has no UPDATE policy: a committed page is permanent
// (components/dashboard/journal-pages.tsx says so, and it is the right rule).
// So a quest that is later finished does NOT rewrite its own page. It writes a
// second one. You do not erase a diary; you write "done" underneath, and the
// crossing-out is part of the story. `questLog` folds the pages back into
// current state.
//
// That also means a stolen journal shows the thief the whole arc of what the
// party set out to do and how much of it they finished — which is exactly the
// kind of thing lib/journal's disclosure rules were built to make cost
// something.
//
// SOURCES:
//   Sam, 2026-09-29  Quests file automatically, with no prompt.
//   Repo            The [CAMP_ACTION: a | b | c] pipe convention; the
//                   permanence rule on journal pages.
//
// Everything Sam did not rule is flagged at runtime.

import { DEFAULT_VISIBILITY, type JournalAuthor, type JournalVisibility } from "./journal"
import type { JournalSection } from "./journal-sections"

// ============================================================================
// §1 THE TAG
// ============================================================================
//
// `[QUEST: <state> | <title> | <the note>]`, matching the pipe form
// `[CAMP_ACTION: who | action | args]` already uses. The note is optional on a
// resolution: "complete | Find Sarith's brother" is a whole sentence.

export const QUEST_TAG_RE = /\[QUEST:\s*([^\]|]+?)\s*\|\s*([^\]|]+?)\s*(?:\|\s*([^\]]*?))?\s*\]/gi

/** Every tag stripped from player-facing text and speech. */
export const QUEST_STRIP_RE = /\[QUEST:[^\]]*\]/gi

/**
 * What can happen to a quest.
 *
 * Sam ruled only on ACCEPTING. The other three are mine — a log that only ever
 * grows is a to-do list nobody can finish, and the whole point of a quest
 * section is being able to see what is still open. Flagged at runtime.
 */
export const QUEST_STATES = ["accepted", "completed", "failed", "abandoned"] as const
export type QuestState = (typeof QUEST_STATES)[number]

/** States that close a quest. */
export const RESOLVED_STATES: ReadonlySet<QuestState> = new Set<QuestState>(["completed", "failed", "abandoned"])

const STATE_ALIASES: Record<string, QuestState> = {
  accept: "accepted", accepted: "accepted", take: "accepted", taken: "accepted", start: "accepted", started: "accepted", begin: "accepted", new: "accepted",
  complete: "completed", completed: "completed", done: "completed", finish: "completed", finished: "completed", success: "completed",
  fail: "failed", failed: "failed", lost: "failed", blown: "failed",
  abandon: "abandoned", abandoned: "abandoned", drop: "abandoned", dropped: "abandoned", quit: "abandoned", refuse: "abandoned", refused: "abandoned",
}

/** "accept" / "Done" / "gave up" → the state, or null. */
export function normaliseQuestState(raw: string): QuestState | null {
  const key = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")
  return STATE_ALIASES[key] ?? ((QUEST_STATES as readonly string[]).includes(key) ? (key as QuestState) : null)
}

export interface QuestTag {
  state: string
  title: string
  note: string | null
}

/** Every [QUEST: …] in a reply, in order, at most eight. */
export function parseQuestTags(text: string): QuestTag[] {
  const re = new RegExp(QUEST_TAG_RE.source, "gi")
  const out: QuestTag[] = []
  for (const m of (text ?? "").matchAll(re)) {
    const note = (m[3] ?? "").trim()
    out.push({ state: m[1].trim(), title: m[2].trim(), note: note || null })
    if (out.length >= 8) break
  }
  return out
}

export function stripQuestTags(text: string): string {
  return (text ?? "").replace(new RegExp(QUEST_STRIP_RE.source, "gi"), "")
}

// ============================================================================
// §2 THE KEY — how two pages know they are the same quest
// ============================================================================
//
// Pages are append-only (see the header), so "Find Sarith's brother" accepted
// on day one and completed on day nine are two rows that must fold together.
// The link is a slug of the title, which survives Malachar capitalising it
// differently, adding "the", or changing the punctuation — all of which he
// will do, because he is writing prose, not filling in a form.

const STOP_WORDS = new Set(["the", "a", "an", "of", "for", "to", "and"])

/**
 * "Find Sarith's Brother!" and "find the brother of Sarith" → the same key.
 *
 * Two things here were bugs the tests caught, and both are fixed in the key
 * rather than in the assertion:
 *
 * 1. POSSESSIVES. Stripping the apostrophe first turned "Sarith's" into
 *    "sariths", which never matches the "Sarith" in a reworded title. The
 *    possessive is removed as a unit, before punctuation.
 * 2. STOP WORDS CAN EAT A TITLE WHOLE. A quest called "A" or "The End"
 *    filtered down to nothing and got no key, so it could not be tracked at
 *    all. If dropping stop words empties the title, they are kept — a short
 *    title is still a title.
 */
export function questKey(title: string): string {
  const cleaned = (title ?? "")
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  if (!cleaned) return ""
  const all = cleaned.split(/\s+/).filter(Boolean)
  const meaningful = all.filter((w) => !STOP_WORDS.has(w))
  const words = meaningful.length ? meaningful : all
  if (!words.length) return ""
  return words.slice().sort().join("-")
}

// ============================================================================
// §3 FILING A QUEST
// ============================================================================

/** What the tags column carries on a quest page. */
export interface QuestTags {
  kind: "quest"
  key: string
  state: QuestState
  title: string
}

export interface QuestFiling {
  section: JournalSection
  author: JournalAuthor
  visibility: JournalVisibility
  title: string
  body: string
  tags: QuestTags
}

export interface QuestDecision {
  file: QuestFiling | null
  flags: string[]
  note: string
}

/**
 * One [QUEST] tag into one journal page.
 *
 * Never asks. Sam: quests file automatically, because accepting the quest was
 * the consent and a second prompt is a second door on the same room.
 *
 * The author is `malachar` because the system wrote this page from a tagged
 * event, not the player — the same rule the [JOURNAL] tag already follows.
 * Visibility is `private`: a quest is the character's own business until they
 * show someone, and the disclosure rules in lib/journal decide the rest.
 */
export function decideQuest(input: {
  tag: QuestTag
  /** Quests already in this character's book, for the duplicate checks. */
  open?: readonly QuestSummary[]
}): QuestDecision {
  const state = normaliseQuestState(input.tag.state)
  const title = (input.tag.title ?? "").trim()
  const key = questKey(title)

  if (!state) return { file: null, flags: [], note: `"${input.tag.state}" is not a quest state — nothing filed.` }
  if (!title || !key) return { file: null, flags: [], note: "a quest with no title cannot be tracked — nothing filed." }

  const flags: string[] = []
  if (state !== "accepted") {
    flags.push("only 'accepted' is Sam's ruling; completed/failed/abandoned are proposed and need his yes")
  }

  const existing = (input.open ?? []).find((q) => q.key === key)
  if (state === "accepted" && existing && !existing.resolved) {
    return { file: null, flags, note: `"${existing.title}" is already open — not filed twice.` }
  }
  if (state !== "accepted" && !existing) {
    // Resolving something never accepted. File it anyway: the page is the
    // record, and refusing would lose the event entirely. But say so.
    flags.push(`no accepted page for "${title}" — filing the resolution anyway so the event is not lost`)
  }
  if (state !== "accepted" && existing?.resolved) {
    return { file: null, flags, note: `"${existing.title}" was already ${existing.state} — not filed twice.` }
  }

  const body = input.tag.note?.trim() || defaultBody(state, title)

  return {
    file: {
      section: "quests",
      author: "malachar",
      visibility: DEFAULT_VISIBILITY,
      title,
      body,
      tags: { kind: "quest", key, state, title },
    },
    flags,
    note: `${title} — ${state}`,
  }
}

/** When Malachar gives a bare tag, the page still has to say something. */
function defaultBody(state: QuestState, title: string): string {
  switch (state) {
    case "accepted":
      return `Took this on: ${title}.`
    case "completed":
      return `Finished it: ${title}.`
    case "failed":
      return `This one got away from me: ${title}.`
    case "abandoned":
      return `Let this one go: ${title}.`
  }
}

// ============================================================================
// §4 FOLDING THE PAGES BACK INTO A LOG
// ============================================================================

export interface QuestSummary {
  key: string
  /** The title as first written. Later pages may phrase it differently. */
  title: string
  state: QuestState
  resolved: boolean
  acceptedAt: string | null
  resolvedAt: string | null
  /** Every page about this quest, oldest first. */
  pages: number
}

/** A stored page, narrowed to what the fold reads. */
export interface QuestPage {
  section: string
  title?: string | null
  tags?: unknown
  created_at: string
}

function readQuestTags(v: unknown): QuestTags | null {
  if (!v || typeof v !== "object") return null
  const t = v as Record<string, unknown>
  if (t.kind !== "quest") return null
  const state = typeof t.state === "string" ? normaliseQuestState(t.state) : null
  const key = typeof t.key === "string" ? t.key : ""
  if (!state || !key) return null
  return { kind: "quest", key, state, title: typeof t.title === "string" ? t.title : "" }
}

/**
 * Every quest in the book, current state first-class.
 *
 * Ordered by `created_at`, which is the only honest order — the same rule
 * lib/journal's `compileJournal` follows, and for the same reason: the
 * in-world date is a free-text label and may be null or out of sequence.
 *
 * The LAST page about a quest wins, so a quest completed and then somehow
 * reopened reads as open. That is deliberate: the most recent thing written
 * down is what the character believes.
 */
export function questLog(pages: readonly QuestPage[]): QuestSummary[] {
  const byKey = new Map<string, QuestSummary>()
  const ordered = pages
    .filter((p) => p.section === "quests")
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))

  for (const p of ordered) {
    const t = readQuestTags(p.tags)
    if (!t) continue
    const existing = byKey.get(t.key)
    if (!existing) {
      byKey.set(t.key, {
        key: t.key,
        title: t.title || p.title || "(untitled)",
        state: t.state,
        resolved: RESOLVED_STATES.has(t.state),
        acceptedAt: t.state === "accepted" ? p.created_at : null,
        resolvedAt: RESOLVED_STATES.has(t.state) ? p.created_at : null,
        pages: 1,
      })
      continue
    }
    existing.pages += 1
    existing.state = t.state
    existing.resolved = RESOLVED_STATES.has(t.state)
    if (t.state === "accepted") {
      existing.acceptedAt ??= p.created_at
      existing.resolvedAt = null
    } else {
      existing.resolvedAt = p.created_at
    }
  }

  // Open quests first, then most recently touched.
  return [...byKey.values()].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
    const at = a.resolvedAt ?? a.acceptedAt ?? ""
    const bt = b.resolvedAt ?? b.acceptedAt ?? ""
    return at < bt ? 1 : at > bt ? -1 : 0
  })
}

export function openQuests(pages: readonly QuestPage[]): QuestSummary[] {
  return questLog(pages).filter((q) => !q.resolved)
}

// ============================================================================
// §5 THE PROMPT
// ============================================================================

export const QUEST_EXAMPLE = "[QUEST: accept | Find Sarith's brother | Sarith says his brother was taken east, past the fungi. He did not say why he thinks he is alive.]"

/** The entry for the STRUCTURED TAGS catalogue. */
export const QUEST_TAG_RULES = `QUESTS:
- [QUEST: <state> | <title> | <the note>] — when a quest is taken on, finished, lost or let go
  - States: accept, complete, fail, abandon. The note is optional on anything but accept.
  - Emit ACCEPT the moment a character agrees to do something for someone, or sets themselves a goal out loud. An offer nobody accepted is not a quest.
  - The TITLE is how everyone will refer to it forever, so keep it short and concrete: "Find Sarith's brother", not "The Matter of the Missing Kin".
  - Use the SAME title when you close it as when you opened it.
  - The note is the character's own record of what was asked and what they made of it — first person, a few lines, the way they would write it down.
  - It files itself. Never mention the tag, never tell them their journal updated, and never ask whether they want it recorded.
  - Example: ${QUEST_EXAMPLE}`

export interface QuestBlockState {
  open: QuestSummary[]
  /** Quests closed since the last time he was told. */
  recentlyClosed?: QuestSummary[]
}

/**
 * The QUESTS section of Malachar's prompt, or "" when there is nothing to say.
 *
 * This exists so he cannot offer a quest the party already took, or narrate
 * someone asking for help with something they finished last session — the
 * commonest way an AI DM breaks continuity, and one the system can simply
 * prevent by telling him what is on the books.
 */
export function formatQuestBlock(s: QuestBlockState): string {
  const parts: string[] = []
  if (s.open.length) {
    parts.push(
      `OPEN (do not offer these again, and do not have anyone ask for them as though they were new):\n` +
        s.open.map((q) => `- ${q.title}`).join("\n"),
    )
  }
  if (s.recentlyClosed?.length) {
    parts.push(
      `CLOSED (finished or lost — refer back to them freely; people remember):\n` +
        s.recentlyClosed.map((q) => `- ${q.title} (${q.state})`).join("\n"),
    )
  }
  if (!parts.length) return ""
  return `════════════════════════════════════════════════════════════════════
QUESTS (facts from the system — the party's own record, not your invention)
════════════════════════════════════════════════════════════════════
${parts.join("\n\n")}`
}
