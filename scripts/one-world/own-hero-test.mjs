// YOUR HERO IS ALWAYS YOURS — the headless test (Sam, 2026-11-15: "Scott's character can't move with the keyboard or
// well"). Two windows at one table: one goes to the background, its heartbeat lapses, and the other screen takes its
// hero over (driverOf's fallback). Back in that window, the player's keys must move their own hero at once, and the
// other screen's idea of where that hero is must not walk them back.
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once)
//   node scripts/one-world/own-hero-test.mjs        (first two heroes seated in the live run; STAGE_JSON=<file> offline)
import http from "node:http"
import { readFileSync, existsSync, statSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import { chromium } from "playwright"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public")
const ctx = {}; runInNewContext(readFileSync(join(ROOT, "js/aop-one-world.js"), "utf8") + "\nthis.W = AopOneWorld;", ctx)
const OWL = ctx.W
const STAGE = process.env.STAGE_JSON ? JSON.parse(readFileSync(process.env.STAGE_JSON, "utf8")) : await fetch("https://ashes.playacartagena.com/api/map-stage").then((r) => r.json())
if (!STAGE.seated || STAGE.seated.length < 2) { console.log("two heroes must be seated in the live run; or pass STAGE_JSON"); process.exit(2) }
const [ONE, TWO] = STAGE.seated.slice(0, 2).map((s) => s.id)
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".css": "text/css" }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})

async function world(port) {
  const SEATED = STAGE.seated.filter((s) => s.id === ONE || s.id === TWO), SEATNO = { [ONE]: 1, [TWO]: 2 }
  let w = { campaign_run_id: "00000000-0000-0000-0000-000000000015", version: 0, plate: null, state: {}, heroes: {}, travel: null, seats: {} }
  const pages = [], away = new Set()   // a window in the background: its seat stops being refreshed (the browser throttles its heartbeat) while realtime still brings it the world
  function apply(patch, by) {
    if (patch.state) w.state = { ...w.state, ...patch.state }
    if (patch.heroes) for (const [k, v] of Object.entries(patch.heroes)) if ((v.seq || 0) > ((w.heroes[k] && w.heroes[k].seq) ?? -1)) w.heroes[k] = v
    if (patch.seats) w.seats = { ...w.seats, ...patch.seats }
    if ("plate" in patch) w.plate = patch.plate
    if (patch.travel) w.travel = patch.travel
    if (Object.keys(patch).some((k) => k !== "seats")) { w.version++; w.updated_by = by }
    return JSON.parse(JSON.stringify(w))
  }
  const answer = (x, extra = {}) => ({ version: x.version, digest: OWL.worldDigest(x.plate, x.state), now: Date.now(), seats: x.seats, ...extra })
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x"), p = url.pathname
    let body = ""; for await (const c of req) body += c
    const j = body ? (() => { try { return JSON.parse(body) } catch { return {} } })() : {}
    const send = (o, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)) }
    if (p === "/api/verify-claim") return send({ valid: true, character: SEATED.find((s) => s.id === j.characterId) })
    if (p === "/api/map-stage") return send({ run: 15, seated: SEATED, present: [], gone: [], npcLanguages: {}, watch: { state: "unattended", since: "2026-01-01T00:00:00.000Z" } })
    if (p === "/api/world-flags") return send({ flags: [] })
    if (p === "/api/walk-fight") return send({ error: 'relation "public.walk_fights" does not exist' }, 503)
    if (p === "/api/walk-world") {
      if (req.method === "GET") return send(answer(w, { world: w, realtime: null }))
      const who = j.characterId || "dm"
      if (j.op === "beat") {
        if (away.has(who)) { const x = JSON.parse(JSON.stringify(w)); return send(answer(x, { world: x })) }
        const x = apply({ seats: { [who]: { at: Date.now(), slug: j.slug, cid: who === "dm" ? null : who, dm: who === "dm", seat: SEATNO[who] ?? null, digest: j.digest, version: j.version, status: j.status } } }, who)
        return send(answer(x, (j.version < x.version || j.full) ? { world: x } : {}))
      }
      const c = OWL.cleanPatch(j.patch, who)
      if (c.error) return send({ error: c.error }, 400)
      const refused = []
      if (c.patch.heroes) for (const [s, h] of Object.entries(c.patch.heroes)) if (!OWL.mayWriteHero(h, who, who === "dm", w.seats, Date.now())) { refused.push(s); delete c.patch.heroes[s] }
      return send(answer(apply(c.patch, who), refused.length ? { refused } : {}))
    }
    if (p.startsWith("/api/")) return send({})
    let f = join(ROOT, p === "/" ? "velkynvelve-walk/index.html" : p)
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html")
    if (!existsSync(f)) { res.writeHead(404); return res.end() }
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f))
  })
  await new Promise((r) => server.listen(port, r))
  async function screen(cid, name) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
    await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off") }, [cid])
    const pg = await c.newPage(); pg.who = name; pages.push(c)
    pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, String(e.stack || e).slice(0, 500)))
    await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
    await pg.goto(`http://localhost:${port}/velkynvelve-walk/index.html?oneworld=1`)
    await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
    await pg.evaluate(() => { for (const n of npcs) n.talk = false })
    return pg
  }
  return { screen, world: () => w, away: (cid, on) => { on ? away.add(cid) : away.delete(cid) }, apply: (patch) => apply(OWL.cleanPatch(patch, "dm").patch, "dm"),
    close: async () => { for (const c of pages) await c.close().catch(() => {}); await new Promise((r) => server.close(r)) } }
}

let passed = 0, failed = 0
const check = (name, ok, detail) => { ok ? passed++ : failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + JSON.stringify(detail) : ""}`) }
const W = await world(+(process.env.PORT || 4160))
try {
  const A = await W.screen(ONE, "one"), B = await W.screen(TWO, "two")
  await wait(4000)
  const b = await B.evaluate(() => leader.id)
  W.away(TWO, true); await wait(16000)                                        // B's window in the background past ONLINE_MS
  const taken = await A.evaluate((b) => { const h = party.find((p) => p.id === b); return !!h && !owRemote(h) }, b)
  check(`the other screen takes ${b} over while ${b}'s window is away`, taken)
  // the other screen walks them somewhere (its formation, a click): those positions go to the server
  await A.evaluate((b) => { const h = party.find((p) => p.id === b), q = nearestWalkable(h.x - 160, h.y + 60); h.path = findPath(h, q) }, b)
  await wait(3000)
  // back in B's window, before its next heartbeat has landed: the keys
  const s0 = await B.evaluate(() => ({ x: leader.x, y: leader.y, yours: canControl(leader) && !owRemote(leader) }))
  await B.bringToFront(); await B.keyboard.down("KeyD"); await wait(1500); await B.keyboard.up("KeyD"); await wait(1200)
  const s1 = await B.evaluate(() => ({ x: leader.x, y: leader.y }))
  const moved = Math.round(Math.hypot(s1.x - s0.x, s1.y - s0.y))
  check(`${b}'s own screen still drives ${b}`, s0.yours, s0)
  check(`${b}'s keys move ${b} at once (and nobody walks them back)`, moved > 60 && s1.x > s0.x + 40, { moved, s0, s1 })
  W.away(TWO, false)
} catch (e) { check("the test ran to its end", false, String(e && e.stack || e).slice(0, 400)) }
finally { await W.close() }
await browser.close()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
