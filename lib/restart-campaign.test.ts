import { describe, it, expect, vi } from "vitest"
import { archiveThenWipeDialogue } from "./restart-campaign"

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
