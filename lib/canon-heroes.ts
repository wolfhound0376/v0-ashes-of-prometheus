// THE CANON HEROES — who a new player may walk into the dark as, instead of forging their own.
//
// Sam, 2026-10-25: "There are four cannon characters. Kenta of Neverwinter (Sorcerer) / Fifi of
// Waterdeep (Rogue) / Scott Reedwind of Luskan (Bard) / Samson Stillwater (Cleric). Players may
// choose from one of four characters that cuts into their intro and showcases their abilities and
// history OR they may create their own character. THIS IS THE ONLY WAY TO THE FORGE OUTSIDE THE DM
// CREATING ONE HIMSELF."
//
// Sam, 2026-10-29: "Lynkes and Gandalf should be options in start a new game." Both were forged at
// the Forge (Gandalf 2026-10-24, Lynkes 2026-10-25), have their own hero intro films, and now stand
// on the chooser beside the four — six cards, one Forge door.
//
// Design of record: project doc claude/Canon_Hero_Intros_2026-10-25.md.
//
// Rows are matched BY ID, never by name: the names here are the ones Sam gave, and the database
// rows still carry the old ones ("Fifi of Copperas Cove", "Kenta", …) until the rename ships with
// the code that knows them (the walk map pins exact names — see the PR). The powers listed are
// read off each live sheet (SRD 5.2.1) on 2026-10-25 (Lynkes and Gandalf on 2026-10-29); the hooks
// are flavour, flagged invented in the design doc.
//
// ONE OF EACH PER RUN. A canon hero is a person in a persistent world; two Fifis would break the
// world's memory. A hero is taken while a PLAYER is seated as them this run (a DM-run companion
// seat does not count — seats.ts lets a player take that over), or while a claim for them waits
// at the DM's door.
//
// THE FILM, TWO RULES. The four originals watch their film once, on /choose, and /awaken never
// plays it again (filmReplays: false). Lynkes's film "must play whenever he plays for the first
// time and again after every campaign restart" (Sam, 2026-10-27; lib/hero-film.ts), and Gandalf's
// has run the same way since it was wired — so for those two /api/hero-film keeps answering with
// the seen-this-run flag (filmReplays: true), and /choose marks the film seen when it plays there
// so a fresh pick never sees it twice in one run.
//
// Pure: no Supabase, no window.

export type CanonSlug = "kenta" | "fifi" | "scott" | "samson" | "lynkes" | "gandalf"

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
  /** Canon art — a /public path, or the hero's own hero_image_url in storage. */
  portrait: string
  /**
   * Does their intro film play again after a campaign restart? false: watched once on /choose and
   * /api/hero-film answers null for them forever. true: /api/hero-film serves it under the
   * `hero_film_seen:<id>` world flag, which a restart clears (Sam, 2026-10-27, for Lynkes).
   */
  filmReplays: boolean
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
    filmReplays: false,
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
    filmReplays: false,
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
    filmReplays: false,
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
    filmReplays: false,
  },
  {
    // Andres's halfling rogue, forged 2026-10-25. Backstory of record: project doc
    // claude/Lynkes_Backstory_2026-10-26.md ("Lynkes and the Three Impossible Thefts"); the hook is
    // its last line in the pen. No weapon in the powers on purpose — Sam, 2026-10-29: "Lynkes is
    // weaponless initially." Portrait is his canon anime face (characters.portrait_image_url).
    slug: "lynkes",
    id: "a4b4c7cd-4bd6-45bb-9a32-a19a37bcb774",
    name: "Lynkes",
    clazz: "Rogue",
    origin: null,
    hook: "Three impossible thefts, pardoned. He noted the exits. There were none he could reach.",
    powers: ["Sneak Attack", "Expertise: Stealth & Sleight of Hand", "Halfling Luck"],
    portrait: "/portraits/lynkes-anime.webp",
    filmReplays: true,
  },
  {
    // Alejandro's half-elf wizard, forged 2026-10-24. The hook is his own sheet's flaw line. Portrait
    // is his canon anime hero shot (characters.hero_image_url), which lives in storage, not /public.
    slug: "gandalf",
    id: "614cac3d-f119-4b35-af78-766ddb510619",
    name: "Gandalf",
    clazz: "Wizard",
    origin: null,
    hook: "Most people run screaming from a demon. He stops and takes notes.",
    powers: ["Ray of Frost", "Magic Missile", "Shield"],
    portrait: "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/heroes/gandalf-anime.webp",
    filmReplays: true,
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
