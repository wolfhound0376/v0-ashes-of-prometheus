import { describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"

// The DM's watch buttons (2026-10-30). Like walk-drop.test.ts and walk-long-jump.test.ts, this pulls the SHIPPED
// setWatch() out of the generated page and runs it, so a re-typed copy in a test cannot pass while the page ships
// something else — which matters here more than usual, because the bug being fixed was precisely that the button
// did something different from what everyone believed it did.
//
// What it must do: in the app, tell the game (POST /api/map-stage) and apply the server's own watch object, `since`
// included, so followWatch's dedupe (watchPlayed === w.since) skips the poll that brings the same change back.
// Without a game behind it, fall back to the old local preview. And on failure, say so rather than playing the
// change locally and leaving this browser believing something the rest of the table never saw.

const ROOT = path.join(__dirname, "..")
const PAGE = fs.readFileSync(path.join(ROOT, "public/velkynvelve-walk/index.html"), "utf8")

function grab(name: string): string {
  const i = PAGE.indexOf(`function ${name}(`)
  if (i < 0) throw new Error(`the walk no longer defines ${name}()`)
  let depth = 0
  for (let k = PAGE.indexOf("{", i); k < PAGE.length; k++) {
    if (PAGE[k] === "{") depth++
    else if (PAGE[k] === "}" && --depth === 0) return PAGE.slice(i, k + 1)
  }
  throw new Error(`unbalanced ${name}()`)
}

type Harness = {
  setWatch: (st: string) => Promise<void>
  readonly storyWatch: { state: string; since: string } | null
  fetchCalls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[]
  followed: ({ state: string; since: string } | null)[]
  toasts: string[]
  logs: string[]
  fakeWatchCalls: string[]
}

/** The shipped setWatch, wired to spies. `reply` is what /api/map-stage answers, or an Error it throws. */
function harness(opts: { app: boolean; reply?: unknown; status?: number; throws?: boolean }): Harness {
  const fetchCalls: Harness["fetchCalls"] = []
  const followed: Harness["followed"] = []
  const toasts: string[] = []
  const logs: string[] = []
  const fakeWatchCalls: string[] = []

  const fakeFetch = async (url: string, init: Harness["fetchCalls"][0]["init"]) => {
    fetchCalls.push({ url, init })
    if (opts.throws) throw new Error("network down")
    const status = opts.status ?? 200
    return { ok: status >= 200 && status < 300, status, json: async () => opts.reply }
  }

  // `async` is dropped by grab() (it anchors on "function"), so it goes back on here.
  const body = `
    let storyWatch = null;
    async ${grab("setWatch")}
    return { setWatch, get storyWatch(){ return storyWatch } };
  `
  const made = new Function("APP", "fakeWatch", "fetch", "dmHeaders", "toast", "followWatch", "log", body)(
    opts.app,
    (st: string) => fakeWatchCalls.push(st),
    fakeFetch,
    () => ({ "x-dm-key": "gloom-tallow-hush-193" }),
    (t: string) => toasts.push(t),
    (w: { state: string; since: string } | null) => followed.push(w),
    (t: string) => logs.push(t),
  )
  // NOT `{ ...made }`: spreading evaluates the storyWatch getter once, freezing it at its value now (null).
  // The getter has to stay live, so it is delegated instead.
  return {
    setWatch: made.setWatch,
    get storyWatch() { return made.storyWatch },
    fetchCalls, followed, toasts, logs, fakeWatchCalls,
  } as Harness
}

const ok = (over: Record<string, unknown> = {}) => ({
  ok: true, watch: { state: "changing", since: "2026-10-30T18:00:00.000Z" },
  gate: null, rotations: 1, jorlanOnDuty: false, updatedAt: "2026-10-30T18:00:00.000Z", ...over,
})

describe("setWatch — without a game behind it", () => {
  it("falls back to the local preview and never calls the server", async () => {
    const h = harness({ app: false })
    await h.setWatch("changing")
    expect(h.fakeWatchCalls).toEqual(["changing"])
    expect(h.fetchCalls).toHaveLength(0)
  })
})

describe("setWatch — in the app", () => {
  it("POSTs the state to /api/map-stage with the DM key", async () => {
    const h = harness({ app: true, reply: ok() })
    await h.setWatch("changing")
    expect(h.fetchCalls).toHaveLength(1)
    const { url, init } = h.fetchCalls[0]
    expect(url).toBe("/api/map-stage")
    expect(init.method).toBe("POST")
    expect(init.headers["x-dm-key"]).toBe("gloom-tallow-hush-193")
    expect(JSON.parse(init.body)).toEqual({ watch: "changing" })
    expect(h.fakeWatchCalls).toHaveLength(0)          // the local preview must NOT also run
  })

  // The dedupe hinges on this: followWatch plays a change once per `since`, so taking the server's own
  // timestamp is what stops the next poll replaying the hand-over a second time.
  it("applies the server's own watch object, since included", async () => {
    const h = harness({ app: true, reply: ok() })
    await h.setWatch("changing")
    expect(h.storyWatch).toEqual({ state: "changing", since: "2026-10-30T18:00:00.000Z" })
    expect(h.followed).toEqual([{ state: "changing", since: "2026-10-30T18:00:00.000Z" }])
  })

  it("reports the rotation count, and Jorlan when he arrives", async () => {
    const h = harness({ app: true, reply: ok({ rotations: 3, jorlanOnDuty: true }) })
    await h.setWatch("changing")
    expect(h.logs.join(" ")).toMatch(/Rotation 3/)
    expect(h.logs.join(" ")).toMatch(/Jorlan is on the watch/)
  })

  it("does not announce Jorlan before he is on", async () => {
    const h = harness({ app: true, reply: ok({ rotations: 1, jorlanOnDuty: false }) })
    await h.setWatch("changing")
    expect(h.logs.join(" ")).toMatch(/Rotation 1/)
    expect(h.logs.join(" ")).not.toMatch(/Jorlan/)
  })

  it("says nothing about rotations for posted or unattended", async () => {
    const h = harness({ app: true, reply: ok({ watch: { state: "unattended", since: "s" } }) })
    await h.setWatch("unattended")
    expect(h.logs).toHaveLength(0)
    expect(h.storyWatch).toEqual({ state: "unattended", since: "s" })
  })
})

describe("setWatch — when the game refuses or cannot be reached", () => {
  // The whole point. A failed press must NOT play locally: that is exactly the old bug, one browser believing
  // in a change the rest of the table never saw.
  it("a 403 toasts the reason and changes nothing here", async () => {
    const h = harness({ app: true, status: 403, reply: { error: "DM key required" } })
    await h.setWatch("changing")
    expect(h.toasts.join(" ")).toMatch(/did not change/)
    expect(h.toasts.join(" ")).toMatch(/DM key required/)
    expect(h.storyWatch).toBeNull()
    expect(h.followed).toHaveLength(0)
    expect(h.fakeWatchCalls).toHaveLength(0)
  })

  it("a network failure toasts and changes nothing here", async () => {
    const h = harness({ app: true, throws: true })
    await h.setWatch("changing")
    expect(h.toasts.join(" ")).toMatch(/did not change/)
    expect(h.storyWatch).toBeNull()
    expect(h.followed).toHaveLength(0)
    expect(h.fakeWatchCalls).toHaveLength(0)
  })

  it("a 400 for an unknown word surfaces the server's own wording", async () => {
    const h = harness({ app: true, status: 400, reply: { error: "unknown watch state: sleepy" } })
    await h.setWatch("sleepy")
    expect(h.toasts.join(" ")).toMatch(/unknown watch state: sleepy/)
    expect(h.followed).toHaveLength(0)
  })
})

describe("the page still ships what the buttons need", () => {
  it("both DM buttons call setWatch, not fakeWatch", () => {
    const change = /\$\("dmWatchChange"\)\.onclick[^\n]*/.exec(PAGE)?.[0] ?? ""
    const empty = /\$\("dmWatchEmpty"\)\.onclick[^\n]*/.exec(PAGE)?.[0] ?? ""
    expect(change).toMatch(/setWatch\("changing"\)/)
    expect(empty).toMatch(/setWatch\(postsEmpty\(\)/)
    expect(change).not.toMatch(/fakeWatch/)
    expect(empty).not.toMatch(/fakeWatch/)
  })
})
