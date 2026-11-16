// Hunger at the fire: what a hungry night does to the company.
//
// Sam, 2026-11-15: "Fights might break out if you guys are starving." He said "go" to the draft's numbers
// (project doc claude/Camp_Company_Agendas_Hunger_2026-11-15.md, section 3):
//   - the first hungry night is grumbling only;
//   - the second hungry night in a row: 1 in 3 that it breaks out; the third and after: 2 in 3;
//   - who starts it, in order: Ront goes for Eldeth; Derendil rages; Buppido uses the dark to go after a sleeping hero;
//     Topsy and Turvy steal what food there is and leave instead of fighting. Shuushar tries to stop it;
//   - the party can step in with Persuasion or Intimidation, Hard (DC 20) on the second night, Very Hard (DC 25) after;
//     failed, the fight plays out, fists only, until someone drops; the ones who fought think less of each other.
//
// SOURCES
//   [SAM 2026-11-15] the above (Claude's numbers, Sam's yes).
//   [SOURCED] OotA guide p.5: Ront hates Eldeth; Derendil rages when stressed; Buppido wants the heroes dead one by one;
//             the twins will likely abandon the group; Shuushar is a total pacifist who won't fight or defend himself.
//             p.8: the NPCs need to eat too.
//   [SOURCED] SRD 5.1: typical DCs (Hard 20, Very Hard 25); Unarmed Strike (1 + Str modifier bludgeoning); an attack
//             against an unconscious creature has advantage and a hit from within 5 ft is a critical hit; a creature
//             knocked out (stable at 0 HP) regains 1 HP after 1d4 hours. Derendil's Claw (1d6 + 3) is his body, so
//             "fists only" leaves it to him. Buppido: derro, Stealth +4, +2 to hit for 1d4 - 1 (our OotA guide p.5).
//   [CLAUDE] a sleeping hero counts as unconscious for Buppido's blow; Shuushar trying to stop it is the Help action
//             (the hero stepping in rolls with advantage); the loser of a brawl wakes at 1 HP (the SRD's 1d4 hours pass
//             before dawn); a brawl adds 2 resentment each way.
//
// Pure: rolls come in as functions, so tests script the dice. /api/camp/hunger owns the database.

export type Roll = () => number // 0 <= r < 1

export const d = (sides: number, r: Roll) => 1 + Math.floor(r() * sides)

/** The chance a hungry night turns into trouble: the Nth hungry night in a row. */
export function hungerOdds(nights: number): number {
  if (nights >= 3) return 2 / 3
  if (nights === 2) return 1 / 3
  return 0
}

/** How hard it is to talk the company down: Hard on the second night, Very Hard after. */
export function talkDownDc(nights: number): number {
  return nights >= 3 ? 25 : 20
}

export type HungerEvent =
  | { kind: "none" }
  | { kind: "grumble" }
  | { kind: "brawl"; a: string; b: string; dc: number; calmer: boolean }
  | { kind: "rage"; a: string; b: string; dc: number; calmer: boolean }
  | { kind: "buppido"; target: string }
  | { kind: "twins" }

/** Who Derendil turns on in a rage: a companion who would fight back (never Shuushar, who will not). */
const RAGE_TARGETS = ["ront", "eldeth", "sarith", "jimjar", "buppido", "topsy", "turvy", "stool"]

/**
 * What tonight brings. `companions` and `heroes` are the slugs at the fire; `nights` the hungry nights in a row
 * INCLUDING tonight (0 when they ate).
 */
export function hungerEvent(nights: number, companions: string[], heroes: string[], r: Roll): HungerEvent {
  if (nights <= 0) return { kind: "none" }
  if (r() >= hungerOdds(nights)) return { kind: "grumble" }
  const here = new Set(companions)
  const dc = talkDownDc(nights), calmer = here.has("shuushar")
  if (here.has("ront") && here.has("eldeth")) return { kind: "brawl", a: "ront", b: "eldeth", dc, calmer }
  if (here.has("derendil")) {
    const b = RAGE_TARGETS.find((t) => here.has(t)) ?? heroes[0]
    if (b) return { kind: "rage", a: "derendil", b, dc, calmer }
  }
  if (here.has("buppido") && heroes.length) return { kind: "buppido", target: heroes[Math.floor(r() * heroes.length)] }
  if (here.has("topsy") || here.has("turvy")) return { kind: "twins" }
  return { kind: "grumble" }
}

export interface Brawler { slug: string; name: string; hp: number; ac: number; str: number; claw?: boolean }

const mod = (score: number) => Math.floor((Number(score) || 10) / 2) - 5

/**
 * Fists until someone drops. Each round the first swings, then the second: d20 + Str modifier + 2 (proficiency with an
 * unarmed strike) against AC; a hit does 1 + Str modifier (at least 1), or Derendil's claw 1d6 + 3. The loser is
 * knocked out and wakes at 1 HP; the winner keeps the damage taken.
 */
export function fistFight(a: Brawler, b: Brawler, r: Roll): { winner: Brawler; loser: Brawler; winnerHp: number; loserHp: number; rounds: number } {
  let ha = Math.max(1, a.hp), hb = Math.max(1, b.hp), rounds = 0
  const swing = (x: Brawler, y: Brawler) => {
    if (d(20, r) + mod(x.str) + 2 < y.ac) return 0
    return x.claw ? d(6, r) + 3 : Math.max(1, 1 + mod(x.str))
  }
  while (ha > 0 && hb > 0 && rounds < 60) {
    rounds++
    hb -= swing(a, b)
    if (hb <= 0) break
    ha -= swing(b, a)
  }
  const aWon = hb <= 0 || (ha > 0 && ha >= hb)
  return aWon
    ? { winner: a, loser: b, winnerHp: Math.max(1, ha), loserHp: 1, rounds }
    : { winner: b, loser: a, winnerHp: Math.max(1, hb), loserHp: 1, rounds }
}

/** Buppido in the dark: his Stealth against the sleeper's passive Perception, then a blow on a sleeping hero. */
export function buppidoInTheDark(passive: number, ac: number, r: Roll): { spotted: boolean; stealth: number; hit: boolean; damage: number } {
  const stealth = d(20, r) + 4
  if (passive >= stealth) return { spotted: true, stealth, hit: false, damage: 0 }
  const toHit = Math.max(d(20, r), d(20, r)) + 2   // asleep: advantage
  const hit = toHit >= (Number(ac) || 10)
  return { spotted: false, stealth, hit, damage: hit ? Math.max(1, d(4, r) + d(4, r) - 1) : 0 }   // within 5 ft of a sleeper: a critical hit
}
