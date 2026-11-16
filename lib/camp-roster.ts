// Who sits at the fire tonight.
//
// Sam, 2026-11-15: "At camp the pixel characters of the available NPCs still alive or with you should be there."
// "More NPCs and characters the quicker rations disappear."
//
// Camp at the Fire (public/camp/fire) was built with a fixed company: four heroes and four prisoners, whoever was
// actually alive or walking with the party. The game already knows the truth: the Underwalk's One World row
// (walk_world) carries every hero on the walk (`heroes`), the heroes who have died (`state.fallen`), and the
// prisoners who follow the party (`state.company`; a companion who dies is taken out of it on the spot). This file
// reads that row and says who is at camp. It is pure: rows in, roster out, so it can be tested without Supabase.
// /api/camp/roster owns the database.
//
// Every mouth at the fire eats: the roster's size is what Sam's ration table charges (lib/camp.ts fullRestRations).

/** The prisoners' `characters` rows (the walk's ALLY_ROW and ASK_ROW). Stool has no row: the bestiary's sprout. */
export const COMPANION_ROWS: Readonly<Record<string, string | null>> = {
  ront: "2f539d01-6259-4beb-a685-4bd009f03f0d",
  eldeth: "05b65375-f25e-4773-bf41-641be0f12b86",
  derendil: "e0c652fe-2f68-40ff-823d-bb7ac34f529f",
  sarith: "cc309888-e98d-4cfe-8bf1-d75787b8ec8e",
  buppido: "1c5161a5-b0be-4f39-bb6f-8b1b0486120e",
  jimjar: "ffcd12e5-ccdc-4126-954b-bfabb8d083de",
  shuushar: "0805aedd-c6e9-4647-b285-bea6e33861ed",
  topsy: "408c24ed-0e17-403c-be62-58cd6ebb31a6",
  turvy: "c472d5dc-3c61-4d4d-9d20-d2c53dbd0e36",
  stool: null,
}

/** What the camp calls each companion (the rows carry full names: "Prince Derendil", "Shuushar the Awakened"). */
export const COMPANION_NAMES: Readonly<Record<string, string>> = {
  ront: "Ront", eldeth: "Eldeth", derendil: "Derendil", sarith: "Sarith", buppido: "Buppido",
  jimjar: "Jimjar", shuushar: "Shuushar", topsy: "Topsy", turvy: "Turvy", stool: "Stool",
}

type HeroLike = { cid?: string | null } | null | undefined
export interface WorldLike {
  heroes?: Record<string, HeroLike> | null
  state?: { company?: unknown; fallen?: unknown } | null
}

export interface CampRoster {
  /** heroes on the walk who are alive, with the character row behind each (null when the hero has none) */
  heroes: { slug: string; cid: string | null }[]
  /** prisoners walking with the party (alive: the walk drops a companion from `company` when they die) */
  companions: string[]
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [])

/**
 * The company at camp, from the walk's world row. Null when there is no world to read (no run yet, the table
 * missing): the camp then keeps the company it was built with rather than sitting nobody at the fire.
 */
export function campRoster(world: WorldLike | null | undefined): CampRoster | null {
  if (!world || !world.heroes || typeof world.heroes !== "object") return null
  const fallen = new Set(strings(world.state?.fallen))
  const heroes = Object.entries(world.heroes)
    .filter(([slug, h]) => h && !fallen.has(slug))
    .map(([slug, h]) => ({ slug, cid: (h && typeof h.cid === "string" && h.cid) || null }))
  if (!heroes.length) return null
  const companions = [...new Set(strings(world.state?.company))].filter((id) => id in COMPANION_ROWS && !fallen.has(id))
  return { heroes, companions }
}

/** Mouths to feed: every living hero and every companion at the fire. */
export function mouthsAtCamp(r: CampRoster | null | undefined): number {
  return r ? r.heroes.length + r.companions.length : 0
}

/** The name the camp shows: the companion's own short name, or a hero's first word ("Fifi of Waterdeep" → "Fifi"). */
export function campName(slug: string, rowName: string | null | undefined): string {
  if (COMPANION_NAMES[slug]) return COMPANION_NAMES[slug]
  const n = (rowName ?? "").trim()
  return n ? n.split(/\s+/)[0] : slug
}

/**
 * The companions walking with the party right now, read from the active run's walk_world row. Best-effort: any
 * failure (no run, the table missing) is zero, and the night is charged for the heroes alone as it was before.
 * The chat route's night outside camp (the SRD's one supply per mouth) adds these mouths to the heroes'.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function companionsWalking(db: any): Promise<string[]> {
  try {
    const { data: run } = await db.from("campaign_runs").select("id").eq("campaign_id", "abyss").neq("status", "ended")
      .order("run_number", { ascending: false }).limit(1).maybeSingle()
    if (!run?.id) return []
    const { data: w } = await db.from("walk_world").select("heroes,state").eq("campaign_run_id", run.id).maybeSingle()
    return campRoster(w as WorldLike | null)?.companions ?? []
  } catch {
    return []
  }
}
