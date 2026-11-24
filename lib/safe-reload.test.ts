import { describe, expect, it } from "vitest"
import { isSafePage, isTyping, reloadDecision } from "@/lib/safe-reload"
import { keysToForget, REPAIR_KEEPS, repairedUrl } from "@/lib/repair-device"
import { MIRROR_KEY, CHARACTER_LS_KEY, TOKEN_LS_KEY, ROLE_LS_KEY } from "@/lib/player-pass"
import { DM_KEY_LS_KEY } from "@/lib/dm-key"
import { SETTINGS_KEY } from "@/lib/settings"

const base = { mine: "aaaaaaa", live: "bbbbbbb", pathname: "/table", typing: false, reloadedFor: null }

describe("safe-moment reload (Sam, 2026-11-23: fix cache memory)", () => {
  it("reloads a stale tab on a page between scenes", () => {
    for (const p of ["/intro", "/table", "/join", "/choose", "/t/VKRT", "/table/"]) expect(reloadDecision({ ...base, pathname: p })).toBe("reload")
  })
  it("only shows the notice in the middle of the game", () => {
    for (const p of ["/velkynvelve", "/pit", "/cave", "/camp", "/", "/forge", "/dm", "/awaken", "/tables"]) {
      expect(reloadDecision({ ...base, pathname: p })).toBe("notice")
    }
  })
  it("waits while someone is typing", () => {
    expect(reloadDecision({ ...base, typing: true })).toBe("wait")
  })
  it("never loops: one reload per new build, then the notice", () => {
    expect(reloadDecision({ ...base, reloadedFor: "bbbbbbb" })).toBe("notice")
    expect(reloadDecision({ ...base, reloadedFor: "ccccccc" })).toBe("reload")
  })
  it("is quiet when the builds agree, before the first answer, and in development", () => {
    expect(reloadDecision({ ...base, live: "aaaaaaa" })).toBe("none")
    expect(reloadDecision({ ...base, live: null })).toBe("none")
    expect(reloadDecision({ ...base, mine: "dev", live: "bbbbbbb" })).toBe("none")
  })
  it("knows a text box from a button", () => {
    expect(isTyping({ tagName: "INPUT", type: "text" })).toBe(true)
    expect(isTyping({ tagName: "INPUT" })).toBe(true)
    expect(isTyping({ tagName: "TEXTAREA" })).toBe(true)
    expect(isTyping({ tagName: "DIV", isContentEditable: true })).toBe(true)
    expect(isTyping({ tagName: "INPUT", type: "checkbox" })).toBe(false)
    expect(isTyping({ tagName: "BUTTON" })).toBe(false)
    expect(isTyping(null)).toBe(false)
  })
  it("treats no path as unsafe", () => {
    expect(isSafePage(null)).toBe(false)
  })
})

describe("Repair this device", () => {
  it("keeps who you are, the DM key and your settings", () => {
    for (const k of [CHARACTER_LS_KEY, TOKEN_LS_KEY, ROLE_LS_KEY, MIRROR_KEY, DM_KEY_LS_KEY, SETTINGS_KEY]) expect(REPAIR_KEEPS).toContain(k)
  })
  it("forgets the rest", () => {
    expect(keysToForget(["aop_character_id", "aop_door_then", "aop_combat_bag", "vv-light", "aop_forge2014_v1"])).toEqual(["aop_door_then", "aop_combat_bag", "vv-light"])
  })
  it("reloads the same page with a stamp", () => {
    expect(repairedUrl("https://ashes.playacartagena.com/intro?x=1", 5)).toBe("https://ashes.playacartagena.com/intro?x=1&repaired=5")
    expect(repairedUrl("not a url", 5)).toBe("not a url")
  })
})
