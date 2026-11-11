import { readFileSync, existsSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The Map Module page is generated (scripts/underdark-map/import_artifact.py). These are the promises the
// generated file has to keep whatever the artifact looked like on the day it was imported.
const html = readFileSync("public/underdark-map/index.html", "utf8")

describe("the Map Module page", () => {
  it("loads the silence script before anything else", () => {
    expect(html.indexOf('<script src="/test-copy-silence.js"></script>')).toBeGreaterThan(-1)
    expect(html.indexOf('<script src="/test-copy-silence.js"></script>')).toBeLessThan(html.indexOf("<script type="))
  })
  it("asks nothing of the artifact's own file store or a CDN for its code", () => {
    expect(html).not.toContain("/_blob/")
    expect(html).not.toContain("cdn.jsdelivr.net")
    expect(existsSync("public/underdark-map/vendor/three.module.min.js")).toBe(true)
  })
  it("carries no art or sound inline: every file it names is in the repo", () => {
    expect(html).not.toContain("data:image/")
    expect(html).not.toContain("data:audio/")
    for (const m of html.matchAll(/"((?:img|sfx)\/[a-z0-9-]+\.(?:jpg|png|mp3))"/g)) expect(existsSync(`public/underdark-map/${m[1]}`), m[1]).toBe(true)
  })
  it("has the game mode: the page asks, the game decides", () => {
    for (const s of ["aop:map-ready", "aop:map-pick", "aop:map-reached", "aop:map-enter", "aop:map-state", "aop:map-leg", "aop:map-place"]) expect(html, s).toContain(s)
    // a player who does not lead cannot post a move
    expect(html).toContain('if(GAME&&!gameLegP){ if(gameLead) post({type:"aop:map-pick",k}); return; }')
    // fog is the default: the DM view starts off and only a DM's page shows the switch
    expect(html).toContain("let party=G.party, dm=false,")
    expect(html).toContain("body.game:not(.gm) .hud.toggles")
  })
})
