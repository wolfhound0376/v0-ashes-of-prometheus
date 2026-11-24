// A ROAD FIGHT COMES BACK TO THE SAME SPOT ON THE ROAD — the browser check (Sam, 2026-11-24: "prove with runtime
// evidence that the fight opens a tunnel plate and returns the party to the same spot on the road").
//
// What it does, in a real browser, against a local copy of the app:
//   1. opens /map as the DM and sets out along one road leg; the pixel road is laid over the map;
//   2. walks the leader until the road asks about the marker ahead, and answers with a rolled meeting whose battle
//      is the one lib/travel/battle.ts gives for gricks with no terrain plate: a TUNNEL plate;
//   3. presses TO BATTLE on the encounter card: the tab goes to the walk page, and the test reads the plate the
//      fight is on and that a fight is running;
//   4. ends the fight, takes the plate's way out and presses "Back to the map";
//   5. reads where the party stands on the road now, and compares it with where it was halted.
//
// NOTHING REACHES THE GAME. Every request to /api/* and to the database is answered here, by this file. The app is
// started with a database address that does not exist, so even a missed request has nowhere to go.
//
//   npm i --no-save playwright-core            (once; it drives the Edge or Chrome already on the machine)
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999 NEXT_PUBLIC_SUPABASE_ANON_KEY=test npx next dev -p 3411
//   node scripts/pixel-road/road-fight-return-test.mjs          (BASE=http://localhost:3411 by default)
//
// Exit 0: every check passed. Exit 1: one did not; the line says which.
import { chromium } from "playwright-core"

const BASE = process.env.BASE || "http://localhost:3411"
const DB = "http://127.0.0.1:59999"
const PLATE = "road-tunnels-junction"          // lib/travel/battle.ts TUNNEL_PLATES[1]: a d4 of 2
const now = new Date().toISOString()
const NODES = [
  { id: "n1", node_key: "rm-1", name: "Road Marker 1", node_type: "waypoint", edge_id: null, edge_position: null, description: null, metadata: { map_x: 40, map_y: 50 }, discovered_at: now, name_known: true, name_known_at: now },
  { id: "n2", node_key: "rm-2", name: "Road Marker 2", node_type: "waypoint", edge_id: null, edge_position: null, description: null, metadata: { map_x: 46, map_y: 52 }, discovered_at: now, name_known: true, name_known_at: now },
]
const EDGES = [{ id: "e1", edge_key: "rm-1__rm-2", from_node_id: "n1", to_node_id: "n2", distance_miles: 6, danger_level: 1, metadata: { is_road: true, mode: "road" } }]
// The battle exactly as battleFor() returns it for the Ambushers row "Grick" x2 with no painted terrain and a d4 of 2.
const BATTLE = { plate: PLATE, foes: ["grick", "grick"], creature: "Grick", count: 2, countDice: null, countRolls: [], surprised: null, label: "Gricks in the dark", source: "test" }
const ARRIVE = { ok: true, halt: true, kind: "encounter", title: "Something on the road", body: "Two gricks uncoil from a crack in the wall.", rolls: [], source: "test", meeting: null, foes: [], stances: [], battle: BATTLE, noBattle: null, ruins: false }

let partyAt = "n1"
const calls = []                      // every POST /api/travel, in order
const out = []; let failed = false
const ok = (cond, line) => { out.push(`${cond ? "PASS" : "FAIL"}  ${line}`); console.log(out[out.length - 1]); if (!cond) failed = true }
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "msedge", headless: process.env.HEADED !== "1", args: ["--mute-audio"] })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 } })
await ctx.addInitScript(() => {
  try { localStorage.setItem("aop_forge_key", "test-dm"); localStorage.setItem("aop_access_role", "dm"); sessionStorage.setItem("aop_intro_seen", "1") } catch (e) {}
})
await ctx.route(DB + "/**", (r) => json(r, []))
await ctx.route("**/api/**", (route) => {
  const req = route.request(), u = new URL(req.url()), p = u.pathname
  if (p === "/api/travel" && req.method() === "GET") return json(route, { nodes: NODES, edges: EDGES, party: { campaign_run_id: "run-test", node_id: partyAt, arrived_at: now }, vessels: [], march: { pace: "normal", hours_today: 0, days_marched: 0 }, guides: [] })
  if (p === "/api/travel" && req.method() === "POST") {
    let b = {}; try { b = req.postDataJSON() || {} } catch (e) {}
    calls.push(b.action)
    if (b.action === "move") partyAt = "n2"
    return json(route, b.action === "arrive" ? ARRIVE : { ok: true })
  }
  if (p === "/api/travel/leader") return json(route, { leader: null, roster: [], votes: {}, open_halt: null, day: null })
  // One sharp-eyed hero (passive Perception 30), so every trap the leg's dice lay is noticed in passing and nobody
  // goes down a pit: this check is about the fight, and a pit's own card would hold the walk for reasons of its own.
  if (p === "/api/camp/roster") return json(route, { members: [{ slug: "freia", pc: true, name: "Freia", id: null, pp: 30, strMod: 2, strSave: 2, ath: 4, hp: 20, hpMax: 20 }] })
  if (p === "/api/table") return json(route, { run: "run-test", isDm: true, state: { status: "live" }, mine: null })
  if (p === "/api/file") return route.fulfill({ status: 404, body: "" })
  if (/tts|voice|audio/.test(p)) return route.fulfill({ status: 204, body: "" })
  return json(route, {})
})
const page = await ctx.newPage()
page.on("pageerror", (e) => console.log("[pageerror]", String(e && e.stack || e).slice(0, 400)))
if (process.env.DEBUG) page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("[nav]", f.url()) })
const frameOf = async (part, ms = 60000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { const f = page.frames().find((x) => x.url().includes(part)); if (f) return f; await page.waitForTimeout(200) }
  throw new Error("no frame " + part)
}
const roadReady = async () => { const f = await frameOf("/pixel-road/index.html"); await f.waitForFunction(() => !!window.__road, null, { timeout: 60000 }); return f }
const spotKept = () => page.evaluate(() => sessionStorage.getItem("aop:road-spot"))

try {
  // ---- 1. the map, and the road laid over it
  await page.goto(BASE + "/map", { waitUntil: "domcontentloaded", timeout: 120000 })
  const map = await frameOf("/underdark-map/")
  await page.waitForTimeout(2500)
  await map.evaluate(() => parent.postMessage({ type: "aop:map-pick", k: "rm-2" }, location.origin))
  await page.getByRole("button", { name: /SET OUT/ }).click({ timeout: 30000 })
  let road = await roadReady()
  ok(true, `the road opens over the map: ${new URL(road.url()).search}`)

  // ---- 2. walk until the marker ahead is asked about; the meeting halts the party
  for (let i = 0; i < 90 && !(await road.evaluate(() => !!window.__road.meeting())); i++) { await walkOn(road); await page.waitForTimeout(2000) }
  await page.waitForTimeout(3200)                                   // the foes come out of the dark; the card lifts
  const halted = await road.evaluate(() => { const r = window.__road, L = r.heroes[0]; return { x: Math.round(L.x), y: Math.round(L.y), progress: +r.progress().toFixed(3), foes: r.foes().map((f) => f.slug), traps: r.traps().map((t) => [t.title, Math.round(t.x), Math.round(t.y)]) } })
  ok(halted.foes.length === 2 && halted.foes.every((s) => s === "grick"), `the rolled meeting halts the party at (${halted.x}, ${halted.y}), ${Math.round(halted.progress * 100)}% along; out of the dark: ${halted.foes.join(", ")}`)
  ok(calls.filter((a) => a === "arrive").length === 1, `the marker's dice were asked for once (POST /api/travel: ${calls.join(", ")})`)
  const kept = JSON.parse((await spotKept()) || "null")
  ok(!!kept && kept.x === halted.x && kept.y === halted.y && kept.a === "rm-1" && kept.b === "rm-2", `the map kept the spot for this tab: ${JSON.stringify(kept && { a: kept.a, b: kept.b, x: kept.x, y: kept.y })}`)

  // ---- 3. TO BATTLE: the tunnel plate
  const link = page.getByRole("link", { name: /TO BATTLE/ })
  const href = await link.getAttribute("href", { timeout: 30000 })
  ok(new URL(href, BASE).searchParams.get("road") === PLATE, `the card's fight link: ${href}`)
  await link.click()
  await page.waitForURL(/\/velkynvelve/, { timeout: 60000 })
  const walk = await frameOf("/velkynvelve-walk/index.html")
  await walk.waitForFunction(() => { try { return typeof cbt !== "undefined" && !!cbt && typeof cur !== "undefined" } catch (e) { return false } }, null, { timeout: 120000 })
  const fight = await walk.evaluate(() => ({ plate: String(cur), label: SPEC[cur] && (SPEC[cur].label || SPEC[cur].name) || null, mode, foes: (cbt.foes || cbt.enemies || []).length || null, road: isRoadPlate(cur) }))
  ok(fight.plate === PLATE && fight.road && fight.mode === "combat", `the fight is on the tunnel plate: cur=${fight.plate}${fight.label ? ` ("${fight.label}")` : ""}, mode=${fight.mode}`)
  await page.screenshot({ path: process.env.SHOT_FIGHT || "road-fight-plate.png" }).catch(() => {})

  // ---- 4. the fight ends; the plate's way out; Back to the map
  await walk.evaluate(() => { endCombat(true, { byDm: true }) })
  await walk.waitForFunction(() => !cbt && mode !== "combat", null, { timeout: 30000 })
  await page.waitForTimeout(1500)
  await walk.evaluate(() => { leaveVelkynvelve({ to: [] }) })
  const dlg = await walk.evaluate(() => ({ title: document.getElementById("dlgTitle").textContent, buttons: [...document.querySelectorAll("#dlgBtns button")].map((b) => b.textContent) }))
  ok(dlg.title === "Back to the road" && dlg.buttons.includes("Back to the map"), `the plate's way out asks: "${dlg.title}" [${dlg.buttons.join(" | ")}]`)
  const before = calls.length
  await walk.getByRole("button", { name: "Back to the map" }).click()
  await page.waitForURL(/\/map(\?|$)/, { timeout: 60000 })

  // ---- 5. back on the road, at the same spot
  let back = null
  try { road = await frameOfTimed("/pixel-road/index.html", 25000); await road.waitForFunction(() => !!window.__road, null, { timeout: 30000 }); await page.waitForTimeout(1200)
    back = await road.evaluate(() => { const r = window.__road, L = r.heroes[0]; return { x: Math.round(L.x), y: Math.round(L.y), near: r.near ? r.near() : null, foes: r.foes().length, meeting: !!r.meeting(), search: location.search, traps: r.traps().map((t) => [t.title, Math.round(t.x), Math.round(t.y)]) } }) } catch (e) { back = null }
  ok(!!back, back ? `the road is laid over the map again: ${back.search}` : "the road is laid over the map again (it was NOT: the map came back with no road, the party only a figure on the nodal map)")
  if (back) {
    const d = Math.hypot(back.x - halted.x, back.y - halted.y)
    ok(d <= 2, `the party stands where it was halted: was (${halted.x}, ${halted.y}), is (${back.x}, ${back.y}), ${d.toFixed(1)} px apart`)
    ok(back.foes === 0 && !back.meeting, "the creatures are gone and nothing holds the party")
    const known = back.traps.every((t) => halted.traps.some((h) => h[0] === t[0] && h[1] === t[1] && h[2] === t[2]))
    ok(known, `no new traps: every trap on the stretch now was on it before the fight, and the ones already passed are not laid again (before ${JSON.stringify(halted.traps)}, now ${JSON.stringify(back.traps)})`)
    await page.waitForTimeout(1500)
    ok(calls.slice(before).filter((a) => a === "arrive").length === 0, `the marker's dice were not rolled a second time (POST /api/travel since the fight: ${calls.slice(before).join(", ") || "none"})`)
    await page.screenshot({ path: process.env.SHOT_BACK || "road-fight-back.png" }).catch(() => {})
    if (process.env.DEBUG) console.log("[spot after return]", await spotKept(), "frames:", page.frames().map((f) => f.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 60)).join(" | "))
    // and the walk goes on to the end of the stretch
    for (let i = 0; i < 90 && (await spotKept()) !== null; i++) { await walkOn(road).catch(() => {}); await page.waitForTimeout(2000)
      if (process.env.DEBUG && i % 4 === 3) console.log("[walk]", JSON.stringify(await road.evaluate(() => { const r = window.__road, L = r.heroes[0]; return { at: [Math.round(L.x), Math.round(L.y)], p: +r.progress().toFixed(2), idle: r.idle(), exit: [r.road.exit.x, r.road.exit.y], path: r.findPath(L.x, L.y, r.road.exit.x, r.road.exit.y).length, traps: r.traps().map((t) => [t.kind, Math.round(t.x), Math.round(t.y), !!t.solid, !!t.sprung, !!t.seen]), say: !document.getElementById("say").hidden, sayText: document.querySelector("#say .line").textContent.slice(0, 60) } }).catch(() => "frame gone"))) }
    await page.waitForTimeout(1600)
    const gone = !page.frames().some((f) => f.url().includes("/pixel-road/index.html"))
    ok(gone && (await spotKept()) === null, "walked to the end of the stretch: the road fades back to the map and the spot is put away")
  }
} catch (e) {
  ok(false, "the run did not finish: " + String(e && e.message || e).split("\n")[0])
  await page.screenshot({ path: "road-fight-error.png" }).catch(() => {})
}
await browser.close()
console.log(failed ? "\nFAILED" : "\nALL PASSED")
process.exit(failed ? 1 : 0)

async function frameOfTimed(part, ms) { return frameOf(part, ms) }
// Send the leader on toward the far end whenever they stand idle (a spotted trap or a remark stops them, as in play).
// A card the road puts up on the way (a pit somebody fell into, a companion's remark) is answered with its first button.
async function walkOn(road) { return road.evaluate(() => { const r = window.__road; const b = document.querySelector("#say:not([hidden]) .row button"); if (b) b.click(); if (r.idle() && !r.meeting() && !r.plate() && !r.resting()) r.go(r.road.exit.x, r.road.exit.y) }) }
