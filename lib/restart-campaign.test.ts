import { describe, it, expect, vi } from "vitest"
import { archiveThenWipeDialogue, smuggledRows, SMUGGLED_EFFECTS, CLASS_KEEPSAKES } from "./restart-campaign"

// Sam, 2026-10-30: "archive never delete as a rule." These tests exist for one
// claim only — that the wipe is unreachable unless the archive succeeded. If
// someone ever reorders those two calls, this file is what says no.

function fakeAdmin(opts: {
  rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  del?: () => Promise<{ count: number | null; error: { message: string } | null }>
}) {
  const del = vi.fn(opts.del ?? (async () => ({ count: 7, error: null })))
  const neq = vi.fn(() => del())
  const deleteFn = vi.fn(() => ({ neq }))
  const from = vi.fn(() => ({ delete: deleteFn }))
  const rpc = vi.fn(opts.rpc ?? (async () => ({ data: 7, error: null })))
  return { admin: { rpc, from } as never, rpc, from, deleteFn, del }
}

describe("archiveThenWipeDialogue", () => {
  it("archives first, then deletes", async () => {
    const calls: string[] = []
    const { admin } = fakeAdmin({
      rpc: async () => {
        calls.push("archive")
        return { data: 7, error: null }
      },
      del: async () => {
        calls.push("delete")
        return { count: 7, error: null }
      },
    })
    await archiveThenWipeDialogue(admin)
    expect(calls).toEqual(["archive", "delete"])
  })

  it("calls archive_dialogue with a batch id and reports it", async () => {
    const { admin, rpc } = fakeAdmin({})
    const out = await archiveThenWipeDialogue(admin)
    expect(rpc).toHaveBeenCalledWith("archive_dialogue", { batch: expect.any(String) })
    expect(out.report.dialogueArchiveBatch).toBe((rpc.mock.calls[0]![1] as { batch: string }).batch)
  })

  it("reports what was archived and what was deleted", async () => {
    const { admin } = fakeAdmin({})
    const out = await archiveThenWipeDialogue(admin)
    expect(out.report.dialogueArchived).toBe(7)
    expect(out.report.dialogueDeleted).toBe(7)
    expect(out.problem).toBeNull()
  })

  it("DOES NOT DELETE when the archive errors — the whole point", async () => {
    const { admin, from, del } = fakeAdmin({
      rpc: async () => ({ data: null, error: { message: "function archive_dialogue does not exist" } }),
    })
    const out = await archiveThenWipeDialogue(admin)
    expect(from).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
    expect(out.report.dialogueDeleted).toBe(0)
  })

  it("reports the archive failure loudly rather than passing silently", async () => {
    const { admin } = fakeAdmin({
      rpc: async () => ({ data: null, error: { message: "function archive_dialogue does not exist" } }),
    })
    const out = await archiveThenWipeDialogue(admin)
    expect(out.problem).toBe("dialogue archive (wipe skipped)")
    expect(out.report.dialogueArchiveError).toContain("archive_dialogue")
  })

  it("still reports a problem when the archive worked but the delete failed", async () => {
    const { admin } = fakeAdmin({
      del: async () => ({ count: null, error: { message: "permission denied" } }),
    })
    const out = await archiveThenWipeDialogue(admin)
    expect(out.report.dialogueArchived).toBe(7)
    expect(out.problem).toBe("dialogue")
  })

  it("survives an rpc that returns a non-number count", async () => {
    const { admin } = fakeAdmin({ rpc: async () => ({ data: null, error: null }) })
    const out = await archiveThenWipeDialogue(admin)
    expect(out.report.dialogueArchived).toBe(0)
    expect(out.report.dialogueDeleted).toBe(7)
  })
})

// Item identity, step 4: the journal and quill a New Game issues are catalogue items like everything else.
describe("smuggledRows", () => {
  const catalogue = new Map([["tattered-journal", "id-journal"], ["small-quill", "id-quill"]])

  it("gives every hero a journal and a quill, each linked to its catalogue kind", () => {
    const rows = smuggledRows(["a", "b"], catalogue)
    expect(rows).toHaveLength(2 * SMUGGLED_EFFECTS.length)
    expect(rows.filter((r) => r.character_id === "a").map((r) => [r.name, r.item_id])).toEqual([
      ["Tattered Journal", "id-journal"],
      ["Small Quill", "id-quill"],
    ])
    expect(rows.every((r) => r.item_id)).toBe(true)
  })

  it("does not write the slug as a column", () => {
    for (const r of smuggledRows(["a"], catalogue)) expect(r).not.toHaveProperty("slug")
  })

  it("still issues the item, unlinked, when the catalogue has lost the kind", () => {
    const rows = smuggledRows(["a"], new Map([["small-quill", "id-quill"]]))
    expect(rows.map((r) => r.item_id)).toEqual([null, "id-quill"])
    expect(rows[0].name).toBe("Tattered Journal")
  })
})

// Sam, 2026-11-10: "Gandalf should have his spellbook hidden with him just like the cleric having a book of prayers."
describe("the book a caster kept", () => {
  const catalogue = new Map([["tattered-journal", "id-journal"], ["small-quill", "id-quill"], ["spellbook", "id-spellbook"], ["book-of-prayers", "id-prayers"]])
  const names = (rows: { name: string }[]) => rows.map((r) => r.name)

  it("gives the wizard his spellbook with the journal and quill", () => {
    const rows = smuggledRows([{ id: "gandalf", class: "Wizard" }], catalogue)
    expect(names(rows)).toEqual(["Tattered Journal", "Small Quill", "Spellbook"])
    expect(rows[2]).toMatchObject({ character_id: "gandalf", item_id: "id-spellbook", quantity: 1 })
  })

  it("gives the cleric a book of prayers", () => {
    const rows = smuggledRows([{ id: "samson", class: "cleric" }], catalogue)
    expect(names(rows)).toEqual(["Tattered Journal", "Small Quill", "Book of Prayers"])
    expect(rows[2].item_id).toBe("id-prayers")
  })

  it("gives every other class the journal and quill only", () => {
    for (const cls of ["Rogue", "Sorcerer", "Warlock", "Bard", "Barbarian", null, undefined, ""])
      expect(names(smuggledRows([{ id: "x", class: cls }], catalogue))).toEqual(["Tattered Journal", "Small Quill"])
  })

  it("names only classes that exist, and never writes the slug as a column", () => {
    expect(Object.keys(CLASS_KEEPSAKES).sort()).toEqual(["cleric", "wizard"])
    for (const r of smuggledRows([{ id: "g", class: "Wizard" }], catalogue)) expect(r).not.toHaveProperty("slug")
  })
})
