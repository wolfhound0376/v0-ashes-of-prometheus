import { describe, expect, it } from "vitest"
import {
  BROWSER_AUTHOR,
  DEFAULT_VISIBILITY,
  JOURNAL_AUTHORS,
  JOURNAL_EXAMPLE,
  JOURNAL_ITEM_KEY,
  JOURNAL_NUMBERED_RULE,
  JOURNAL_SURVIVES_CONFISCATION,
  JOURNAL_TAG_RULES,
  JOURNAL_VISIBILITIES,
  PAGE_HARD_LIMIT,
  PAGE_SOFT_LIMIT,
  QUILL_ITEM_KEY,
  RESTART_BURNS_PAGES,
  compileJournal,
  custodyOf,
  dateline,
  decideJournalPage,
  disclose,
  firstJournalPage,
  formatJournalBlock,
  hasQuill,
  isJournalAuthor,
  isJournalVisibility,
  journalInsert,
  pagesOnDiscovery,
  parseJournalPages,
  stripJournalTags,
  titleFrom,
  type InventoryRow,
  type JournalEntryRow,
} from "./journal"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIFI = "d00aa5b8-ced1-477d-9ec8-0861cca55498"
const STASH = "00000000-0000-0000-0000-0000000000ff"

const holding: InventoryRow[] = [
  { character_id: FIFI, item_key: JOURNAL_ITEM_KEY, confiscated_from: null, quantity: 1 },
  { character_id: FIFI, item_key: QUILL_ITEM_KEY, confiscated_from: null, quantity: 1 },
]

function page(id: string, body: string, over: Partial<JournalEntryRow> = {}): JournalEntryRow {
  return {
    id,
    character_id: FIFI,
    author: "player",
    body,
    visibility: "private",
    created_at: "2026-09-29T00:00:00Z",
    ...over,
  }
}

// ---------------------------------------------------------------------------
// §1 The tag
// ---------------------------------------------------------------------------

describe("the tag", () => {
  it("lifts the page out of the prose", () => {
    const raw = "You scratch it down by the guttering light.\n[JOURNAL: Three guards. Shift changes on the fourth hour.]"
    expect(parseJournalPages(raw)).toEqual(["Three guards. Shift changes on the fourth hour."])
  })

  it("never lets the tag reach the table", () => {
    const shown = stripJournalTags("You write.\n[JOURNAL: Three guards.]\nMalachar watches, amused.")
    expect(shown).not.toContain("JOURNAL")
    expect(shown).toContain("Malachar watches, amused.")
  })

  it("keeps the punctuation a model actually writes", () => {
    const raw = '[JOURNAL: She said "three". I believe her — that is the worrying part.]'
    expect(firstJournalPage(raw)).toBe('She said "three". I believe her — that is the worrying part.')
  })

  it("takes the first page when he emits two", () => {
    expect(firstJournalPage("[JOURNAL: first]\n[JOURNAL: second]")).toBe("first")
  })

  it("treats an empty tag as no page, not an empty one", () => {
    expect(firstJournalPage("[JOURNAL:   ]")).toBeNull()
    expect(firstJournalPage("no tag here")).toBeNull()
    expect(parseJournalPages("")).toEqual([])
  })

  it("matches however he cases it", () => {
    expect(firstJournalPage("[journal: lower]")).toBe("lower")
    expect(firstJournalPage("[Journal: Title Case]")).toBe("Title Case")
  })

  // The bug that made a module necessary: a /g regex carries lastIndex, so the
  // second call against the same literal starts halfway through the string.
  it("does not carry lastIndex between calls", () => {
    const raw = "[JOURNAL: same page]"
    expect(firstJournalPage(raw)).toBe("same page")
    expect(firstJournalPage(raw)).toBe("same page")
    expect(firstJournalPage(raw)).toBe("same page")
  })

  it("strips repeatedly without going stale either", () => {
    const raw = "a [JOURNAL: x] b"
    expect(stripJournalTags(raw)).toBe(stripJournalTags(raw))
  })
})

// ---------------------------------------------------------------------------
// §2 Custody
// ---------------------------------------------------------------------------

describe("custody", () => {
  it("is held when the row is theirs and unconfiscated", () => {
    expect(custodyOf(FIFI, holding)).toBe("held")
  })

  it("survives confiscation, because the weapons moved and the journal did not", () => {
    const stripped: InventoryRow[] = [
      ...holding,
      { character_id: STASH, item_key: "dagger", confiscated_from: FIFI, quantity: 2 },
    ]
    expect(custodyOf(FIFI, stripped)).toBe("held")
    expect(JOURNAL_SURVIVES_CONFISCATION).toBe(true)
  })

  it("is taken when somebody else holds it tagged back to them", () => {
    const rows: InventoryRow[] = [{ character_id: STASH, item_key: JOURNAL_ITEM_KEY, confiscated_from: FIFI, quantity: 1 }]
    expect(custodyOf(FIFI, rows)).toBe("taken")
  })

  it("is missing when no row mentions it at all", () => {
    expect(custodyOf(FIFI, [])).toBe("missing")
    expect(custodyOf(FIFI, [{ character_id: FIFI, item_key: "rations", confiscated_from: null }])).toBe("missing")
  })

  it("does not count a row at zero quantity", () => {
    expect(custodyOf(FIFI, [{ character_id: FIFI, item_key: JOURNAL_ITEM_KEY, confiscated_from: null, quantity: 0 }])).toBe("missing")
  })

  it("treats an absent quantity as one, the way the column's default does", () => {
    expect(custodyOf(FIFI, [{ character_id: FIFI, item_key: JOURNAL_ITEM_KEY }])).toBe("held")
  })

  it("does not confuse one character's journal for another's", () => {
    const other = "11111111-1111-1111-1111-111111111111"
    expect(custodyOf(other, holding)).toBe("missing")
  })

  it("reads the quill by the same rule", () => {
    expect(hasQuill(FIFI, holding)).toBe(true)
    expect(hasQuill(FIFI, holding.filter((r) => r.item_key !== QUILL_ITEM_KEY))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// §3 Whether a page is written
// ---------------------------------------------------------------------------

describe("deciding the page", () => {
  it("writes when a seated character with their book writes", () => {
    const d = decideJournalPage({
      rawText: "[JOURNAL: Three guards.]",
      actingCharacterId: FIFI,
      actingCharacterName: "Fifi",
      inventory: holding,
    })
    expect(d.write).toBe(true)
    expect(d.page).toBe("Three guards.")
    expect(d.custody).toBe("held")
    expect(d.flags).toEqual([])
  })

  it("writes nothing when nobody is seated, and says whose page was lost", () => {
    const d = decideJournalPage({ rawText: "[JOURNAL: Three guards.]", actingCharacterId: null })
    expect(d.write).toBe(false)
    expect(d.note).toContain("no acting character")
    expect(d.note).toContain("Three guards.")
  })

  it("writes nothing when there is no tag", () => {
    const d = decideJournalPage({ rawText: "He only describes the quill.", actingCharacterId: FIFI })
    expect(d.write).toBe(false)
    expect(d.note).toBe("no [JOURNAL] tag in response")
  })

  // The rule the route never had.
  it("refuses a page in a book somebody else is holding", () => {
    const d = decideJournalPage({
      rawText: "[JOURNAL: Three guards.]",
      actingCharacterId: FIFI,
      actingCharacterName: "Fifi",
      inventory: [{ character_id: STASH, item_key: JOURNAL_ITEM_KEY, confiscated_from: FIFI }],
    })
    expect(d.write).toBe(false)
    expect(d.custody).toBe("taken")
    expect(d.note).toContain("someone else is holding it")
  })

  it("refuses a page in a book that is gone", () => {
    const d = decideJournalPage({
      rawText: "[JOURNAL: Three guards.]",
      actingCharacterId: FIFI,
      actingCharacterName: "Fifi",
      inventory: [],
    })
    expect(d.write).toBe(false)
    expect(d.custody).toBe("missing")
    expect(d.note).toContain("no journal")
  })

  it("skips the custody check entirely when no inventory is supplied", () => {
    const d = decideJournalPage({ rawText: "[JOURNAL: Three guards.]", actingCharacterId: FIFI })
    expect(d.write).toBe(true)
    expect(d.custody).toBeNull()
  })

  it("lets a missing quill through as a flag, not a refusal", () => {
    const d = decideJournalPage({
      rawText: "[JOURNAL: In charcoal, then.]",
      actingCharacterId: FIFI,
      inventory: holding.filter((r) => r.item_key !== QUILL_ITEM_KEY),
    })
    expect(d.write).toBe(true)
    expect(d.flags.join(" ")).toContain("no quill")
  })

  it("reports the pages it discarded rather than dropping them silently", () => {
    const d = decideJournalPage({
      rawText: "[JOURNAL: first]\n[JOURNAL: second]\n[JOURNAL: third]",
      actingCharacterId: FIFI,
    })
    expect(d.page).toBe("first")
    expect(d.dropped).toEqual(["second", "third"])
  })

  it("flags an over-long page but still stores it in full", () => {
    const long = "x".repeat(PAGE_SOFT_LIMIT + 50)
    const d = decideJournalPage({ rawText: `[JOURNAL: ${long}]`, actingCharacterId: FIFI })
    expect(d.write).toBe(true)
    expect(d.page).toHaveLength(PAGE_SOFT_LIMIT + 50)
    expect(d.flags.join(" ")).toContain("needs Sam's yes")
  })

  it("cuts a page the column would reject", () => {
    const huge = "x".repeat(PAGE_HARD_LIMIT + 500)
    const d = decideJournalPage({ rawText: `[JOURNAL: ${huge}]`, actingCharacterId: FIFI })
    expect(d.page).toHaveLength(PAGE_HARD_LIMIT)
    expect(d.flags.join(" ")).toContain("column limit")
  })

  it("keeps the soft limit under the hard one, or the flag is unreachable", () => {
    expect(PAGE_SOFT_LIMIT).toBeLessThan(PAGE_HARD_LIMIT)
  })
})

// ---------------------------------------------------------------------------
// §4 Author and visibility
// ---------------------------------------------------------------------------

describe("the table's contract", () => {
  it("lists exactly the authors the CHECK constraint allows", () => {
    expect([...JOURNAL_AUTHORS]).toEqual(["player", "malachar", "import"])
    expect(isJournalAuthor("player")).toBe(true)
    expect(isJournalAuthor("forged")).toBe(false)
    expect(isJournalAuthor(null)).toBe(false)
  })

  it("lists exactly the visibilities the CHECK constraint allows", () => {
    expect([...JOURNAL_VISIBILITIES]).toEqual(["private", "dm", "party", "found"])
    expect(isJournalVisibility("found")).toBe(true)
    expect(isJournalVisibility("secret")).toBe(false)
  })

  it("knows the browser may only claim to be the player", () => {
    expect(BROWSER_AUTHOR).toBe("player")
    expect(DEFAULT_VISIBILITY).toBe("private")
  })

  it("builds a row the table will take", () => {
    const row = journalInsert({ characterId: FIFI, sessionId: null, author: "malachar", body: "  Three guards.  " })
    expect(row).toEqual({
      character_id: FIFI,
      session_id: null,
      author: "malachar",
      body: "Three guards.",
      visibility: "private",
      title: null,
      in_world_date: null,
    })
  })

  it("throws rather than letting a constraint violation reach the database", () => {
    expect(() => journalInsert({ characterId: FIFI, author: "forged" as never, body: "x" })).toThrow(/author/)
    expect(() => journalInsert({ characterId: FIFI, author: "player", body: "x", visibility: "secret" as never })).toThrow(/visibility/)
    expect(() => journalInsert({ characterId: FIFI, author: "player", body: "   " })).toThrow(/empty/)
  })
})

// ---------------------------------------------------------------------------
// §5 Disclosure
// ---------------------------------------------------------------------------

describe("disclosure", () => {
  it("opens a page outward", () => {
    expect(disclose("private", "party")).toMatchObject({ visibility: "party", changed: true })
    expect(disclose("private", "found")).toMatchObject({ visibility: "found", changed: true })
  })

  it("will not close one back down", () => {
    const r = disclose("party", "private")
    expect(r.changed).toBe(false)
    expect(r.visibility).toBe("party")
  })

  // The rule worth having a module for.
  it("cannot un-read a page somebody else has read", () => {
    const r = disclose("found", "private")
    expect(r.changed).toBe(false)
    expect(r.note).toContain("cannot be taken back")
  })

  it("does nothing when asked to move a page where it already is", () => {
    expect(disclose("dm", "dm").changed).toBe(false)
  })

  it("refuses a visibility the table does not have", () => {
    expect(disclose("private", "public" as never)).toMatchObject({ changed: false, visibility: "private" })
  })

  it("hands over the whole book on discovery, and says what it cannot do", () => {
    const r = pagesOnDiscovery([page("a", "one"), page("b", "two"), page("c", "other", { character_id: "zzz" })], FIFI)
    expect(r.pages.map((p) => p.id)).toEqual(["a", "b"])
    expect(r.flags.join(" ")).toContain("npc knowledge table")
  })

  it("flags nothing when the book is empty", () => {
    expect(pagesOnDiscovery([], FIFI).flags).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// §6 The dateline
// ---------------------------------------------------------------------------

describe("the dateline", () => {
  it("dates a page by the world", () => {
    expect(dateline({ day: 3, minutesOfDay: 120 })).toBe("Day 3 · Night")
    expect(dateline({ day: 1, minutesOfDay: 700 })).toBe("Day 1 · Morning")
    expect(dateline({ day: 12, minutesOfDay: 800 })).toBe("Day 12 · Afternoon")
    expect(dateline({ day: 2, minutesOfDay: 1200 })).toBe("Day 2 · Evening")
  })

  it("returns null rather than inventing a date", () => {
    expect(dateline(null)).toBeNull()
    expect(dateline(undefined)).toBeNull()
    expect(dateline({ day: Number.NaN, minutesOfDay: 0 })).toBeNull()
  })

  it("never shows the clock, only the part of day", () => {
    expect(dateline({ day: 3, minutesOfDay: 137 })).not.toMatch(/\d\d:\d\d/)
  })

  it("floors a day below one to one", () => {
    expect(dateline({ day: 0, minutesOfDay: 60 })).toBe("Day 1 · Night")
  })

  it("takes a title from the first sentence, and nothing longer", () => {
    expect(titleFrom("Three guards. They change on the fourth hour.")).toBe("Three guards")
    expect(titleFrom("   ")).toBeNull()
    const t = titleFrom("x".repeat(200))
    expect(t && t.length).toBeLessThanOrEqual(48)
  })
})

// ---------------------------------------------------------------------------
// §7 / §8 Rulings and the prompt
// ---------------------------------------------------------------------------

describe("rulings", () => {
  it("records that a restart burns the pages", () => {
    expect(RESTART_BURNS_PAGES).toBe(true)
  })
})

describe("the prompt block", () => {
  it("says nothing when there is nothing to say", () => {
    expect(formatJournalBlock({ custody: [] })).toBe("")
  })

  it("names who can write", () => {
    const b = formatJournalBlock({ custody: [{ name: "Fifi", custody: "held" }], pagesSoFar: 4 })
    expect(b).toContain("Fifi")
    expect(b).toContain("4")
  })

  it("forbids the tag for a character whose book is gone", () => {
    const b = formatJournalBlock({
      custody: [
        { name: "Fifi", custody: "held" },
        { name: "Kenta", custody: "taken" },
        { name: "Samson", custody: "missing" },
      ],
    })
    expect(b).toContain("NO JOURNAL")
    expect(b).toContain("never emit [JOURNAL] for them")
    expect(b).toContain("Kenta (someone else is holding it)")
    expect(b).toContain("Samson (it is gone)")
  })

  it("tells him what was read without telling him how he knows", () => {
    const b = formatJournalBlock({ custody: [], compromised: [{ name: "Fifi", pages: 3 }] })
    expect(b).toContain("READ BY SOMEONE ELSE")
    expect(b).toContain("never say how you know")
  })

  // The repo already has a test that exists because the tag was parsed by the
  // route while missing from the catalogue. Same failure, guarded at source.
  it("documents the tag with a worked example in both prompt copies", () => {
    for (const text of [JOURNAL_TAG_RULES, JOURNAL_NUMBERED_RULE]) {
      expect(text).toContain("[JOURNAL:")
    }
    expect(JOURNAL_TAG_RULES).toContain(JOURNAL_EXAMPLE)
  })

  it("ships an example the parser can actually read", () => {
    expect(firstJournalPage(JOURNAL_EXAMPLE)).toContain("Three guards on the gate")
  })
})

// ---------------------------------------------------------------------------
// §9 Compilation
// ---------------------------------------------------------------------------

describe("compiling the book", () => {
  const entries: JournalEntryRow[] = [
    page("b", "Second page.", { created_at: "2026-09-02T00:00:00Z", in_world_date: "Day 2 · Night" }),
    page("a", "First page.", { created_at: "2026-09-01T00:00:00Z", in_world_date: "Day 1 · Evening" }),
    page("c", "In another hand.", { created_at: "2026-09-03T00:00:00Z", in_world_date: "Day 2 · Night", author: "malachar" }),
    page("z", "Not hers.", { character_id: "zzz" }),
  ]

  it("orders by when it was written, not by the label on the page", () => {
    const c = compileJournal(entries, FIFI)
    expect(c.pages.map((p) => p.id)).toEqual(["a", "b", "c"])
  })

  it("keeps other characters out of the book", () => {
    expect(compileJournal(entries, FIFI).pages.some((p) => p.id === "z")).toBe(false)
  })

  it("sets a dateline heading once per date", () => {
    const md = compileJournal(entries, FIFI).markdown
    expect(md.match(/## Day 2 · Night/g)).toHaveLength(1)
    expect(md).toContain("## Day 1 · Evening")
  })

  it("marks the pages another hand wrote", () => {
    const c = compileJournal(entries, FIFI)
    expect(c.foreignPages).toBe(1)
    expect(c.markdown).toContain("*In another hand.*")
    expect(c.markdown).toContain("First page.")
  })

  it("takes a title when given one", () => {
    expect(compileJournal(entries, FIFI, { title: "Fifi of Copperas Cove" }).markdown.startsWith("# Fifi of Copperas Cove")).toBe(true)
  })

  it("compiles an empty book without inventing a page", () => {
    const c = compileJournal([], FIFI)
    expect(c.pages).toEqual([])
    expect(c.markdown).toBe("")
    expect(c.foreignPages).toBe(0)
  })
})
