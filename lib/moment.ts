/**
 * THE MOMENT — what is true for one hero right now, read from the game rather than from the last few lines of talk.
 *
 * Sam, 2026-11-23: "It's important the Malachar's options he gives you are in tune with what is happening at that
 * exact moment. They MUST all be Germaine or misleading in some way but ON PURPOSE." Design of record: project doc
 * claude/Malachar_Options_2026-11-23.md.
 *
 * Before this, the option chips (/api/suggestions) were built from the last six dialogue lines only. When those lines
 * were stale, so were the chips: a fight they did not know about, a room they had left, a person no longer there. The
 * moment is built from the tables the game already writes (walk_world, combat_state, roll_requests, npc_agents), so
 * the chips answer the room the hero is standing in.
 *
 * Pure: no Supabase (lib/moment.test.ts). lib/moment-store.ts reads the rows.
 */

export interface MomentAgenda { name: string; wants?: string; fears?: string; secret?: string; turns?: string }

export interface Moment {
  /** The plate the hero is on ("battle-pen-gate", "ruins-great-hall"), or null when the walk has no row for them. */
  plate: string | null
  /** A fight on this plate that has not ended. */
  fight: { label: string; foes: string[]; allies: string[] } | null
  /** A roll this hero still owes. */
  roll: { skill: string | null; purpose: string | null } | null
  /** Named companions on the same plate as the hero. */
  present: string[]
  /** Who the hero is talking to, if anyone. */
  talkingTo: string | null
  /** Whose options these are: the NPC being talked to when they have a card, otherwise Malachar. */
  author: MomentAgenda
}

export interface WalkRow {
  plate?: string | null
  state?: Record<string, unknown> | null
  heroes?: Record<string, { cid?: string | null; plate?: string | null } | undefined> | null
}

export interface CardLite { key: string; name: string; aliases?: string[]; sprite_slug?: string | null; agenda?: Record<string, unknown> | null }

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/** "pet-spider" → "pet spider", "topsy" → "Topsy"; a card's own name when the slug is one of the cast. */
export function nameForSlug(slug: string, cards: CardLite[]): string {
  const s = slug.trim().toLowerCase()
  const card = cards.find((c) => c.key === s || (c.sprite_slug ?? "").toLowerCase() === s)
  if (card) return card.name
  if (s.includes("-")) return s.replace(/-/g, " ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function agendaOf(card: CardLite): MomentAgenda {
  const a = (card.agenda ?? {}) as Record<string, unknown>
  return { name: card.name, wants: str(a.wants) || undefined, fears: str(a.fears) || undefined, secret: str(a.secret) || undefined, turns: str(a.turns) || undefined }
}

const lc = (s: string) => s.trim().toLowerCase()
function cardForName(cards: CardLite[], name: string | null | undefined): CardLite | null {
  if (!name) return null
  const want = lc(name)
  const first = want.split(/\s+/)[0]
  for (const c of cards) {
    const names = [c.name, ...(c.aliases ?? [])].map(lc)
    if (names.includes(want) || names.some((n) => n.split(/\s+/)[0] === first && first.length >= 3)) return c
  }
  return null
}

/** The walk row this hero is in: the newest one that lists them. */
export function rowFor(rows: WalkRow[], characterId: string | null): { row: WalkRow; heroPlate: string | null } | null {
  if (!characterId) return null
  for (const row of rows) {
    for (const h of Object.values(row.heroes ?? {})) {
      if (h && h.cid === characterId) return { row, heroPlate: str(h.plate) || str(row.plate) || null }
    }
  }
  return null
}

export function buildMoment(input: {
  rows: WalkRow[]
  characterId: string | null
  cards: CardLite[]
  talkingTo?: string | null
  roll?: { skill?: string | null; purpose?: string | null } | null
}): Moment {
  const { cards } = input
  const found = rowFor(input.rows, input.characterId)
  const state = (found?.row.state ?? {}) as Record<string, unknown>
  const plate = found?.heroPlate ?? null

  // A fight is on when the battle record has no end stamp. Its plate must be the hero's (a fight elsewhere is not theirs).
  let fight: Moment["fight"] = null
  const b = state.battle as Record<string, unknown> | null | undefined
  if (b && !b.over && (!b.plate || !plate || b.plate === plate)) {
    const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => nameForSlug(String(x), cards)) : [])
    fight = { label: str(b.label) || "a fight", foes: list(b.foes), allies: list(b.allies) }
  }

  // Companions whose recorded plate is the hero's plate.
  const at = (state.companyAt ?? {}) as Record<string, unknown>
  const company = Array.isArray(state.company) ? (state.company as unknown[]).map(String) : []
  const present: string[] = []
  for (const slug of company) {
    const where = str(at[slug])
    if (plate && where && where !== plate) continue
    const n = nameForSlug(slug, cards)
    if (!present.includes(n)) present.push(n)
  }

  const talkingTo = str(input.talkingTo) || null
  const partner = cardForName(cards, talkingTo)
  if (partner && !present.includes(partner.name) && talkingTo) present.unshift(partner.name)
  const mal = cards.find((c) => c.key === "malachar")
  const author = partner && partner.key !== "malachar" ? agendaOf(partner) : mal ? agendaOf(mal) : { name: "Malachar" }

  const roll = input.roll ? { skill: str(input.roll.skill) || null, purpose: str(input.roll.purpose) || null } : null
  return { plate, fight, roll, present, talkingTo, author }
}

/** The moment as the option writer reads it: short, exact, nothing it does not need. */
export function momentBrief(m: Moment): string {
  const out: string[] = []
  out.push(`Where: ${m.plate ? m.plate.replace(/-/g, " ") : "unknown"}.`)
  if (m.fight) out.push(`A FIGHT IS ON: ${m.fight.label}. Foes: ${m.fight.foes.join(", ") || "unknown"}. Fighting beside the hero: ${m.fight.allies.join(", ") || "no one"}.`)
  if (m.roll) out.push(`A ROLL IS WAITING for this hero${m.roll.skill ? `: ${m.roll.skill}` : ""}${m.roll.purpose ? ` (${m.roll.purpose})` : ""}.`)
  out.push(`Here with the hero: ${m.present.length ? m.present.join(", ") : "no one named"}.`)
  out.push(`Talking to: ${m.talkingTo ?? "no one in particular"}.`)
  return out.join("\n")
}

/** Every name the cast and the company answer to, for catching a chip about someone who is not here. */
export function knownNames(cards: CardLite[], extra: string[] = []): string[] {
  const out = new Set<string>()
  for (const c of cards) for (const n of [c.name, ...(c.aliases ?? [])]) {
    if (!n) continue
    out.add(n)
    const first = n.split(/\s+/)[0]
    if (first && first.length >= 3 && !/^(prince|lady|lord|the|sir)$/i.test(first)) out.add(first)
  }
  for (const n of extra) if (n) out.add(n)
  return [...out]
}
