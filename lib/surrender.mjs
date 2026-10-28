// THE SURRENDER — the rules, pure, in one copy.
//
// Sam, 2026-10-28: "Surrendering takes you back to the pen after suffering some damage and throwing one of the NPCs
// into the chasm as a warning." Until this file the painted map's Surrender button (a guard catching the party in the
// open, `confront`) only handed the moment to Malachar in prose; the map did nothing. Now a surrender has one outcome
// everywhere: the guards beat the heroes, march them back to the slave pen, and on the rope bridge outside the gate
// throw one of the prisoners who ran with them into the chasm — then the gate is locked and the ward covers them again.
//
// Plain JavaScript for the same reason as lib/drow-surgeon.mjs: build_walk.py pastes this file into the painted map at
// its SURRENDER placeholder (minus `export`), so the map, the server route (app/api/surrender) and lib/surrender.test.ts
// all read the SAME table, dice and lines. Every name here starts with SURRENDER_ or surrender so the paste cannot
// collide with the page's own names.
//
// SOURCES
//   [SAM 2026-10-28] the three facts: some damage, back to the pen, one NPC into the chasm as a warning.
//   [SOURCED] the beating: SRD 5.1 "Improvised Weapons" — an object wielded as a weapon deals 1d4; crossbow stocks and
//             boots are what the guards hit with. Bludgeoning.
//   [SOURCED] the victim table is the Drow Surgeon's d8 (lib/drow-surgeon.mjs SURGEON_VICTIMS): the eight prisoners a
//             drow would spend; Topsy and Turvy stay off it for the same reason as there (wererats, OotA ch.1).
//   [CLAUDE]  which NPC: one of the prisoners who ran WITH the party, chosen evenly; only if none did, one from the pen
//             roster — the warning is made in front of the party with someone who was beside them.
//   [CLAUDE]  the beating never takes a hero below 1 HP — the drow are beating property they mean to work, not killing
//             it; a hero already down takes no more.
//   [CLAUDE]  the drow lines (original, spoken in Elvish on the map — a hero without the tongue hears gibberish).

export const SURRENDER_RULES = {
  beating: "1d4",        // per hero, bludgeoning: an improvised weapon's die (SRD 5.1)
  floorHp: 1,            // never below this
  throwMs: 1300,         // the map's fall into the chasm, start to gone
}

// The eight prisoners the drow would throw (the Drow Surgeon's table, same ids and names — lib/surrender.test.ts keeps
// the two in step). `id` is the map's sprite id; `name` is the npc_encounters / characters name (canon by name).
export const SURRENDER_PRISONERS = [
  { id: "buppido", name: "Buppido" },
  { id: "eldeth", name: "Eldeth Feldrun" },
  { id: "jimjar", name: "Jimjar" },
  { id: "derendil", name: "Prince Derendil" },
  { id: "ront", name: "Ront" },
  { id: "sarith", name: "Sarith Kzekarit" },
  { id: "shuushar", name: "Shuushar the Awakened" },
  { id: "stool", name: "Stool" },
]

/**
 * Who goes over the rail. `withParty`: ids of the prisoners who were with the party when it surrendered; `gone`: ids
 * already dead or gone this run. One of the prisoners with the party, chosen evenly (`from: "party"`); if none ran
 * with them, one of the pen's prisoners still living (`from: "pen"`); null when nobody is left to throw.
 * `rng` returns [0,1). `roll` is the face of the die that chose them (1..n), for the log.
 */
export function surrenderVictim(withParty, gone = [], rng = Math.random) {
  const alive = SURRENDER_PRISONERS.filter((p) => !gone.includes(p.id))
  const ran = alive.filter((p) => (withParty || []).includes(p.id))
  const pool = ran.length ? ran : alive
  if (!pool.length) return null
  const roll = 1 + Math.min(pool.length - 1, Math.floor(rng() * pool.length))
  const v = pool[roll - 1]
  return { id: v.id, name: v.name, roll, of: pool.length, from: ran.length ? "party" : "pen" }
}

/** Dice: "1d4", "2d6+1". `rng` returns [0,1). */
export function surrenderRoll(expr, rng = Math.random) {
  let total = 0
  const rolls = []
  for (const term of String(expr).replace(/\s+/g, "").match(/[+-]?[^+-]+/g) || []) {
    const sign = term[0] === "-" ? -1 : 1
    const t = term.replace(/^[+-]/, "")
    const m = t.match(/^(\d*)d(\d+)$/)
    if (m) {
      const n = Number(m[1]) || 1
      for (let i = 0; i < n; i++) { const r = 1 + Math.floor(rng() * Number(m[2])); rolls.push(r); total += sign * r }
    } else total += sign * (Number(t) || 0)
  }
  return { total: Math.max(0, total), rolls }
}

/**
 * The beating one hero takes: 1d4 bludgeoning, never below floorHp. A hero already at 0 (down) is left where they lie:
 * `skipped`, no roll, no change.
 */
export function surrenderBeating(hp, rng = Math.random) {
  const before = Math.max(0, Number(hp) || 0)
  if (before <= 0) return { skipped: true, rolls: [], dmg: 0, hpAfter: before }
  const r = surrenderRoll(SURRENDER_RULES.beating, rng)
  const hpAfter = Math.max(SURRENDER_RULES.floorHp, before - r.total)
  return { skipped: false, rolls: r.rolls, dmg: before - hpAfter, hpAfter }
}

// What the drow say, in order. Original lines, not the book's; the map speaks them in Elvish (a drow guard has no
// Common — lib/npc-languages), so a hero without the tongue hears gibberish and a prisoner who has it may pass it on.
export const SURRENDER_LINES = {
  kneel: "Knees. Hands on the stone.",
  march: "Up. Walk. Whoever runs, I shoot the one beside them.",
  pick: "One of you is going to teach the rest.",
  warning: "That is what the chasm thinks of running.",
  in: "In.",
  lockIn: "Sit. Next time it is two of you.",
}

/** The one line that goes into the shared log so Malachar knows what happened — the route writes it. */
export function surrenderSummary(areaName, victim, beaten) {
  const hits = (beaten || []).filter((b) => !b.skipped && b.dmg > 0).map((b) => `${b.name} ${b.dmg}`)
  const beat = hits.length ? `The drow beat them with crossbow stocks and boots (${hits.join(", ")} bludgeoning).` : "The drow did not need to hit anyone."
  const thrown = victim
    ? ` On the rope bridge outside the pen, a guard threw ${victim.name} into the chasm as a warning to the rest. ${victim.name} is dead; the body is in the pool below the falls.`
    : " There was no prisoner left to make an example of."
  return `The party surrendered to the guards in ${areaName}. ${beat} They were marched back to the slave pen.${thrown} The gate is locked again and the ward sigil covers them: they are CAPTIVE. Malachar: play the return in the guards' voices — no bargaining, this was the bargain.`
}
