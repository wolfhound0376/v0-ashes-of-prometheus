// COMPANY LEFT BEHIND — the headless test (Sam, 2026-11-15: "For some reason my company didn't join us when we were
// leaving. fix that.").
//
// What the live game showed (run f4bc0bcc, walk_world v539): Eldeth, Derendil and Sarith recorded on the pen plate
// (companyAt 11) while Samson stood in the Guard Tower's lower chamber and Scott in the Guard Tower, and
// `alone:samson` still true on the server long after his sneak had ended. This plays it in two headless screens
// against the same stand-in One World server the other tests here use (state merged as walk_world_apply merges it):
//   1  a cleared "off alone" flag reaches the server and the other screen (it used to be `delete`d, which never sends)
//   2  prisoners left on a plate where no hero stands come to their own hero when that hero arrives somewhere; the other
//      hero's prisoner does not, until THAT hero arrives
//   3  "Wait here" still holds them where they were told to wait
//   4  a hero with a companion beside them still keeps them there (nobody is pulled off a plate a hero stands on)
//
// RUN IT BEFORE MERGING ANY CHANGE TO HOW THE COMPANY FOLLOWS:
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once; or CHROME=/usr/bin/google-chrome)
//   node scripts/one-world/company-follows-test.mjs        (uses the first two heroes seated in the live run; STAGE_JSON=<file> offline)
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
  const pages = []
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
  return { screen, world: () => w, apply: (patch) => apply(OWL.cleanPatch(patch, "dm").patch, "dm"),
    close: async () => { for (const c of pages) await c.close().catch(() => {}); await new Promise((r) => server.close(r)) } }
}

let passed = 0, failed = 0
const check = (name, ok, detail) => { ok ? passed++ : failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + JSON.stringify(detail) : ""}`) }
const until = async (pg, fn, ms = 20000, arg) => { try { await pg.waitForFunction(fn, arg, { timeout: ms }); return true } catch { return false } }
// a hero's own screen sets them down on another plate, alone (a splinter's arrival, the way a door taken without the other player does it)
const goAlone = (pg, to) => pg.evaluate((to) => enterNode(to, { from: cur, solo: true, offs: [{ id: leader.id, dx: 0, dy: 0 }] }), to)
const companyHere = (pg) => pg.evaluate(() => ({ plate: String(cur), here: npcs.filter((n) => n.company).map((n) => n.id).sort(), at: { ...(state.companyAt || {}) } }))

const W = await world(+(process.env.PORT || 4150))
try {
  const A = await W.screen(ONE, "one"), B = await W.screen(TWO, "two")
  await wait(3000)
  const [a, b] = await Promise.all([A.evaluate(() => leader.id), B.evaluate(() => leader.id)])
  console.log(`screens: ${a} (one), ${b} (two)`)

  // 1 — the flag that held Samson "off alone" for the rest of the night: on the server and on both screens, with no sneak on
  W.apply({ state: { ["alone:" + a]: true } })
  const heard = await until(B, (a) => state["alone:" + a] === true, 8000, a)
  check("the other screen hears the 'off alone' flag", heard)
  await wait(4000)                                                       // the hero's own screen sees no sneak and clears it (syncAlone, every 300 ms)
  const flag = { server: W.world().state["alone:" + a] ?? "(absent)", two: await B.evaluate((a) => state["alone:" + a] ?? "(absent)", a) }
  check("cleared on the hero's own screen, it is cleared on the server and on the other screen too", flag.server !== true && flag.two !== true, flag)

  // 2 — the night's state: everybody's prisoners left on a plate nobody stands on
  W.apply({ state: { company: ["eldeth", "derendil", "sarith"], companyAt: { eldeth: "12", derendil: "12", sarith: "12" }, escort: { eldeth: a, derendil: a, sarith: b }, escortHome: { eldeth: a, derendil: a, sarith: b } } })
  await wait(2500)
  await goAlone(A, 10); await wait(2500)
  let s = await companyHere(A)
  check(`${a}'s two prisoners come to ${a} on arrival; ${b}'s stays put`, s.plate === "10" && s.here.join() === "derendil,eldeth" && s.at.sarith === "12", s)
  await until(A, () => !owDirty(), 8000); await wait(2500)
  await goAlone(B, 13); await wait(2500)
  s = await companyHere(B)
  check(`${b}'s prisoner comes to ${b} on arrival; ${a}'s stay with ${a}`, s.plate === "13" && s.here.join() === "sarith" && s.at.eldeth === "10" && s.at.derendil === "10", s)

  // 3 — "Wait here" holds
  await until(B, () => !owDirty(), 8000); await wait(1500)
  W.apply({ state: { companyAt: { eldeth: "12", derendil: "12", sarith: "13" }, ["companyMode:" + a]: "wait" } })
  await wait(2500)
  await goAlone(A, 14); await wait(2500)
  s = await companyHere(A)
  check("told to wait, they wait", s.plate === "14" && !s.here.includes("eldeth") && s.at.eldeth === "12", s)

  // 4 — a hero still standing with them keeps them
  W.apply({ state: { ["companyMode:" + a]: null, companyAt: { eldeth: "13", derendil: "13", sarith: "13" } } })
  await wait(2500)
  await goAlone(A, 10); await wait(2500)
  s = await companyHere(A)
  check(`with ${b} still standing beside them, nobody is pulled off that plate`, s.plate === "10" && !s.here.length && s.at.eldeth === "13", s)
} catch (e) { check("the test ran to its end", false, String(e && e.stack || e).slice(0, 400)) }
finally { await W.close() }
await browser.close()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
