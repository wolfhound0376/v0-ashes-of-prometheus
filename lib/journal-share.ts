// Sharing a page — "clicking it gives the option to share it to someone".
//
// Sam, 2026-09-29. Design of record: docs/claude_Journal_Sections.md §3.
//
// Pure, like the rest of the journal modules. No Supabase, no React.
//
// WHAT SHARING ACTUALLY IS
//
// Not a permission grant. `journal_entries` rows belong to one character, and
// there is no UPDATE policy — a committed page is permanent. So sharing does
// not reach into someone else's book and change who may read a row. It writes
// a COPY into the recipient's own journal, marked `import`, carrying where it
// came from.
//
// That is also the truer thing. A character who is shown a recipe writes it
// down; they do not acquire a viewing right over someone else's diary. And
// because the copy is their own page, it can later be stolen from THEM — which
// is how a secret actually spreads.
//
// The original is not rewritten either. Its visibility moves outward through
// lib/journal's `disclose`, which already refuses to walk backward and already
// treats `found` as terminal.
//
// SOURCES:
//   Sam, 2026-09-29  "When an entry is highlighted clicking it gives the
//                    option to share it to some one."
//   Repo            author='import' already exists on the table and already
//                    renders as "transcribed" in the dashboard; the Jimjar
//                    rule (AGENTS.md §8) keys NPC knowledge by name.

import { DEFAULT_VISIBILITY, disclose, type JournalAuthor, type JournalVisibility } from "./journal"
import { SECTION_LABEL, checkGate, unlockFor, type GateSheet, type JournalSection, type UnlockKind } from "./journal-sections"

// ============================================================================
// §1 WHO CAN BE SHARED WITH
// ============================================================================

export type ShareTargetKind = "character" | "npc"

export interface ShareTarget {
  kind: ShareTargetKind
  /** A character's id, or an NPC's NAME — NPC canon is keyed by name. */
  id: string
  /** Display name, for the note and for the copied page's provenance. */
  name: string
  /** The reader's sheet, for the gates. Omit for an NPC. */
  sheet?: GateSheet
}

/**
 * Sections a player may hand over at all.
 *
 * `quests` is excluded on purpose, not by oversight: a party quest is already
 * in everyone's book by scope (lib/quests), and a personal one is personal by
 * nature — Sam's words. Sharing it would quietly undo the distinction he just
 * drew.
 */
const UNSHAREABLE: ReadonlySet<JournalSection> = new Set<JournalSection>(["quests"])

export function isShareable(section: JournalSection): boolean {
  return !UNSHAREABLE.has(section)
}

// ============================================================================
// §2 THE DECISION
// ============================================================================

/** The page as it exists in the sharer's book. */
export interface ShareSource {
  id: string
  characterId: string
  section: JournalSection
  title: string | null
  body: string
  visibility: JournalVisibility
  tags?: Record<string, unknown> | null
}

/** The row to insert into the recipient's journal. */
export interface SharedCopy {
  character_id: string
  section: JournalSection
  author: JournalAuthor
  title: string | null
  body: string
  visibility: JournalVisibility
  tags: Record<string, unknown>
}

/** A row for `npc_knowledge` when the reader is not a player. */
export interface NpcLearning {
  npc_name: string
  kind: UnlockKind | "journal_page"
  payload: Record<string, unknown>
  learned_from_character: string
}

export interface ShareOutcome {
  ok: boolean
  /** The copy for another player character, when there is one. */
  copy: SharedCopy | null
  /** The row for an NPC reader, when there is one. */
  npc: NpcLearning | null
  /** What the original's visibility becomes. Unchanged when nothing moved. */
  visibility: JournalVisibility
  /** Does the reader actually gain the capability, or only the words? */
  learns: boolean
  unlock: UnlockKind | null
  flags: string[]
  note: string
}

/**
 * Share one page with one person.
 *
 * THE GATE IS CHECKED HERE, AT READING — the rule already established in
 * lib/journal-sections. A non-caster shown a rune page gets the page and not
 * the rune: the words are legible to anyone, the capability is not.
 *
 * Sharing with a player moves the original to `party`. Sharing with an NPC
 * moves it to `found`, which is terminal and which the owner is never told
 * about — Sam's ruling — because handing your journal to an NPC is exactly the
 * moment a secret stops being yours.
 */
export function shareEntry(input: {
  entry: ShareSource
  to: ShareTarget
  /** Display name of the sharer, for the copied page's provenance line. */
  fromName?: string | null
}): ShareOutcome {
  const { entry, to } = input
  const unlock = unlockFor(entry.section)
  const from = input.fromName?.trim() || "someone"

  const refuse = (note: string, flags: string[] = []): ShareOutcome => ({
    ok: false, copy: null, npc: null, visibility: entry.visibility, learns: false, unlock, flags, note,
  })

  if (!isShareable(entry.section)) {
    return refuse(`${SECTION_LABEL[entry.section]} pages are not shared by hand — a party quest is already in every book, and a personal one is personal.`)
  }
  if (to.kind === "character" && to.id === entry.characterId) {
    return refuse("that is already their own page.")
  }
  if (!entry.body.trim()) return refuse("there is nothing written on this page.")

  const flags: string[] = []
  const provenance = { sharedFrom: entry.characterId, sharedFromName: from, sourceEntry: entry.id }

  if (to.kind === "npc") {
    const moved = disclose(entry.visibility, "found")
    return {
      ok: true,
      copy: null,
      npc: {
        npc_name: to.name,
        kind: unlock ?? "journal_page",
        payload: { section: entry.section, title: entry.title, body: entry.body, ...(entry.tags ?? {}), ...provenance },
        learned_from_character: entry.characterId,
      },
      visibility: moved.visibility,
      learns: true,
      unlock,
      flags: ["npc_knowledge is written but nothing reads it yet — the NPC does not act on this until the prompt does"],
      note: `${to.name} has read it. ${moved.changed ? "That cannot be taken back." : moved.note}`,
    }
  }

  // A player character.
  const gate = unlock ? checkGate(entry.section, to.sheet ?? {}) : { allowed: true, degraded: false, flags: [], note: "" }
  if (gate.flags.length) flags.push(...gate.flags)
  const learns = Boolean(unlock) && gate.allowed
  if (unlock && !gate.allowed) {
    flags.push(`${to.name} can read it but cannot use it — ${gate.note}`)
  }

  const moved = disclose(entry.visibility, "party")

  return {
    ok: true,
    copy: {
      character_id: to.id,
      section: entry.section,
      author: "import",
      title: entry.title,
      body: entry.body,
      visibility: DEFAULT_VISIBILITY,
      tags: { ...(entry.tags ?? {}), ...provenance },
    },
    npc: null,
    visibility: moved.visibility,
    learns,
    unlock,
    flags,
    note: learns
      ? `${to.name} copies it into their own book and gains the ${unlock}.`
      : `${to.name} copies it into their own book.`,
  }
}

// ============================================================================
// §3 WHAT THE MENU OFFERS
// ============================================================================

/**
 * The people this page can be handed to, for the menu that opens when an entry
 * is clicked.
 *
 * The sharer is never in their own list, and a section that cannot be shared
 * returns nobody rather than a menu of dead options — a disabled row that
 * never explains itself is worse than no row.
 */
export function shareTargets(input: {
  entry: Pick<ShareSource, "section" | "characterId">
  party: readonly ShareTarget[]
  /** NPCs present in the scene. Absent when nobody is there to hand it to. */
  present?: readonly ShareTarget[]
}): ShareTarget[] {
  if (!isShareable(input.entry.section)) return []
  return [...input.party, ...(input.present ?? [])].filter(
    (t) => !(t.kind === "character" && t.id === input.entry.characterId),
  )
}

/**
 * One line of warning for the confirm step, or null when there is nothing to
 * warn about.
 *
 * Handing a book to an NPC is the irreversible one, and the interface should
 * say so before the click, not after.
 */
export function shareWarning(section: JournalSection, to: ShareTarget): string | null {
  if (to.kind !== "npc") return null
  const unlock = unlockFor(section)
  return unlock
    ? `${to.name} will be able to use this, and will remember it. This cannot be undone.`
    : `${to.name} will remember what this page says. This cannot be undone.`
}
