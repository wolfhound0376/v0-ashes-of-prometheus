// BOSS FIGHTS — the rules, pure, in one copy.
//
// Sam, 2026-10-27, from the Top Heroes comparison: "make combat more fun, keeping the strategy of DND5E but having
// some game play (action/strikes/movement/bosses/loot/maps) like that of top heroes style." Bosses were the one axis
// with nothing built: a `boss: true` flag on Shoor's and Ilvara's blocks that only picked the music. This file is what
// the map now reads to give a boss fight its Top Heroes shape — the entrance, the bar across the top, the Bloodied beat —
// without changing one 5e number.
//
// WHAT IS 5E HERE AND WHAT IS PRESENTATION. Nothing below changes a roll, a hit point, an action or a save.
//   - "Bloodied" is how a DM describes a creature at half its hit points. 5e (SRD 5.1 and 5.2.1) has no Bloodied
//     condition; the word is 4e's and the habit is every table's. So the beat is narration (a callout, a taunt, the bar
//     flashing) and nothing mechanical hangs off it. If Sam ever wants a mechanic there, it is homebrew and goes here.
//   - Who is the boss is a judgement about the fight's shape, not a stat: the block says so (`boss: true`), or one foe
//     carries most of the fight's XP and is a deadly encounter for the party on its own. The SAME test used to live
//     inside the music picker (moodFor); it moved here so the bar and the music cannot disagree about who the boss is.
//   - The encounter budget comes from the SRD's XP thresholds ("Deadly" per character), the way moodFor already used it.
//
// Plain JavaScript for the same reason as lib/gate-watch.mjs: build_walk.py pastes this file into the painted map at
// its BOSS placeholder (minus `export`), so the map and lib/boss-fight.test.ts read the SAME functions. Every name here
// starts with BOSS_ or boss so the paste cannot collide with the page's own names.

export const BOSS_RULES = {
  shareOfXp: 0.6,      // one foe carrying at least this share of the fight's XP...
  bloodiedAt: 0.5,     // ...and "bloodied" at half hit points, the DM's word for it, not a condition (SRD has none)
  introMs: 2600,       // the title slam: how long the name holds before the first turn is taken
  introBarkMs: 900,    // the boss speaks this long into its entrance (it has the floor; the others wait)
  bloodiedHoldMs: 1400,// the Bloodied callout and the bar's flash
}

/**
 * Which foe is the boss of this fight, if any. `foes` are {xp, boss?} in the fight's order; `budget` is the party's
 * Deadly encounter budget (per-character Deadly XP × live heroes), as moodFor computes it. Returns the INDEX in `foes`
 * or -1. A flagged block always wins; among several flagged, the richest in XP. Otherwise the top foe is the boss only
 * when it is both most of the fight (BOSS_RULES.shareOfXp of the total) and deadly on its own (at least the budget).
 * This is the exact test moodFor used for the "boss" music; it lives here now so the two cannot drift apart.
 */
export function bossIndex(foes, budget) {
  if (!foes || !foes.length) return -1
  let flagged = -1
  for (let i = 0; i < foes.length; i++) if (foes[i] && foes[i].boss && (flagged < 0 || (foes[i].xp || 0) > (foes[flagged].xp || 0))) flagged = i
  if (flagged >= 0) return flagged
  let total = 0, top = -1
  for (let i = 0; i < foes.length; i++) { const x = (foes[i] && foes[i].xp) || 0; total += x; if (top < 0 || x > ((foes[top] && foes[top].xp) || 0)) top = i }
  const x = (foes[top] && foes[top].xp) || 0
  if (x <= 0 || !(budget > 0)) return -1
  return x >= budget && x >= BOSS_RULES.shareOfXp * total ? top : -1
}

/** The boss's state for the bar: "fresh" above half, "bloodied" at half or below, "down" at 0. */
export function bossState(hp, hpMax) {
  if (!(hpMax > 0) || hp <= 0) return "down"
  return hp <= hpMax * BOSS_RULES.bloodiedAt ? "bloodied" : "fresh"
}

/** True on the ONE blow that takes the boss from above half to half or below (and not to 0 — that is the kill, its own beat). */
export function bossCrossedBloodied(hpBefore, hpAfter, hpMax) {
  return bossState(hpBefore, hpMax) === "fresh" && bossState(hpAfter, hpMax) === "bloodied"
}

/**
 * The name on the bar and in the slam. `block` is the foe's block or creature row: {name, epithet?, cr?, ctype?}.
 * The epithet is the block's own (what the book calls them — Ilvara is "Priestess of Lolth", Shoor a "Drow elite warrior",
 * both OotA); a Malachar-brought creature with none shows its challenge rating, which is bestiary data, not an invention.
 * Nothing is made up: a block with neither has no second line.
 */
export function bossTitle(block) {
  const name = (block && block.name) || "?"
  let epithet = (block && block.epithet) || ""
  if (!epithet && block && block.cr != null && block.cr !== "") epithet = `Challenge ${block.cr}`
  return { name, epithet }
}

/** The bar's fill, 0–1, never past either end. */
export function bossFill(hp, hpMax) {
  if (!(hpMax > 0)) return 0
  return Math.max(0, Math.min(1, hp / hpMax))
}
