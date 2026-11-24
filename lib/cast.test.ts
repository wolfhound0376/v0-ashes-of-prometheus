import { describe, expect, it } from "vitest"
import { abilitiesOf, fileKind, searchWords, uploadPath } from "./cast"

describe("what each agent can do, from the code", () => {
  it("Jimjar's lock and trap help comes from lib/npc-help", () => {
    const a = abilitiesOf("jimjar", "Jimjar").map((x) => x.what).join(" | ")
    expect(a).toMatch(/picks a lock/)
    expect(a).toMatch(/disarms a trap/)
  })
  it("Ront rages and lends might", () => {
    const a = abilitiesOf("ront", "Ront").map((x) => x.what).join(" | ")
    expect(a).toMatch(/Rage/)
    expect(a).toMatch(/lends strength/)
  })
  it("Buppido helps on nothing (his help is the ledge)", () => {
    expect(abilitiesOf("buppido", "Buppido").some((x) => x.what.startsWith("Helps on checks"))).toBe(false)
  })
  it("an unknown key has no invented abilities", () => {
    expect(abilitiesOf("nobody", "Nobody")).toEqual([])
  })
})

describe("files", () => {
  it("searches by real names, not titles", () => {
    expect(searchWords("Prince Derendil", ["Derendil"])).toEqual(["derendil"])
    expect(searchWords("Eldeth Feldrun")).toEqual(["eldeth", "feldrun"])
  })
  it("names an upload safely on the agent's own shelf, never overwriting", () => {
    expect(uploadPath("eldeth", "C:\\Users\\Sam\\Eldeth Shield REF.PNG", 42)).toBe("agents/eldeth/42-eldeth-shield-ref.png")
    expect(uploadPath("eldeth", "../../etc/passwd", 1)).toBe("agents/eldeth/1-passwd")
    expect(uploadPath("Bad Key!", "x.png")).toBeNull()
    expect(uploadPath("eldeth", "")).toBeNull()
  })
  it("knows what a file is", () => {
    expect(fileKind("a/b.webm")).toBe("video")
    expect(fileKind("a/b.PNG")).toBe("image")
    expect(fileKind("a/b.md")).toBe("doc")
  })
})
