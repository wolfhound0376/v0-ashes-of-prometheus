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
  it("keeps what this device has already been through, so nothing replays", () => {
    for (const k of ["aop_intro_seen_ever", "aop-cinematics-played", "aop_pit_done", "aop_forge2014_v1"]) expect(REPAIR_KEEPS).toContain(k)
  })
  it("forgets the rest", () => {
    expect(keysToForget(["aop_character_id", "aop_door_then", "aop_combat_bag", "vv-light", "aop_forge2014_v1"])).toEqual(["aop_door_then", "aop_combat_bag", "vv-light"])
  })
  it("reloads the same page with a stamp", () => {
    expect(repairedUrl("https://ashes.playacartagena.com/intro?x=1", 5)).toBe("https://ashes.playacartagena.com/intro?x=1&repaired=5")
    expect(repairedUrl("not a url", 5)).toBe("not a url")
  })
})

import { readFileSync } from "node:fs"
import { isSafeMoment, momentDecision, SAFE_MOMENT_MESSAGE } from "./safe-reload"

describe("the map's safe moment", () => {
  it("knows the map's word, and nothing else", () => {
    expect(isSafeMoment({ type: SAFE_MOMENT_MESSAGE, plate: "10" })).toBe(true)
    expect(isSafeMoment({ type: "aop:walk-film", cue: "look-around" })).toBe(false)
    expect(isSafeMoment(null)).toBe(false)
    expect(isSafeMoment("aop:safe-moment")).toBe(false)
  })
  it("a stale tab reloads at it, once per build", () => {
    expect(momentDecision({ mine: "aaa1111", live: "bbb2222", reloadedFor: null })).toBe("reload")
    expect(momentDecision({ mine: "aaa1111", live: "bbb2222", reloadedFor: "bbb2222" })).toBe("none")   // tried already: no loop
    expect(momentDecision({ mine: "aaa1111", live: "ccc3333", reloadedFor: "bbb2222" })).toBe("reload")  // a newer one again
  })
  it("a current tab, a dev build, or no answer yet never reloads", () => {
    expect(momentDecision({ mine: "aaa1111", live: "aaa1111", reloadedFor: null })).toBe("none")
    expect(momentDecision({ mine: "dev", live: "bbb2222", reloadedFor: null })).toBe("none")
    expect(momentDecision({ mine: "aaa1111", live: null, reloadedFor: null })).toBe("none")
  })
  it("the built map says it only after a plain crossing has settled, with the walk saved first", () => {
    for (const f of ["scripts/velkynvelve-walk/template.html", "public/velkynvelve-walk/index.html"]) {
      const html = readFileSync(f, "utf8")
      const at = html.indexOf("function safeMoment(n, opts){")
      expect(at).toBeGreaterThan(-1)
      const body = html.slice(at, html.indexOf("\n}\n", at))
      expect(html).toContain("  owEntered();\n  setTimeout(() => { if (cur === n) warmPlates(n); }, 1200);   // once this plate has settled, fetch the ones next door (DOORS DON'T WAIT)\n  safeMoment(n, opts);\n}")
      for (const guard of ["SANDBOX", "opts.battle", "opts.solo", 'mode !== "explore"', "cbt", "FIGHT.mirror", "battleLive()", "laborLive()", "surrenderFresh()", "surgeon", "timeStopped", "GATHER.hold", '$("dialog").hidden', '$("talk").hidden'])
        expect(body).toContain(guard)
      expect(body.indexOf("saveWalk();")).toBeLessThan(body.indexOf(`type: "${SAFE_MOMENT_MESSAGE}"`))
      expect(body.indexOf("saveWalk();")).toBeGreaterThan(-1)
    }
  })
  it("the page listens for it and checks the origin", () => {
    const watch = readFileSync("components/build-watch.tsx", "utf8")
    expect(watch).toMatch(/e\.origin !== window\.location\.origin \|\| !isSafeMoment\(e\.data\)/)
    expect(watch).toContain('momentDecision({ mine: MY_BUILD, live, reloadedFor }) !== "reload"')
  })
})
