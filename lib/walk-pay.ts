// lib/walk-pay.ts — the party pays someone on the map out of everything it carries.
//
// First use: Old Thessaly's keelboat, 100 gp (Sam, 2026-10-24; claude/Old_Thessaly_Module_2026-11-23.md). Coin lives
// in two places on a hero: the sheet's purse (`characters.sheet_currency`, {cp, sp, ep, gp, pp}) and loose coins picked
// up as loot (`inventory_items` rows whose slug is copper-coin … platinum-coin, one row per stack). A price is met from
// the whole party: purses first, in party order, then loose coin, biggest coins first. A purse makes its own change
// (lib/camp.ts payFromPurse); loose coins cannot be cut, so whatever a coin overshoots comes back as change in that
// hero's purse, gold, silver and copper (SRD: 1 pp = 10 gp, 1 ep = 1/2 gp, 1 sp = 1/10 gp, 1 cp = 1/100 gp).
// Pure: the route reads the rows, this decides, the route writes.

import { payFromPurse, purseGp } from "./camp"

export const COIN_CP: Record<string, number> = { "copper-coin": 1, "silver-coin": 10, "electrum-coin": 50, "gold-coin": 100, "platinum-coin": 1000 }
export const isCoinSlug = (slug: unknown): slug is string => typeof slug === "string" && slug in COIN_CP

export type PayPurse = { characterId: string; currency: unknown }
export type PayCoins = { rowId: string; characterId: string; slug: string; qty: number }
export type PayPlan = {
  ok: true
  /** purses to write, whole */
  purses: { characterId: string; currency: Record<string, number> }[]
  /** coin rows to write: qty 0 means delete the row */
  coins: { rowId: string; qty: number }[]
  /** what the party had, in gp, before paying */
  had: number
}
export type PayShort = { ok: false; had: number; need: number }

const cpOf = (gp: number) => Math.round(gp * 100)
const purseCp = (c: unknown) => Math.round(purseGp(c) * 100)

/** What the party carries in all, in gp. */
export function partyGp(purses: PayPurse[], coins: PayCoins[]): number {
  const cp = purses.reduce((s, p) => s + purseCp(p.currency), 0) + coins.reduce((s, c) => s + (COIN_CP[c.slug] ?? 0) * Math.max(0, Math.trunc(c.qty)), 0)
  return cp / 100
}

/** Change, in cp, as a purse of gp, sp and cp added onto `currency`. */
function addChange(currency: unknown, cp: number): Record<string, number> {
  const c = (currency && typeof currency === "object" ? currency : {}) as Record<string, unknown>
  const n = (k: string) => Math.max(0, Math.trunc(Number(c[k]) || 0))
  const gp = Math.floor(cp / 100), sp = Math.floor((cp - gp * 100) / 10), rest = cp - gp * 100 - sp * 10
  return { cp: n("cp") + rest, sp: n("sp") + sp, ep: n("ep"), gp: n("gp") + gp, pp: n("pp") }
}

/** Meet `gp` from the party: purses first (each makes its own change), then loose coin, biggest first. */
export function planPayment(purses: PayPurse[], coins: PayCoins[], gp: number): PayPlan | PayShort {
  const need = cpOf(gp), had = partyGp(purses, coins)
  if (need <= 0) return { ok: true, purses: [], coins: [], had }
  if (Math.round(had * 100) < need) return { ok: false, had, need: gp }
  let left = need
  const outPurses = new Map<string, Record<string, number>>()
  for (const p of purses) {
    if (left <= 0) break
    const have = purseCp(p.currency)
    if (have <= 0) continue
    const take = Math.min(have, left)
    const after = payFromPurse(p.currency, take / 100)
    if (!after) continue
    outPurses.set(p.characterId, after)
    left -= take
  }
  const outCoins: { rowId: string; qty: number }[] = []
  const stacks = coins.filter((c) => isCoinSlug(c.slug) && c.qty > 0).sort((a, b) => COIN_CP[b.slug] - COIN_CP[a.slug])
  for (const s of stacks) {
    if (left <= 0) break
    const each = COIN_CP[s.slug], qty = Math.trunc(s.qty)
    // just enough of this stack: the fewest coins that cover what is left, or the whole stack
    const n = Math.min(qty, Math.ceil(left / each))
    outCoins.push({ rowId: s.rowId, qty: qty - n })
    const paid = n * each
    if (paid > left) {
      const change = paid - left
      const base = outPurses.get(s.characterId) ?? purses.find((p) => p.characterId === s.characterId)?.currency ?? {}
      outPurses.set(s.characterId, addChange(base, change))
      left = 0
    } else left -= paid
  }
  return { ok: true, purses: [...outPurses].map(([characterId, currency]) => ({ characterId, currency })), coins: outCoins, had }
}
