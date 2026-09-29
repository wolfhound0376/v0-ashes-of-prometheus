import { describe, expect, it } from "vitest"
import {
  QUEST_EXAMPLE,
  QUEST_STATES,
  QUEST_TAG_RULES,
  RESOLVED_STATES,
  decideQuest,
  formatQuestBlock,
  normaliseQuestState,
  openQuests,
  parseQuestTags,
  questKey,
  questLog,
  stripQuestTags,
  type QuestPage,
} from "./quests"

const BROTHER = questKey("Find Sarith's brother")
const ESCAPE = questKey("Escape Velkynvelve")

function page(key: string, state: string, at: string, title = key): QuestPage {
  return { section: "quests", title, tags: { kind: "quest", key, state, title }, created_at: at }
}

// ---------------------------------------------------------------------------
// §1 The tag
// ---------------------------------------------------------------------------

describe("the quest tag", () => {
  it("lifts state, title and note out of the prose", () => {
    const raw = "Sarith looks at the floor.\n[QUEST: accept | Find Sarith's brother | He was taken east.]"
    expect(parseQuestTags(raw)).toEqual([
      { state: "accept", title: "Find Sarith's brother", note: "He was taken east." },
    ])
  })

  it("takes a tag with no note", () => {
    expect(parseQuestTags("[QUEST: complete | Find Sarith's brother]")).toEqual([
      { state: "complete", title: "Find Sarith's brother", note: null },
    ])
  })

  it("never lets the tag reach the table", () => {
    const shown = stripQuestTags("You agree.\n[QUEST: accept | A thing]\nMalachar smiles.")
    expect(shown).not.toContain("QUEST")
    expect(shown).toContain("Malachar smiles.")
  })

  it("does not carry lastIndex between calls", () => {
    const raw = "[QUEST: accept | A thing]"
    expect(parseQuestTags(raw)).toHaveLength(1)
    expect(parseQuestTags(raw)).toHaveLength(1)
    expect(parseQuestTags(raw)).toHaveLength(1)
  })

  it("reads however he words the state", () => {
    expect(normaliseQuestState("accept")).toBe("accepted")
    expect(normaliseQuestState("Taken")).toBe("accepted")
    expect(normaliseQuestState("DONE")).toBe("completed")
    expect(normaliseQuestState("gave up")).toBeNull()
    expect(normaliseQuestState("dropped")).toBe("abandoned")
    expect(normaliseQuestState("nonsense")).toBeNull()
  })

  it("knows which states close a quest", () => {
    expect([...QUEST_STATES]).toEqual(["accepted", "completed", "failed", "abandoned"])
    expect(RESOLVED_STATES.has("accepted")).toBe(false)
    expect(RESOLVED_STATES.has("failed")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// §2 The key
// ---------------------------------------------------------------------------

describe("the quest key", () => {
  // Malachar writes prose, not form fields. He WILL reword the title.
  it("survives him rewording the title", () => {
    expect(questKey("Find Sarith's Brother!")).toBe(questKey("find the brother of Sarith"))
    expect(questKey("Escape Velkynvelve")).toBe(questKey("escape  velkynvelve."))
  })

  it("does not collapse two genuinely different quests", () => {
    expect(questKey("Find Sarith's brother")).not.toBe(questKey("Find Eldeth's axe"))
  })

  it("returns empty only when there is genuinely nothing there", () => {
    expect(questKey("")).toBe("")
    expect(questKey("   ")).toBe("")
    expect(questKey("!!! ---")).toBe("")
  })

  // This assertion was the other way round and was WRONG. Dropping stop words
  // can empty a real title — "The End" is a quest somebody might name — and a
  // title with no key cannot be tracked at all. So the filter falls back to
  // the whole title rather than refusing it.
  it("keeps a title made entirely of small words rather than losing it", () => {
    expect(questKey("The End")).toBe("end")
    expect(questKey("  the of a  ")).not.toBe("")
  })
})

// ---------------------------------------------------------------------------
// §3 Filing
// ---------------------------------------------------------------------------

describe("filing a quest", () => {
  it("files an accepted quest with no prompt", () => {
    const d = decideQuest({ tag: { state: "accept", title: "Find Sarith's brother", note: "He was taken east." } })
    expect(d.file).not.toBeNull()
    expect(d.file?.section).toBe("quests")
    expect(d.file?.author).toBe("malachar")
    expect(d.file?.visibility).toBe("private")
    expect(d.file?.body).toBe("He was taken east.")
    expect(d.file?.tags.state).toBe("accepted")
    expect(d.flags).toEqual([])
  })

  it("writes something sensible when he gives a bare tag", () => {
    const d = decideQuest({ tag: { state: "accept", title: "Escape Velkynvelve", note: null } })
    expect(d.file?.body).toContain("Escape Velkynvelve")
  })

  it("refuses a state it does not know", () => {
    const d = decideQuest({ tag: { state: "pondered", title: "A thing", note: null } })
    expect(d.file).toBeNull()
    expect(d.note).toContain("not a quest state")
  })

  it("refuses a quest with no title, because nothing could track it", () => {
    expect(decideQuest({ tag: { state: "accept", title: "", note: "x" } }).file).toBeNull()
    expect(decideQuest({ tag: { state: "accept", title: "   ", note: "x" } }).file).toBeNull()
    expect(decideQuest({ tag: { state: "accept", title: "!!!", note: "x" } }).file).toBeNull()
  })

  it("files a short or oddly worded title rather than dropping the quest", () => {
    expect(decideQuest({ tag: { state: "accept", title: "The End", note: "x" } }).file).not.toBeNull()
  })

  it("does not accept the same quest twice", () => {
    const open = questLog([page(questKey("Find Sarith's brother"), "accepted", "2026-09-01T00:00:00Z", "Find Sarith's brother")])
    const d = decideQuest({ tag: { state: "accept", title: "find the brother of Sarith", note: null }, open })
    expect(d.file).toBeNull()
    expect(d.note).toContain("already open")
  })

  it("does not close the same quest twice", () => {
    const open = questLog([
      page(BROTHER, "accepted", "2026-09-01T00:00:00Z", "Find Sarith's brother"),
      page(BROTHER, "completed", "2026-09-09T00:00:00Z", "Find Sarith's brother"),
    ])
    const d = decideQuest({ tag: { state: "complete", title: "Find Sarith's brother", note: null }, open })
    expect(d.file).toBeNull()
    expect(d.note).toContain("already completed")
  })

  it("re-accepting a closed quest is allowed — people go back to things", () => {
    const open = questLog([
      page(BROTHER, "accepted", "2026-09-01T00:00:00Z"),
      page(BROTHER, "failed", "2026-09-09T00:00:00Z"),
    ])
    const d = decideQuest({ tag: { state: "accept", title: "Find Sarith's brother", note: null }, open })
    expect(d.file).not.toBeNull()
  })

  // Losing the event entirely would be worse than filing an orphan.
  it("files a resolution for a quest never accepted, and says so", () => {
    const d = decideQuest({ tag: { state: "complete", title: "Something offscreen", note: null }, open: [] })
    expect(d.file).not.toBeNull()
    expect(d.flags.join(" ")).toContain("no accepted page")
  })

  it("flags every state except accepted as still needing Sam's yes", () => {
    expect(decideQuest({ tag: { state: "accept", title: "A", note: null } }).flags).toEqual([])
    expect(decideQuest({ tag: { state: "fail", title: "A", note: null } }).flags.join(" ")).toContain("need his yes")
  })
})

// ---------------------------------------------------------------------------
// §4 The log
// ---------------------------------------------------------------------------

describe("folding pages into a log", () => {
  const pages: QuestPage[] = [
    page(BROTHER, "accepted", "2026-09-01T00:00:00Z", "Find Sarith's brother"),
    page(ESCAPE, "accepted", "2026-09-02T00:00:00Z", "Escape Velkynvelve"),
    page(BROTHER, "completed", "2026-09-09T00:00:00Z", "Find Sarith's brother"),
  ]

  it("folds two pages about one quest into one entry", () => {
    const log = questLog(pages)
    expect(log).toHaveLength(2)
    const brother = log.find((q) => q.key === BROTHER)
    expect(brother?.state).toBe("completed")
    expect(brother?.resolved).toBe(true)
    expect(brother?.pages).toBe(2)
    expect(brother?.acceptedAt).toBe("2026-09-01T00:00:00Z")
    expect(brother?.resolvedAt).toBe("2026-09-09T00:00:00Z")
  })

  it("puts what is still open first", () => {
    expect(questLog(pages)[0].key).toBe(ESCAPE)
    expect(openQuests(pages).map((q) => q.key)).toEqual([ESCAPE])
  })

  it("lets the most recent page win, so a reopened quest reads as open", () => {
    const reopened = [...pages, page(BROTHER, "accepted", "2026-09-20T00:00:00Z")]
    const brother = questLog(reopened).find((q) => q.key === BROTHER)
    expect(brother?.resolved).toBe(false)
    expect(brother?.resolvedAt).toBeNull()
  })

  it("keeps the title it was first given", () => {
    const renamed = [
      page(BROTHER, "accepted", "2026-09-01T00:00:00Z", "Find Sarith's brother"),
      page(BROTHER, "completed", "2026-09-09T00:00:00Z", "The Matter of the Missing Kin"),
    ]
    expect(questLog(renamed)[0].title).toBe("Find Sarith's brother")
  })

  it("ignores pages from other sections", () => {
    const mixed: QuestPage[] = [
      { section: "pages", title: "x", tags: { kind: "quest", key: "k", state: "accepted", title: "x" }, created_at: "2026-09-01T00:00:00Z" },
    ]
    expect(questLog(mixed)).toEqual([])
  })

  it("ignores a quest page with unusable tags rather than guessing", () => {
    const junk: QuestPage[] = [
      { section: "quests", tags: null, created_at: "2026-09-01T00:00:00Z" },
      { section: "quests", tags: { kind: "note" }, created_at: "2026-09-01T00:00:00Z" },
      { section: "quests", tags: { kind: "quest", key: "", state: "accepted" }, created_at: "2026-09-01T00:00:00Z" },
      { section: "quests", tags: { kind: "quest", key: "k", state: "nonsense" }, created_at: "2026-09-01T00:00:00Z" },
    ]
    expect(questLog(junk)).toEqual([])
  })

  it("reads an empty book without inventing a quest", () => {
    expect(questLog([])).toEqual([])
    expect(openQuests([])).toEqual([])
  })

  it("orders by when it was written, not by the order it was handed in", () => {
    const shuffled = [pages[2], pages[0], pages[1]]
    const brother = questLog(shuffled).find((q) => q.key === BROTHER)
    expect(brother?.state).toBe("completed")
    expect(brother?.acceptedAt).toBe("2026-09-01T00:00:00Z")
  })
})

// ---------------------------------------------------------------------------
// §5 The prompt
// ---------------------------------------------------------------------------

describe("the quest block", () => {
  it("says nothing when the book is empty", () => {
    expect(formatQuestBlock({ open: [] })).toBe("")
  })

  // The commonest way an AI DM breaks continuity, and one the system can
  // simply prevent.
  it("stops him offering a quest the party already took", () => {
    const b = formatQuestBlock({ open: openQuests([page(ESCAPE, "accepted", "2026-09-02T00:00:00Z", "Escape Velkynvelve")]) })
    expect(b).toContain("Escape Velkynvelve")
    expect(b).toContain("do not offer these again")
  })

  it("lets him refer back to what is finished", () => {
    const b = formatQuestBlock({
      open: [],
      recentlyClosed: questLog([
        page(BROTHER, "accepted", "2026-09-01T00:00:00Z", "Find Sarith's brother"),
        page(BROTHER, "completed", "2026-09-09T00:00:00Z", "Find Sarith's brother"),
      ]),
    })
    expect(b).toContain("CLOSED")
    expect(b).toContain("completed")
  })

  it("documents the tag with a worked example the parser can read", () => {
    expect(QUEST_TAG_RULES).toContain("[QUEST:")
    expect(QUEST_TAG_RULES).toContain(QUEST_EXAMPLE)
    const parsed = parseQuestTags(QUEST_EXAMPLE)
    expect(parsed).toHaveLength(1)
    expect(normaliseQuestState(parsed[0].state)).toBe("accepted")
  })

  it("tells him it files itself, so he never asks", () => {
    expect(QUEST_TAG_RULES).toContain("files itself")
    expect(QUEST_TAG_RULES).toContain("never ask")
  })
})
