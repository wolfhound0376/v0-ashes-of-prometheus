// THE FOUR CANON HEROES — who a new player may walk into the dark as, instead of forging their own.
//
// Sam, 2026-10-25: "There are four cannon characters. Kenta of Neverwinter (Sorcerer) / Fifi of
// Waterdeep (Rogue) / Scott Reedwind of Luskan (Bard) / Samson Stillwater (Cleric). Players may
// choose from one of four characters that cuts into their intro and showcases their abilities and
// history OR they may create their own character. THIS IS THE ONLY WAY TO THE FORGE OUTSIDE THE DM
// CREATING ONE HIMSELF."
//
// Design of record: project doc claude/Canon_Hero_Intros_2026-10-25.md.
//
// Rows are matched BY ID, never by name: the names here are the ones Sam gave, and the database
// rows still carry the old ones ("Fifi of Copperas Cove", "Kenta", …) until the rename ships with
// the code that knows them (the walk map pins exact names — see the PR). The powers listed are
// read off each live sheet (SRD 5.2.1) on 2026-10-25; the hooks are flavour, flagged invented in
// the design doc.
//
// ONE OF EACH PER RUN. A canon hero is a person in a persistent world; two Fifis would break the
// world's memory. A hero is taken while a PLAYER is seated as them this run (a DM-run companion
// seat does not count — seats.ts lets a player take that over), or while a claim for them waits
// at the DM's door.
//
// Pure: no Supabase, no window.

export type CanonSlug = "kenta" | "fifi" | "scott" | "samson"

export interface CanonHero {
  slug: CanonSlug
  /** characters.id — the stable key. */
  id: string
  /** The name Sam gave, shown on the card. */
  name: string
  clazz: string
  origin: string | null
  /** One line on the card. Flavour. */
  hook: string
  /** Three powers from the live sheet, for the confirm sheet. */
  powers: string[]
  /** Canon art, served from /public. */
  portrait: string
}

export const CANON_HEROES: readonly CanonHero[] = [
  {
    slug: "kenta",
    id: "51e4202d-b4d5-4658-a9c1-6102713e77f1",
    name: "Kenta of Neverwinter",
    clazz: "Sorcerer",
    origin: "Neverwinter",
    hook: "He kept a ledger of everyone who owed him. The Underdark kept one too.",
    powers: ["Ray of Frost", "Disguise Self", "Fog Cloud"],
    portrait: "/characters/kenta/kenta-hero-hd.webp",
  },
  {
    slug: "fifi",
    id: "d00aa5b8-ced1-477d-9ec8-0861cca55498",
    name: "Fifi of Waterdeep",
    clazz: "Rogue",
    origin: "Waterdeep",
    hook: "Nobody sees her unless she lets them. Somebody finally did.",
    powers: ["Sneak Attack", "Twin daggers (Nick)", "Expertise: Stealth"],
    portrait: "/characters/fifi/fifi-hero-4k.webp",
  },
  {
    slug: "scott",
    id: "88cc9dd1-b0fe-4e62-9829-f84aafe3c066",
    name: "Scott Reedwind of Luskan",
    clazz: "Bard",
    origin: "Luskan",
    hook: "Twenty years holding a room. The room finally held him.",
    powers: ["Vicious Mockery", "Bardic Inspiration", "Sleep"],
    portrait: "/characters/scott/scott-bard-hero-4k.webp",
  },
  {
    slug: "samson",
    id: "be060806-9938-4afd-9cf6-ad298d9eaa97",
    name: "Samson Stillwater",
    clazz: "Cleric of Lathander",
    origin: null,
    hook: "He followed a sign into the one place his god can't see.",
    powers: ["Guiding Bolt", "Healing Word", "Bless"],
    portrait: "/characters/samson/samson-hero-4k.webp",
  },
] as const

/** The hero's intro film is the cinematic_clips row with location = HERO_FILM_LOCATION and
 *  state = the hero's slug. NOT scene_key: a trigger (cinematic_clips_set_scene_key) rebuilds
 *  scene_key from location on every write, so it can never carry the hero. */
export const HERO_FILM_LOCATION = "hero-intro"

export function canonBySlug(slug: unknown): CanonHero | null {
  return CANON_HEROES.find((h) => h.slug === slug) ?? null
}

export function canonById(id: unknown): CanonHero | null {
  return CANON_HEROES.find((h) => h.id === id) ?? null
}

export type SeatLike = { id: string; dm?: boolean }
export type ClaimLike = { canon_character_id: string | null; status: string }

export type HeroAvailability = "free" | "seated" | "claimed"

/** Is this hero free to pick? Seated by a PLAYER this run → seated; a pending claim → claimed. */
export function availability(hero: Pick<CanonHero, "id">, seats: readonly SeatLike[], claims: readonly ClaimLike[]): HeroAvailability {
  if (seats.some((s) => s.id === hero.id && !s.dm)) return "seated"
  if (claims.some((c) => c.canon_character_id === hero.id && c.status === "pending")) return "claimed"
  return "free"
}

/** The forge_submissions.payload a canon claim carries: no sheet, the row already exists. */
export const CANON_FORMAT = "aop-canon-v1"
export function canonPayload(hero: CanonHero): { format: string; character: { name: string; class: string } } {
  return { format: CANON_FORMAT, character: { name: hero.name, class: hero.clazz } }
}
