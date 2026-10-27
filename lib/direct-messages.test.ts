import { describe, expect, it } from "vitest"
import { cleanMessage, contactsFor, directRow, inThread, isForMe, MAX_MESSAGE, threadOf, totalUnread, unreadBySender, type DirectRow } from "./direct-messages"

const row = (id: string, speaker: string, recipient: string, at: string, text = "hi"): DirectRow => ({ id, speaker, recipient, text, created_at: at })

describe("contactsFor", () => {
  const seats = [
    { id: "a", name: "Fifi of Waterdeep" },
    { id: "b", name: "Kenta of Neverwinter", thumbnail: "/k.png" },
    { id: "c", name: "Ront", dm: true },
    { id: "d", name: "Scott Reedwind", away: true },
    { id: "e", name: "Samson Stillwater" },
  ]
  it("lists every other seated player, not me, not DM companions, not players stepped away", () => {
    expect(contactsFor(seats, "a").map((c) => c.name)).toEqual(["Kenta of Neverwinter", "Samson Stillwater"])
  })
  it("carries the thumbnail", () => {
    expect(contactsFor(seats, "a")[0].thumbnail).toBe("/k.png")
  })
  it("with no id of my own lists everyone eligible", () => {
    expect(contactsFor(seats, null)).toHaveLength(3)
  })
})

describe("threads", () => {
  const rows = [
    row("1", "Fifi", "Kenta", "2026-10-26T10:00:02Z"),
    row("2", "Kenta", "Fifi", "2026-10-26T10:00:01Z"),
    row("3", "Kenta", "Samson", "2026-10-26T10:00:03Z"),
    row("4", "fifi ", "KENTA", "2026-10-26T10:00:04Z"),
  ]
  it("keeps both directions of one pair, oldest first, case and spacing insensitive", () => {
    expect(threadOf(rows, "Fifi", "Kenta").map((r) => r.id)).toEqual(["2", "1", "4"])
  })
  it("never shows someone else's conversation", () => {
    expect(threadOf(rows, "Fifi", "Samson")).toEqual([])
    expect(inThread(rows[2], "Fifi", "Kenta")).toBe(false)
  })
})

describe("unread", () => {
  const rows = [
    row("1", "Kenta", "Fifi", "2026-10-26T10:00:01Z"),
    row("2", "Kenta", "Fifi", "2026-10-26T10:00:05Z"),
    row("3", "Samson", "Fifi", "2026-10-26T10:00:06Z"),
    row("4", "Fifi", "Kenta", "2026-10-26T10:00:07Z"),
    row("5", "Kenta", "Samson", "2026-10-26T10:00:08Z"),
  ]
  it("counts only messages to me, per sender", () => {
    expect(unreadBySender(rows, "Fifi", {})).toEqual({ kenta: 2, samson: 1 })
  })
  it("drops what I have read", () => {
    const counts = unreadBySender(rows, "Fifi", { kenta: "2026-10-26T10:00:01Z" })
    expect(counts).toEqual({ kenta: 1, samson: 1 })
    expect(totalUnread(counts)).toBe(2)
  })
  it("my own lines are never unread", () => {
    expect(isForMe(rows[3], "Fifi")).toBe(false)
  })
})

describe("sending", () => {
  it("trims, collapses and caps", () => {
    expect(cleanMessage("   ")).toBeNull()
    expect(cleanMessage("  meet  me\n at the gate ")).toBe("meet me at the gate")
    expect(cleanMessage("x".repeat(MAX_MESSAGE + 40))).toHaveLength(MAX_MESSAGE)
  })
  it("builds a direct-channel row addressed by hero name", () => {
    expect(directRow("Fifi", "Kenta", "now")).toEqual({ speaker: "Fifi", speaker_type: "player", channel: "direct", recipient: "Kenta", text: "now" })
  })
})
