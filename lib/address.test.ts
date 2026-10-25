import { describe, expect, it } from "vitest"
import { addressTagFor, isBracketed, parseAddress, resolveAddressee, storedText } from "./address"

describe("parseAddress", () => {
  it("sends /dm (and /ooc, /gm) to the DM and drops the shortcut", () => {
    expect(parseAddress("/dm what do I see?")).toEqual({ text: "what do I see?", address: { to: "dm" }, shortcut: "slash" })
    expect(parseAddress("/DM: is the door trapped")).toEqual({ text: "is the door trapped", address: { to: "dm" }, shortcut: "slash" })
    expect(parseAddress("/ooc brb")).toEqual({ text: "brb", address: { to: "dm" }, shortcut: "slash" })
    expect(parseAddress("/gm, ruling?")).toEqual({ text: "ruling?", address: { to: "dm" }, shortcut: "slash" })
    expect(parseAddress("/dm")).toEqual({ text: "", address: { to: "dm" }, shortcut: "slash" })
  })

  it("reads a whole line in brackets as out of character", () => {
    expect(parseAddress("(what do I see?)")).toEqual({ text: "what do I see?", address: { to: "dm" }, shortcut: "parens" })
    expect(parseAddress("  ( can we short rest here )  ")).toEqual({ text: "can we short rest here", address: { to: "dm" }, shortcut: "parens" })
  })

  it("does not mistake brackets inside a line for the sign", () => {
    expect(parseAddress("I draw my sword (slowly) and step forward").address).toBe(null)
    expect(parseAddress("(a) and (b)").address).toBe(null)
    expect(parseAddress("(unbalanced").address).toBe(null)
    expect(parseAddress("()").address).toBe(null)
  })

  it("sends @Name to that NPC for one line", () => {
    expect(parseAddress("@Ront where is the key?")).toEqual({ text: "where is the key?", address: { to: "npc", name: "Ront" }, shortcut: "at" })
    expect(parseAddress("@Eldeth, can you fight?")).toEqual({ text: "can you fight?", address: { to: "npc", name: "Eldeth" }, shortcut: "at" })
    expect(parseAddress("@Shuushar: peace").text).toBe("peace")
  })

  it("leaves an ordinary line alone", () => {
    expect(parseAddress("I pick the lock")).toEqual({ text: "I pick the lock", address: null, shortcut: null })
    expect(parseAddress("email me at sam@example.com").address).toBe(null)
    expect(parseAddress("")).toEqual({ text: "", address: null, shortcut: null })
  })
})

describe("isBracketed", () => {
  it("wants one pair around the whole line", () => {
    expect(isBracketed("(x)")).toBe(true)
    expect(isBracketed("((x))")).toBe(true)
    expect(isBracketed("(x) y")).toBe(false)
    expect(isBracketed("(x) (y)")).toBe(false)
    expect(isBracketed("x")).toBe(false)
  })
})

describe("storedText and addressTagFor round-trip through the log", () => {
  it("keeps a DM line in brackets and reads it back", () => {
    const s = storedText("what do I see?", { to: "dm" })
    expect(s).toBe("(what do I see?)")
    expect(addressTagFor(s)).toEqual({ tag: "the DM", body: "what do I see?" })
    expect(storedText("(already)", { to: "dm" })).toBe("(already)")
  })

  it("keeps an @ line marked and reads it back", () => {
    const s = storedText("where is the key?", { to: "npc", name: "Ront" })
    expect(s).toBe("@Ront where is the key?")
    expect(addressTagFor(s)).toEqual({ tag: "Ront", body: "where is the key?" })
  })

  it("marks nothing on an ordinary line", () => {
    expect(storedText("I pick the lock", null)).toBe("I pick the lock")
    expect(addressTagFor("I pick the lock")).toBe(null)
    expect(addressTagFor("I draw my sword (slowly)")).toBe(null)
  })
})

describe("resolveAddressee", () => {
  const stage = [{ name: "Eldeth Feldrun" }, { name: "Ront" }, { name: "Shuushar the Awakened" }, { name: "Prince Derendil" }]
  it("matches the full name or any distinctive word of it, case-insensitively", () => {
    expect(resolveAddressee("ront", stage)).toBe("Ront")
    expect(resolveAddressee("Eldeth", stage)).toBe("Eldeth Feldrun")
    expect(resolveAddressee("feldrun", stage)).toBe("Eldeth Feldrun")
    expect(resolveAddressee("Derendil", stage)).toBe("Prince Derendil")
    expect(resolveAddressee("Shuushar", stage)).toBe("Shuushar the Awakened")
  })
  it("is null for someone not on stage", () => {
    expect(resolveAddressee("Jorlan", stage)).toBe(null)
    expect(resolveAddressee("the", stage)).toBe(null)
  })
})
