import { describe, expect, it } from "vitest"
import {
  PENDING_CODE_MS, ROOM_CODE_LETTERS, codeOpens, freshRoomCode, isRoomCode, makeRoomCode, normalizeRoomCode, pendingCodeValue, readPendingCode, roomLink,
} from "./room-code"

describe("makeRoomCode", () => {
  it("is four letters from the safe set, never a vowel", () => {
    for (let i = 0; i < 500; i++) {
      const c = makeRoomCode()
      expect(isRoomCode(c), c).toBe(true)
      expect(c).not.toMatch(/[AEIOUY]/)
    }
  })
  it("uses the whole alphabet, ends included", () => {
    expect(makeRoomCode(() => 0)).toBe("BBBB")
    expect(makeRoomCode(() => 0.99999)).toBe("ZZZZ")
    expect(ROOM_CODE_LETTERS).toHaveLength(20)
  })
  it("a fresh code is never the old one", () => {
    let n = 0
    const seq = () => (n++ < 8 ? 0 : 0.5) // first two codes come out BBBB
    expect(freshRoomCode("BBBB", seq)).not.toBe("BBBB")
  })
})

describe("normalizeRoomCode / codeOpens", () => {
  it("forgives case, spaces and dashes", () => {
    expect(normalizeRoomCode("vk rt")).toBe("VKRT")
    expect(normalizeRoomCode("V-K-R-T")).toBe("VKRT")
    expect(normalizeRoomCode("VKR")).toBeNull()
    expect(normalizeRoomCode("VELK")).toBeNull() // E is not a code letter
    expect(normalizeRoomCode(42)).toBeNull()
  })
  it("only a live code on an open table opens it", () => {
    expect(codeOpens("VKRT", "lobby", "vkrt")).toBe(true)
    expect(codeOpens("VKRT", "live", "VKRT")).toBe(true)
    expect(codeOpens("VKRT", "closed", "VKRT")).toBe(false)
    expect(codeOpens("VKRT", "lobby", "BBBB")).toBe(false)
    expect(codeOpens(null, "lobby", "VKRT")).toBe(false)
    expect(codeOpens("VKRT", "lobby", null)).toBe(false)
  })
})

describe("the link and the pending code", () => {
  it("builds the link from the origin", () => {
    expect(roomLink("https://ashes.playacartagena.com/", "VKRT")).toBe("https://ashes.playacartagena.com/t/VKRT")
  })
  it("a followed link counts for two hours, then is forgotten", () => {
    const now = 1_800_000_000_000
    expect(readPendingCode(pendingCodeValue("VKRT", now), now + 1000)).toBe("VKRT")
    expect(readPendingCode(pendingCodeValue("VKRT", now), now + PENDING_CODE_MS + 1)).toBeNull()
    expect(readPendingCode("VKRT", now)).toBeNull()
    expect(readPendingCode("junk@123", now)).toBeNull()
    expect(readPendingCode(null, now)).toBeNull()
  })
})
