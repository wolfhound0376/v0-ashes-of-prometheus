// Where the party may make camp (Sam, 2026-10-14):
//
//   "camp can only be done at the Nodal Map. Short rests can be taken in the
//    SUBNODAL map."
//
// The NODAL map is the Underdark travel map: the roads, markers and places
// between them. A SUBNODAL map is the inside of a place: Velkynvelve's
// fourteen nodes, Sloobludop's rooms, and so on. The party is inside one when
// party_location_label() reports source "subnodal", meaning it holds a
// subnodal position on the node map of the place it is standing in.
//
// Pure, so the dashboard button and the /camp page reach the same answer.

/** What party_location_label() returns (the fields this needs). */
export interface PartyWhere {
  label?: string | null
  location?: string | null
  sub_location?: string | null
  source?: string | null
}

export interface CampVerdict {
  /** True when the party may make camp from where it stands. */
  allowed: boolean
  /** One line for the button's tooltip and the /camp notice. */
  reason: string
  /** "Velkynvelve — Slave Pen" when inside; the place or road otherwise. */
  where: string | null
}

export function campVerdict(where: PartyWhere | null | undefined): CampVerdict {
  if (where?.source === "subnodal") {
    const place = where.label || where.location || "this place"
    return {
      allowed: false,
      where: place,
      reason: `Inside ${place}. A short rest can be taken here; camp is made out on the travel map.`,
    }
  }
  // Out on the travel map, or nowhere known yet. Nothing proves the party is
  // inside a place, so the fire is not withheld.
  return {
    allowed: true,
    where: where?.label ?? null,
    reason: where?.label ? `Make camp at ${where.label}.` : "Make camp.",
  }
}

/**
 * What Malachar is told when the party stands inside a place, so he never
 * offers the fire there. Null when camp is allowed.
 */
export function campPromptNote(v: CampVerdict | null | undefined): string | null {
  if (!v || v.allowed) return null
  return [
    "CAMP IS NOT POSSIBLE HERE",
    `The party is inside ${v.where}. Camp is only ever made out on the travel map, never inside a place.`,
    "Do NOT emit [TIME:make_camp] while they are here, and do not offer camp actions.",
    "A short rest ([TIME:short_rest]) is allowed. If they want to camp, they must first leave onto the road.",
  ].join("\n")
}

/**
 * The server's half of the same rule: a [TIME:make_camp] written while the
 * party is inside a place is dropped before it reaches time_log, so no camp
 * opens and no camp actions are granted. Every other event passes.
 */
export function dropBarredCamp<T extends { eventType: string }>(
  events: T[],
  v: CampVerdict | null | undefined,
): { events: T[]; refused: boolean } {
  if (!v || v.allowed) return { events, refused: false }
  const kept = events.filter((e) => e.eventType !== "make_camp")
  return { events: kept, refused: kept.length !== events.length }
}
