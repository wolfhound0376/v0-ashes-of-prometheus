// The journal — a thing before it is a text.
//
// Decision of record: docs/claude_Journal_Module.md (2026-09-29). Read it
// first; this file is the rules in that document and nothing the document does
// not say.
//
// Built to the shape of lib/camp.ts: pure, no Supabase, no React. Text and
// rows in, decisions and words out. The chat route owns the database; this
// file owns the rule, so the rule can be read in one place and tested without
// Supabase.
//
// WHAT WAS HERE BEFORE, AND WHY THIS EXISTS
//
// The journal has shipped since PR #148: a table with RLS, an item every
// prisoner smuggled past the drow, a dashboard that reads pages, and an
// `author` column that already allowed "malachar". What it did not have was a
// module. The rules lived as four copies of one regex in app/api/chat/route.ts
// plus a fifth copy inside lib/__tests__/journal-tag.test.mjs, which
// re-implemented the parser it was supposed to be testing — so the suite could
// pass while the route was broken. The prompt text lived twice, in the
// numbered rules and again in the tag catalogue, free to drift apart.
//
// Two whole halves of the design were never written at all. `visibility`
// admits 'private' | 'dm' | 'party' | 'found' and nothing has ever written
// anything but 'private' — 'found' is the hinge the entire "a journal can be
// stolen and read" design turns on. And nothing ever checked whether the
// character still HAS the journal before writing a page in it.
//
// SOURCES, so nothing here can be mistaken for an improvisation:
//   DB          public.journal_entries, verified live 2026-09-29:
//               author  CHECK IN ('player','malachar','import')
//               visibility CHECK IN ('private','dm','party','found')
//               body    CHECK char_length BETWEEN 1 AND 20000
//               RLS: journal_read (SELECT, anon) + journal_player_insert
//               (INSERT, anon, author='player' only). No UPDATE, no DELETE.
//   Sam         "Journals always survive confiscation unless explicitly taken
//               by narrative." (campaign ruling, project memory)
//               "A campaign restart burns journal pages." (17 Aug 2026 —
//               already implemented in app/api/restart-campaign/route.ts)
//               "Journals are diegetic artifacts: they can be lost, stolen,
//               destroyed, found by NPCs (updating their knowledge), or
//               forged. Each finished campaign generates 1 canonical book plus
//               N character journals as separately publishable artifacts."
//   House rules Each is labelled "needs Sam's yes" where it applies and
//               surfaced in `flags` at runtime, so a ruling that has not been
//               given cannot pass as one that has.
//
// Where a rule is missing the function returns a `flags` entry, never a guess.

import { describeTimeOfDay, type GameClock } from "./time-tracking"

// ============================================================================
// §1 THE TAG — one home for a regex that had five
// ============================================================================
//
// `[JOURNAL: <the page>]`. Malachar emits it when a character writes. The
// pattern is deliberately loose — `[^\]]*` — because a tag that half-matches
// is worse than one that over-matches: the body is prose written by a model
// and will contain commas, quotes, em-dashes and the occasional apostrophe.
// The one thing it cannot contain is `]`, and that is the documented limit.

/** Every `[JOURNAL: …]` in a reply, with the body captured. Global + case-insensitive. */
export const JOURNAL_TAG_RE = /\[JOURNAL:\s*([^\]]*)\]/gi

/** Every tag stripped from player-facing text and speech. Players never see the tag. */
export const JOURNAL_STRIP_RE = /\[JOURNAL:[^\]]*\]/gi

/**
 * Every page body in the reply, in order, trimmed, blanks dropped.
 *
 * A `RegExp` with the `g` flag carries `lastIndex` between calls, so the
 * module-level constant is cloned per call rather than shared. This was a real
 * bug class in the route, where the same literal was reused across the scan
 * and the strip.
 */
export function parseJournalPages(text: string): string[] {
  const re = new RegExp(JOURNAL_TAG_RE.source, "gi")
  const out: string[] = []
  for (const m of (text ?? "").matchAll(re)) {
    const body = (m[1] ?? "").trim()
    if (body) out.push(body)
  }
  return out
}

/** The tag never reaches the table, the transcript, or the voice. */
export function stripJournalTags(text: string): string {
  return (text ?? "").replace(new RegExp(JOURNAL_STRIP_RE.source, "gi"), "")
}

/**
 * One page per turn. If he emitted two, the first is the one he meant — the
 * route's existing rule, kept verbatim so this module can replace it without
 * changing behaviour.
 */
export function firstJournalPage(text: string): string | null {
  return parseJournalPages(text)[0] ?? null
}

// ============================================================================
// §2 CUSTODY — a journal is a thing before it is a text
// ============================================================================
//
// The book is `tattered-journal` in the catalogue and a row in
// `inventory_items`. Confiscated gear does not vanish: it moves to a stash
// character and is tagged `confiscated_from` its owner (lib/weapons.ts
// documents the pattern). So the owner's own possessions are exactly the rows
// where `character_id` is theirs AND `confiscated_from` IS NULL.
//
// That mechanism is what makes Sam's ruling legible. When the drow stripped
// the party, the weapons moved to the stash and the journals did not — live
// data confirms all five player characters still hold journal and quill with
// `confiscated_from` null, while their weapons sit in the stash. The journal
// survives confiscation because nobody moved the row, not because of a
// special case in code.

export const JOURNAL_ITEM_KEY = "tattered-journal"
export const QUILL_ITEM_KEY = "small-quill"

/**
 * Where a character's journal is.
 *
 * `held`  — theirs, in their pack. Pages can be written.
 * `taken` — the row exists but sits in someone else's keeping, tagged back to
 *           them. Somebody has it, and somebody can read it (§5).
 * `missing` — no row anywhere. Ambiguous on purpose: destroyed, dropped, or
 *           never issued are indistinguishable from the inventory alone, so
 *           this never resolves itself into a story. The DM says which.
 */
export type JournalCustody = "held" | "taken" | "missing"

/** One `inventory_items` row, narrowed to the columns custody depends on. */
export interface InventoryRow {
  character_id: string
  item_key: string | null
  /** Non-null when the row sits in a stash, naming the character it was taken from. */
  confiscated_from?: string | null
  quantity?: number | null
}

/**
 * Custody of one character's journal, read from the inventory rows that
 * mention it. Pass every row that names this character in either column;
 * passing only their own rows can only ever produce `held` or `missing`, which
 * is a quieter way of being wrong.
 */
export function custodyOf(characterId: string, rows: readonly InventoryRow[], itemKey = JOURNAL_ITEM_KEY): JournalCustody {
  const mine = rows.filter((r) => r.item_key === itemKey)
  const inPack = mine.some(
    (r) => r.character_id === characterId && !r.confiscated_from && (r.quantity ?? 1) > 0,
  )
  if (inPack) return "held"
  const elsewhere = mine.some((r) => r.confiscated_from === characterId && (r.quantity ?? 1) > 0)
  return elsewhere ? "taken" : "missing"
}

/** Whether the character also still has something to write with. */
export function hasQuill(characterId: string, rows: readonly InventoryRow[]): boolean {
  return custodyOf(characterId, rows, QUILL_ITEM_KEY) === "held"
}

// ============================================================================
// §3 WHETHER A PAGE IS WRITTEN
// ============================================================================
//
// The route's rules today, restated so they can be tested: a tag with no body
// writes nothing, a tag with no acting character writes nothing, and only the
// first tag counts. This adds the one rule the route never had — you cannot
// write in a book you are not holding — and one house rule that needs Sam's
// yes before it can be called a rule.

/**
 * A page written by dim light with a stub of quill is short, and the prompt
 * already asks for "a few lines". This is the number that turns that request
 * into an enforceable limit.
 *
 * SAM'S RULING, 2026-09-29: a page limit, in CHARACTERS, number left to
 * Claude. 600 is roughly 100 words — a solid paragraph. Measured against the
 * project's own two canonical journal examples, which run 171 and 152
 * characters: a real page sits well under this, and the limit only trips when
 * a page stops being a page. Characters, not words, because the column's own
 * cap is in characters and one unit beats two.
 *
 * Over the limit the page is STORED IN FULL and flagged. Nothing is ever lost
 * to this limit — the flag is a note to the DM, not a pair of scissors. Only
 * PAGE_HARD_LIMIT, which is the database's own constraint, ever cuts.
 */
export const PAGE_LIMIT = 600

/** The column's own hard limit, verified live 2026-09-29. Not negotiable. */
export const PAGE_HARD_LIMIT = 20000

export interface JournalWriteInput {
  /** Malachar's raw reply, tags included. */
  rawText: string
  /** The character whose player is speaking this turn, or null when nobody is seated. */
  actingCharacterId: string | null
  /** Their name, for the note. */
  actingCharacterName?: string | null
  /** Inventory rows touching this character. Omit to skip the custody check entirely. */
  inventory?: readonly InventoryRow[]
}

export interface JournalWriteDecision {
  /** Write a row? */
  write: boolean
  /** The page as it should be stored, already trimmed. Null when nothing is written. */
  page: string | null
  /** The heading, when the writer gave one. Null is the normal case (§6). */
  title: string | null
  /** Custody at the moment of writing, when it was checked. */
  custody: JournalCustody | null
  /** Pages beyond the first, dropped. Kept so the route can log what it discarded. */
  dropped: string[]
  /** Rulings not yet given, and limits applied. Never empty silently. */
  flags: string[]
  /** One line for the log. The route's console messages become this. */
  note: string
}

/**
 * Whether one reply puts ink on a page.
 *
 * Deliberately total: every path returns a decision with a note, because the
 * failure this replaces was a page that vanished with nothing said about it.
 */
export function decideJournalPage(input: JournalWriteInput): JournalWriteDecision {
  const pages = parseJournalPages(input.rawText)
  const who = input.actingCharacterName?.trim() || "the acting character"
  const nothing = (note: string, extra: Partial<JournalWriteDecision> = {}): JournalWriteDecision => ({
    write: false,
    page: null,
    title: null,
    custody: null,
    dropped: pages.slice(1),
    flags: [],
    note,
    ...extra,
  })

  if (!pages.length) return nothing("no [JOURNAL] tag in response")
  if (!input.actingCharacterId) {
    return nothing(`journal tag emitted with no acting character — page dropped: ${pages[0].slice(0, 80)}`)
  }

  const flags: string[] = []
  let custody: JournalCustody | null = null
  if (input.inventory) {
    custody = custodyOf(input.actingCharacterId, input.inventory)
    if (custody !== "held") {
      return nothing(
        custody === "taken"
          ? `${who} does not have their journal — someone else is holding it. Nothing written.`
          : `${who} has no journal to write in. Nothing written.`,
        { custody },
      )
    }
    if (!hasQuill(input.actingCharacterId, input.inventory)) {
      // Not a refusal. People write with charcoal, chalk, a splinter and
      // blood. The absence is worth narrating, not enforcing.
      flags.push("no quill in their pack — they wrote with something else; narrate it")
    }
  }

  let page = pages[0]
  let title: string | null = null

  const split = splitTitle(page)
  title = split.title
  page = split.body

  if (page.length > PAGE_HARD_LIMIT) {
    page = page.slice(0, PAGE_HARD_LIMIT)
    flags.push(`page exceeded the column limit of ${PAGE_HARD_LIMIT} characters and was cut`)
  }
  const len = page.length
  if (len > PAGE_LIMIT) {
    flags.push(`page runs ${len} characters, past the limit of ${PAGE_LIMIT} — stored in full`)
  }

  return {
    write: true,
    page,
    title,
    custody,
    dropped: pages.slice(1),
    flags,
    note: `journal page written for ${who} — ${page.slice(0, 60)}`,
  }
}

// ============================================================================
// §4 AUTHOR AND VISIBILITY — the RLS contract, in code
// ============================================================================
//
// Both lists are CHECK constraints on the table, read live on 2026-09-29, not
// conventions. Widening either one is a migration, so these arrays are the
// place a future session finds out that `forged` is not an author it may use.

export const JOURNAL_AUTHORS = ["player", "malachar", "import"] as const
export type JournalAuthor = (typeof JOURNAL_AUTHORS)[number]

export const JOURNAL_VISIBILITIES = ["private", "dm", "party", "found"] as const
export type JournalVisibility = (typeof JOURNAL_VISIBILITIES)[number]

/**
 * The only author the browser may insert. RLS enforces it; this constant is so
 * a component does not have to guess, and so a server route knows that writing
 * anything else is its own job and not a mistake.
 */
export const BROWSER_AUTHOR: JournalAuthor = "player"

/**
 * Pages start private. Nothing in the app has ever written another value — the
 * other three are the design waiting to be wired (§5).
 */
export const DEFAULT_VISIBILITY: JournalVisibility = "private"

export function isJournalAuthor(v: unknown): v is JournalAuthor {
  return typeof v === "string" && (JOURNAL_AUTHORS as readonly string[]).includes(v)
}

export function isJournalVisibility(v: unknown): v is JournalVisibility {
  return typeof v === "string" && (JOURNAL_VISIBILITIES as readonly string[]).includes(v)
}

/** A row ready for `insert`, with nothing the CHECK constraints would refuse. */
export interface JournalInsert {
  character_id: string
  session_id: string | null
  author: JournalAuthor
  body: string
  visibility: JournalVisibility
  title?: string | null
  in_world_date?: string | null
}

/**
 * Build the row. Throws on an author or visibility the table would reject,
 * because that is a programming error rather than a game outcome, and a
 * constraint violation at 2am reads far worse than this does.
 */
export function journalInsert(input: {
  characterId: string
  sessionId?: string | null
  author: JournalAuthor
  body: string
  visibility?: JournalVisibility
  title?: string | null
  inWorldDate?: string | null
}): JournalInsert {
  if (!isJournalAuthor(input.author)) throw new Error(`journal author not allowed by the table: ${String(input.author)}`)
  const visibility = input.visibility ?? DEFAULT_VISIBILITY
  if (!isJournalVisibility(visibility)) throw new Error(`journal visibility not allowed by the table: ${String(visibility)}`)
  const body = (input.body ?? "").trim()
  if (!body) throw new Error("journal page is empty; the table requires at least one character")
  return {
    character_id: input.characterId,
    session_id: input.sessionId ?? null,
    author: input.author,
    body: body.slice(0, PAGE_HARD_LIMIT),
    visibility,
    title: input.title ?? null,
    in_world_date: input.inWorldDate ?? null,
  }
}

// ============================================================================
// §5 DISCLOSURE — the half of the design that was never wired
// ============================================================================
//
// Sam: journals can be lost, stolen, destroyed, found by NPCs, or forged. The
// table has carried the state for that since PR #148 and nothing has ever set
// it. These are the transitions.
//
// The one rule worth encoding: a page that has been read cannot become unread.
// `found` is terminal. Ilvara does not forget what the book said because the
// party stole it back, and the whole point of a diegetic artifact is that
// losing it costs something that cannot be undone by picking it up again.

/** Ordered by how far the page has travelled from its writer. Higher never goes lower. */
const DISCLOSURE_RANK: Record<JournalVisibility, number> = {
  private: 0,
  dm: 1,
  party: 2,
  found: 3,
}

export interface DisclosureOutcome {
  visibility: JournalVisibility
  changed: boolean
  note: string
}

/**
 * Move one page's visibility. Refuses to walk it back.
 *
 * `dm` is the DM reading over a shoulder; `party` is the writer showing it;
 * `found` is somebody else holding the book. Only `found` is a loss.
 */
export function disclose(current: JournalVisibility, to: JournalVisibility): DisclosureOutcome {
  if (!isJournalVisibility(current) || !isJournalVisibility(to)) {
    return { visibility: isJournalVisibility(current) ? current : DEFAULT_VISIBILITY, changed: false, note: "unknown visibility — nothing changed" }
  }
  if (DISCLOSURE_RANK[to] <= DISCLOSURE_RANK[current]) {
    return {
      visibility: current,
      changed: false,
      note:
        current === "found"
          ? "this page has been read by someone else; that cannot be taken back"
          : `already ${current}; ${to} is no further than that`,
    }
  }
  return {
    visibility: to,
    changed: true,
    note: to === "found" ? "someone else has read this page" : `now visible to ${to}`,
  }
}

/**
 * SAM'S RULING, 2026-09-29: "Owner doesn't necessarily find out unless he is
 * checking."
 *
 * So discovery is never pushed. No alert, no banner, no line in the log, and
 * nothing Malachar says. The page carries `visibility = 'found'` and a player
 * who opens their own journal and looks can see which pages have been read —
 * that is the whole of the telling. Someone who never checks never learns, and
 * finds out the hard way when an NPC quotes them back to themselves.
 *
 * This is why `unseenDisclosures` exists and why nothing calls it on a timer.
 */
export const NOTIFY_OWNER_ON_DISCOVERY = false

/**
 * The pages in this character's book that somebody else has read — for the
 * dashboard to mark WHEN THE OWNER OPENS IT, never to push at them.
 */
export function readPages(entries: readonly JournalEntryRow[], characterId: string): JournalEntryRow[] {
  return entries.filter((e) => e.character_id === characterId && e.visibility === "found")
}

/**
 * What the journal screen shows the owner when they come looking: a count, or
 * null when there is nothing to find. Null means render nothing at all — not a
 * reassuring "no pages read", which would itself be a notification.
 */
export function unseenDisclosures(entries: readonly JournalEntryRow[], characterId: string): number | null {
  const n = readPages(entries, characterId).length
  return n > 0 ? n : null
}

/** One stored page, narrowed to what the rules read. */
export interface JournalEntryRow {
  id: string
  character_id: string
  author: JournalAuthor
  title?: string | null
  in_world_date?: string | null
  body: string
  visibility: JournalVisibility
  created_at: string
}

/**
 * What somebody who takes the book gets to read: everything in it. A journal
 * is not encrypted and its owner did not expect a reader, which is exactly why
 * it is worth stealing.
 *
 * NOT WIRED, AND NOT BUILDABLE TODAY: Sam's design says a found journal
 * updates the finder's knowledge. There is no `npc_knowledge` or `npc_memories`
 * table in the database (verified 2026-09-29 — the only NPC table is
 * `npc_encounters`), so this returns the pages and says so rather than writing
 * to a table that does not exist.
 */
export function pagesOnDiscovery(entries: readonly JournalEntryRow[], characterId: string): { pages: JournalEntryRow[]; flags: string[] } {
  const pages = entries.filter((e) => e.character_id === characterId)
  return {
    pages,
    flags: pages.length
      ? ["no npc knowledge table exists; the finder learns nothing durable until one does"]
      : [],
  }
}

// ============================================================================
// §6 THE DATELINE — a page dated by the world, not the browser
// ============================================================================
//
// `in_world_date` is a nullable text column that nothing has ever written, so
// every page in the dashboard falls back to the reader's own wall clock. A
// prisoner in Velkynvelve does not know it is a Tuesday.
//
// The label is deliberately vague, and reuses `describeTimeOfDay` from
// lib/time-tracking rather than a second opinion about what "night" means.
// Players never see the clock — that rule predates this module and is not
// being bent for a dateline.

/** "Day 3 · Night". Null when there is no clock to read, so the column stays null rather than lying. */
export function dateline(clock: Pick<GameClock, "day" | "minutesOfDay"> | null | undefined): string | null {
  if (!clock || !Number.isFinite(clock.day) || !Number.isFinite(clock.minutesOfDay)) return null
  const day = Math.max(1, Math.trunc(clock.day))
  return `Day ${day} · ${describeTimeOfDay(clock.minutesOfDay)}`
}

/**
 * SAM'S RULING, 2026-09-29: "Some pages have titles."
 *
 * So a title is optional and per-page, and it is the WRITER's — never derived
 * from the body by this module. A heading the character did not write is the
 * module putting words in their mouth, which the prompt forbids Malachar from
 * doing to the page itself; the same rule applies to the line above it.
 *
 * The tag therefore takes an optional pipe form, matching the convention
 * [CAMP_ACTION: who | action | args] already uses:
 *
 *     [JOURNAL: the page]                      → no title, the normal case
 *     [JOURNAL: Day of the Gate | the page]    → titled
 *
 * The guard against a pipe that occurs naturally in prose: the segment before
 * the pipe is a title only if it is at most TITLE_MAX characters. Longer, and
 * the whole tag is body. Prose rarely contains a pipe at all, and never inside
 * the first 60 characters by accident.
 */
export const TITLE_MAX = 60

/** Split `Title | body` when the tag carries one. Returns a null title otherwise. */
export function splitTitle(raw: string): { title: string | null; body: string } {
  const s = (raw ?? "").trim()
  const i = s.indexOf("|")
  if (i === -1) return { title: null, body: s }
  const head = s.slice(0, i).trim()
  const tail = s.slice(i + 1).trim()
  if (!head || !tail || head.length > TITLE_MAX) return { title: null, body: s }
  return { title: head, body: tail }
}

// ============================================================================
// §7 THE RESTART
// ============================================================================

/**
 * Sam's ruling, 17 Aug 2026: a campaign restart burns the pages. Already
 * implemented in app/api/restart-campaign/route.ts, which deletes every row
 * and reports the count; this constant is here so the ruling has one home and
 * a future session does not re-open it.
 *
 * Project memory records this as an open question. It is not — it was decided
 * and shipped. The memory note is stale.
 */
export const RESTART_BURNS_PAGES = true

/**
 * The counterpart ruling: the journal itself is re-issued, and it survives
 * confiscation. The restart route re-issues journal and quill to every player.
 */
export const JOURNAL_SURVIVES_CONFISCATION = true

// ============================================================================
// §8 THE PROMPT BLOCK — one copy of text that currently has two
// ============================================================================
//
// app/api/chat/route.ts states the journal rules twice: once in the numbered
// behavioural rules and again in the STRUCTURED TAGS catalogue. Two copies of
// a prompt drift, and there is already a test in the repo
// (lib/__tests__/prompt-tags-documented.test.mjs) that exists because exactly
// this went wrong before — [JOURNAL] was parsed by the route while being
// absent from the catalogue, so Malachar never emitted it.
//
// These exports are the single source. Wiring the route to them is PR 2.

/** The worked example. The model imitates examples far more reliably than rules. */
export const JOURNAL_EXAMPLE =
  "[JOURNAL: Three guards on the gate. They change on the fourth hour — Eldeth says the gap is three minutes. She has been counting longer than I have, and she did not have to tell me.]"

/** The titled form. Most pages have no title; this is what one looks like when it does. */
export const JOURNAL_TITLED_EXAMPLE =
  "[JOURNAL: The fourth hour | Three guards on the gate. They change on the fourth hour, and there is a gap. Eldeth has been counting longer than I have.]"

/** The entry for the STRUCTURED TAGS catalogue. */
export const JOURNAL_TAG_RULES = `JOURNAL:
- [JOURNAL: the page, in the character's own words] — when the character WRITES in their journal
  - Every prisoner smuggled a battered journal past the drow. Writing in it is a real action with a real record.
  - Emit it whenever the player says they write, note, record, jot, tally, or mark something down. Narrating the quill is not enough — the tag is what puts ink on the page.
  - Write it as THEY would write it: first person, a few lines, what they saw and what they made of it. Keep it under ${PAGE_LIMIT} characters.
  - The page is theirs. Never mock them inside the tag and never write something they did not mean to record. Be as cruel as you like in the prose around it.
  - A page may carry a title, and MOST DO NOT. Only give one when the character would have headed the page themselves — a date they are keeping, a name for a day. Put it before a pipe: [JOURNAL: <title> | <the page>]. Never invent a title to decorate an ordinary entry.
  - Example: ${JOURNAL_EXAMPLE}
  - Titled example: ${JOURNAL_TITLED_EXAMPLE}`

/** The numbered behavioural rule. Same content, the voice the numbered list uses. */
export const JOURNAL_NUMBERED_RULE = `JOURNAL PAGES: Each prisoner smuggled a battered journal past the drow. When a character WRITES IN IT — says they are noting something down, recording what they saw, keeping a tally, marking the days — emit [JOURNAL: <the page>] on its own line.

- The page is THEIRS, not yours. Write what the character would have written, in their voice: what they observed, what they decided, what they are afraid of. First person.
- You are the hand, not the author. Never editorialise inside the tag, never mock them there, never put words in the page that the character did not mean to record. Be as cruel as you like in the narration around it; the page itself is private and honest.
- Emit it ONLY when the character actually writes. Thinking about something, saying it aloud, or you describing the journal is not writing in it.
- One page per response at most. Keep it short — under ${PAGE_LIMIT} characters, a few lines, the way someone writes by dim light with a stub of quill.
- Some pages have a title and most do not. Give one only when the character would have headed the page themselves: [JOURNAL: <title> | <the page>]. An untitled page is the normal case.
- Never mention the tag or tell the player their journal updated. They will see the page.`

export interface JournalBlockState {
  /** Custody per seated character, so he is not told to offer a book that is gone. */
  custody: { name: string; custody: JournalCustody }[]
  /** How many pages this character has already written, for continuity. */
  pagesSoFar?: number
  /** Pages somebody else is now holding and may have read. */
  compromised?: { name: string; pages: number }[]
}

/**
 * The JOURNAL section of Malachar's prompt, or "" when there is nothing to
 * say. Facts only — who can write, who cannot, and who lost their book. The
 * narration is his.
 */
export function formatJournalBlock(s: JournalBlockState): string {
  const parts: string[] = []
  const held = s.custody.filter((c) => c.custody === "held")
  const gone = s.custody.filter((c) => c.custody !== "held")

  if (held.length) {
    parts.push(
      `These characters still have their journal and can write in it: ${held.map((c) => c.name).join(", ")}.` +
        (s.pagesSoFar ? ` Pages already written this campaign: ${s.pagesSoFar}. You may refer to the book being part-full; never quote a page you were not shown.` : ""),
    )
  }
  if (gone.length) {
    parts.push(
      `NO JOURNAL — do not offer these characters a page and never emit [JOURNAL] for them: ` +
        gone
          .map((c) => `${c.name} (${c.custody === "taken" ? "someone else is holding it" : "it is gone"})`)
          .join(", ") +
        `. If they say they write, narrate the absence: the reach for a book that is not there.`,
    )
  }
  if (s.compromised?.length) {
    parts.push(
      `READ BY SOMEONE ELSE (for your use only — the owner is NOT told, and you must not tell them):\n` +
        s.compromised.map((c) => `- ${c.pages} of ${c.name}'s pages are in another's hands and have been read.`).join("\n") +
        `\nUse it the way it would really surface: an NPC who knows something they should not, a line quoted back. Never announce it, and never confirm it if asked outright.`,
    )
  }
  if (!parts.length) return ""
  return `════════════════════════════════════════════════════════════════════
JOURNALS (facts from the system — never reveal them as system facts)
════════════════════════════════════════════════════════════════════
${parts.join("\n\n")}`
}

// ============================================================================
// §9 COMPILATION — the publishable artifact
// ============================================================================
//
// Sam: "Each finished campaign generates 1 canonical book plus N character
// journals as separately publishable artifacts." This is the N. Pure text out;
// what renders it — a PDF, a page, a printed book — is not this module's
// business and is not decided.

export interface CompiledJournal {
  characterId: string
  /** Pages in the order they were written. */
  pages: JournalEntryRow[]
  /** Markdown, datelines as headings, one page per paragraph. */
  markdown: string
  /** Pages another hand wrote in this book — Malachar's, or an import. */
  foreignPages: number
}

/**
 * One character's journal as a document.
 *
 * Sorted by `created_at`, which is the only honest order: `in_world_date` is a
 * free-text label and may be null, repeated, or out of sequence.
 */
export function compileJournal(entries: readonly JournalEntryRow[], characterId: string, opts: { title?: string } = {}): CompiledJournal {
  const pages = entries
    .filter((e) => e.character_id === characterId)
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))

  const lines: string[] = []
  if (opts.title) lines.push(`# ${opts.title}`, "")
  let lastDate: string | null = null
  for (const p of pages) {
    const date = p.in_world_date ?? null
    if (date && date !== lastDate) {
      lines.push(`## ${date}`, "")
      lastDate = date
    }
    if (p.title) lines.push(`**${p.title}**`, "")
    lines.push(p.author === "player" ? p.body : `*${p.body}*`, "")
  }

  return {
    characterId,
    pages,
    markdown: lines.join("\n").trimEnd(),
    foreignPages: pages.filter((p) => p.author !== "player").length,
  }
}
