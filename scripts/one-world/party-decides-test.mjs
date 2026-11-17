// THE PARTY DECIDES — the headless test (Sam, 2026-11-15: "a well designed dialogue box pulls everyone out of whatever they
// are doing and forces the party to answer. Host or leader of the story decides ... other players may vote the same way
// BG3 does it. Answering this immediately triggers the consequence."). Two screens at one table:
//   1. Eldeth's plan card raised on A shows on B too, same words and rows, with "The party decides".
//   2. B presses a row: a vote; both screens show B's name beside it; nothing happens yet.
//   3. A (the decider: no DM or host at this table, A raised it) answers: the row's own action runs once, on A, and the
//      card goes from both screens.
//   4. The watch changes: the table lead raises the question; it has one answer, so ANY screen's "Carry on" closes it.
//   5. A real choice the decider never answers: a vote is acknowledged, and after 20 s the leading vote carries.
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once)
//   node scripts/one-world/party-decides-test.mjs   (first two heroes seated in the live run; STAGE_JSON=<file> offline)
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

const W = await world(4321)
const A = await W.screen(ONE, "A"), B = await W.screen(TWO, "B")
await wait(9000)
let fails = 0; const check = (ok, what, d) => { console.log((ok ? "PASS " : "FAIL ") + what + (d ? "  — " + JSON.stringify(d) : "")); if (!ok) fails++ }
const card = (pg) => pg.evaluate(() => ({ open: !$("obj").hidden, council: $("obj").classList.contains("council"), title: $("objWho").textContent, sub: $("objSub").hidden ? "" : $("objSub").textContent,
  rows: [...$("objBtns").querySelectorAll("button.btn")].map((b) => (b.querySelector(".lbl") || b).textContent.trim()), chips: [...$("objBtns").querySelectorAll(".pd-chip")].map((c) => c.textContent), say: ($("obj").querySelector(".fsay") || {}).textContent, mode }))
// 1. Eldeth's plan card on A
await A.evaluate(() => { const n = npcs.find((n) => n.id === "eldeth"); openPlanCard(n) })
await wait(3000)
const a1 = await card(A), b1 = await card(B)
console.log("A", JSON.stringify(a1)); console.log("B", JSON.stringify(b1))
check(a1.open && a1.council && b1.open && b1.council && a1.title === b1.title && JSON.stringify(a1.rows) === JSON.stringify(b1.rows), "the plan card shows on both screens, the same", { a: a1.rows, b: b1.rows })
check(/decides/.test(b1.sub) && /decides/.test(b1.say) && /Your answer/.test(a1.say), "B is told who decides; A is told its answer decides", { bsay: b1.say, asay: a1.say })
// 2. B leans
await B.evaluate(() => { [...$("objBtns").querySelectorAll("button.btn")][1].click() })
await wait(5500)   // (the stand-in server has no realtime: a vote reaches the other screen on its next heartbeat, 2.5 s)
const a2 = await card(A), b2 = await card(B)
check(a2.open && b2.open && a2.chips.length === 1 && b2.chips.length === 1, "B's vote shows beside the row on both screens; nothing happens yet", { a: a2.chips, b: b2.chips })
// 3. A answers
const planBefore = await A.evaluate(() => JSON.stringify(state.plan || null))
await A.evaluate(() => { window.__planChosen = null; const o = planChosen; planChosen = (n, k) => { window.__planChosen = k; return o(n, k) }; [...$("objBtns").querySelectorAll("button.btn")][0].click() })
await wait(3000)
const a3 = await card(A), b3 = await card(B)
check(await A.evaluate(() => window.__planChosen) !== null, "A's answer ran the row's own action on A", await A.evaluate(() => window.__planChosen))
check(!a3.open && !b3.open && a3.mode === "explore" && b3.mode === "explore", "the card goes from both screens", { a: a3.open, b: b3.open })
check(await B.evaluate(() => !state.pdec), "the question is cleared from the shared world")
// 4. the watch
await wait(1500)
const lead = (await A.evaluate(() => iLeadTheTable())) ? A : B, other = lead === A ? B : A
await lead.evaluate(() => { if (cur !== PEN) return; watchCouncil() })
await wait(5500)
const w1 = await card(lead), w2 = await card(other)
check(w1.open && w2.open && /watch/.test(w1.title) && w2.rows.includes("Carry on"), "the change of the watch asks the whole table", { lead: w1.rows, other: w2.rows })
// (Sam, 2026-11-17: his screen pressed Carry on 17 times and "nothing happened", the call sat with another window.
//  A card with one answer is not a vote: the OTHER screen's press answers it.)
check(/Anyone may answer/.test(w2.say), "a one-answer card tells every screen it may answer", w2.say)
await other.evaluate(() => { [...$("objBtns").querySelectorAll("button.btn")].find((b) => /Carry on/.test(b.textContent)).click() })
await wait(3000)
await wait(2500)
check(!(await card(lead)).open && !(await card(other)).open, "Carry on, pressed on the screen that does not have the call, closes it everywhere")
check(await lead.evaluate(() => !state.pdec), "the watch question is cleared from the shared world")
// 5. a real choice the decider never answers: B votes, is told it is waiting, and after the grace the vote carries
await wait(1500)
await A.evaluate(() => { window.__ran = null; const { add, close } = heroCard("A fork in the dark", "Left or right?"); add("Left", () => { close(); window.__ran = "left" }, "primary"); add("Right", () => { close(); window.__ran = "right" }); if (!partyCard({ kind: "test" })) close() })
await wait(5500)
const f1 = await card(B)
check(f1.open && f1.rows.length === 2 && /decides/.test(f1.say), "a two-answer card still names who decides", f1.say)
await B.evaluate(() => { [...$("objBtns").querySelectorAll("button.btn")][1].click() })
await wait(1500)
const f2 = await card(B)
check(f2.open && /Your vote is in/.test(f2.say) && /waiting on/.test(f2.say), "a screen that has voted is told its vote is in and who it waits on", f2.say)
check(await A.evaluate(() => window.__ran) === null, "nothing has happened yet: the decider still has the call")
await wait(26000)   // the 20 s grace, then the heartbeats that carry the answer to A and the cleared question back
const f3a = await card(A), f3b = await card(B)
check(await A.evaluate(() => window.__ran) === "right", "the decider stayed silent: the vote carried, and the row ran once on the screen that raised it", await A.evaluate(() => window.__ran))
check(!f3a.open && !f3b.open && await B.evaluate(() => !state.pdec), "the card goes from both screens and the question is cleared")
const log = await A.evaluate(() => RLOG.lines.filter((l) => l.kind === "sync" && /party/i.test(l.text)).map((l) => l.text)); console.log("sync log:", JSON.stringify(log))
await A.screenshot({ path: "/tmp/council-a.png" })
await W.close(); await browser.close()
console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0)
