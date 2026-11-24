// lib/walk-film.ts — film the painted map may ask for.
//
// The map (public/velkynvelve-walk, in an iframe on /velkynvelve) posts {type: "aop:walk-film", cue} when a moment
// it knows has film is chosen — today the pen gate's Look closer → "Look around" / "Count the guards" (Sam,
// 2026-10-27). components/walk/walk-cue-bridge.tsx turns the cue into an /api/cinematics request built here and
// plays what comes back. Whether there is film, which one (Fifi's own vs the general), and whether this seat has
// already seen it are the server's call (resolve_cinematic + cinematic_views): a click from the map is a
// player_initiated look, exactly like the dashboard's look-around chip.
//
// A closed list: the map names a moment, it never picks film.
//
// THE LOOK MUST BE EARNED (Sam, 2026-10-30). The pen gate's two looks used to play their film whatever the hero
// rolled, so a 3 on Investigation still bought the sweeping view of the outpost. Now the map sends the check's
// total with the cue and `dc` below decides: short of it, nothing is asked for and nothing plays — the hero just
// gets Malachar's answer to a poor look. Nothing is spent on a failure, because the fetch never happens: no
// cinematic_views row is written, so the film is still there the next time they come to the bars and look better.
// A cue with `dc: null` is not a check at all (a discovery the map has already adjudicated) and always asks.

export const PEN_LOCATION = "Scene_1_Velkynvelve (slave pen)"

/**
 * Intelligence (Investigation) to earn a look through the pen bars. CLAUDE'S HOUSE NUMBER, not Sam's: an easy
 * look at a place nobody is hiding, so most heroes clear it and a bad roll is a bad roll, not a locked door.
 */
export const GATE_LOOK_DC = 10

type WalkFilm = {
  kind: "action" | "environment"
  state: string | null
  scope: "solo" | "party"
  location: string
  /** The check the hero must meet for this film to be asked for at all. null = no check; the cue always asks. */
  dc: number | null
}

export const WALK_FILMS = {
  /** The outpost beyond the bars — the pen's establishing film (what the dashboard's look-around chip rolls). */
  "look-around": { kind: "environment", state: null, scope: "party", location: PEN_LOCATION, dc: GATE_LOOK_DC },
  /** Counting the guards through the bars — Fifi's own film on her seat, the general one for everyone else. */
  "count-guards": { kind: "action", state: "count-guards", scope: "solo", location: PEN_LOCATION, dc: GATE_LOOK_DC },
  // THE PEN FUNGI (Sam, 2026-10-30): the first time a character names a USEFUL mushroom, a short silent film of
  // that mushroom. Solo, because it is that character's discovery and the line over it is spoken in their own
  // voice (the map lays it on; the clip carries no audio). The bonecap has no cue on purpose — it is the trap,
  // and a discovery film over it would announce itself.
  // No dc: the map has already adjudicated the identification check before it sends one of these, so the cue is
  // a discovery being reported, not a look being attempted. The gate's two looks are the ones a roll decides.
  "fungus-ormu-moss": { kind: "action", state: "fungus-ormu-moss", scope: "solo", location: PEN_LOCATION, dc: null },
  "fungus-timmask": { kind: "action", state: "fungus-timmask", scope: "solo", location: PEN_LOCATION, dc: null },
  "fungus-waterorb": { kind: "action", state: "fungus-waterorb", scope: "solo", location: PEN_LOCATION, dc: null },
  // THE WARD SIGIL (Sam, 2026-10-30): a caster who successfully reads the sigil sees a short film of it — the
  // grooves breathing, the light stuttering. Solo: it is that caster's reading, and each one gets one look.
  // No dc, for the same reason as the fungi: the map has already rolled the Arcana check and applied Sam's tiers
  // before it sends this cue, so a cue arriving here IS the success. Putting a DC here too would double-judge the
  // same roll — and the tiers are not a pass/fail line the way the gate's DC 10 is.
  // The film deliberately shows only the sigil, never the seam, so it cannot spoil what a 20 earns over a 12.
  "ward-sigil": { kind: "action", state: "ward-sigil", scope: "solo", location: PEN_LOCATION, dc: null },
  // ACT 1, THE MOMENTS THE MAP STAGES ITSELF (Sam, 2026-11-12: "We'll use all of them and go ahead and wire them").
  // Each of these happens on the map whether or not Malachar ever narrates it, so the map asks for the film at the
  // beat it belongs to (mapFilm() in scripts/velkynvelve-walk/template.html). No dc: the map has already decided the
  // moment happened. Being listed here is also what keeps them OFF Malachar's cue list (lib/cinematic-doors.ts).
  // The scope matches the catalogue row; the film still plays on the screen that staged the moment, once per hero.
  "watch-changes": { kind: "action", state: "watch-changes", scope: "party", location: PEN_LOCATION, dc: null },
  "jorlan-whisper": { kind: "action", state: "jorlan-whisper", scope: "party", location: PEN_LOCATION, dc: null },
  "guard-volley": { kind: "action", state: "guard-volley", scope: "party", location: PEN_LOCATION, dc: null },
  "drow-surgeon": { kind: "action", state: "drow-surgeon", scope: "party", location: PEN_LOCATION, dc: null },
  "surrender": { kind: "action", state: "surrender", scope: "party", location: PEN_LOCATION, dc: null },
  "buppido-rises": { kind: "action", state: "buppido-rises", scope: "party", location: PEN_LOCATION, dc: null },
  // BUPPIDO RISES WITH NO ONE WATCHING (Sam, 2026-11-23: "an almost identical cinematic but when there are no drow
  // guards around"). The same film with the two drow taken out, for a death anywhere off the pen; the pen keeps its own.
  // Filed under the pen's location like the rest of Act 1: the location is the catalogue key, not where he fell.
  "buppido-rises-alone": { kind: "action", state: "buppido-rises-alone", scope: "party", location: PEN_LOCATION, dc: null },
  // A guard's keys through the bars: the Sleight of Hand roll is the map's, so the outcome arrives already judged.
  "key-steal-success": { kind: "action", state: "key-steal-success", scope: "solo", location: PEN_LOCATION, dc: null },
  "key-steal-fail": { kind: "action", state: "key-steal-fail", scope: "solo", location: PEN_LOCATION, dc: null },
  // LOCKS AND IRONS (Sam, 2026-11-23: "The other films look good wire them"). Three more moments the map adjudicates
  // itself: the stolen key turned in the pen lock, the gate forced on a passed Athletics check, and a manacle
  // opened with the bent wire. No dc: each cue is sent only from the success branch of the map's own roll or choice.
  "pen-key-unlock": { kind: "action", state: "pen-key-unlock", scope: "solo", location: PEN_LOCATION, dc: null },
  "gate-force": { kind: "action", state: "gate-force", scope: "party", location: PEN_LOCATION, dc: null },
  "manacles-slip": { kind: "action", state: "manacles-slip", scope: "solo", location: PEN_LOCATION, dc: null },
  // HERO ENTRANCES (Sam, 2026-11-23): one film per canon hero, asked for as that hero's first turn opens in their
  // first fight with gear back from the drow's stores. A cue per hero, not one cue resolved by the seated character,
  // so Fifi's entrance plays on every screen and not only her own. Filed under the pen's location like the rest of
  // Act 1: the location here is the catalogue key the row is stored under, not where the fight happens to be.
  "hero-entrance-fifi": { kind: "action", state: "hero-entrance-fifi", scope: "party", location: PEN_LOCATION, dc: null },
  "hero-entrance-kenta": { kind: "action", state: "hero-entrance-kenta", scope: "party", location: PEN_LOCATION, dc: null },
  "hero-entrance-samson": { kind: "action", state: "hero-entrance-samson", scope: "party", location: PEN_LOCATION, dc: null },
  "hero-entrance-scott": { kind: "action", state: "hero-entrance-scott", scope: "party", location: PEN_LOCATION, dc: null },
  // LOLTH'S TOOTH REVEALED (Sam, 2026-11-23: "maybe a cinematic when discovered"; "go" on the script). The first time a
  // hero's Arcana check on the drow ritual dagger succeeds and its name comes out, a short silent film: the sigils
  // burn violet, the venom beads, and in the blade Ilvara's eyes open (the beacon). Solo: it is that hero's reading,
  // and the line over it is spoken in their own voice by the map. No dc: the map rolled the Arcana check itself.
  "lolths-tooth-revealed": { kind: "action", state: "lolths-tooth-revealed", scope: "solo", location: PEN_LOCATION, dc: null },
  // THE GRAY OOZE SURGES (Sam, 2026-11-23: "Lets have it in the pool. Lets create a good intro"; he approved the film,
  // "works for me"). The pool plate's ambush hazard names it (spec.py hazard `film`) and the map sends it as the ooze
  // rises (mapFilm(node.hazard.film)). It was never listed here, so the bridge dropped the cue and the pool fight opened
  // with no film (found live 2026-11-23: the ambush fired at the pool, no cinematic_views row for it). Party scope, as
  // the catalogue row is; filed under the pen's location like the rest of Act 1 (the location is the catalogue key).
  // No dc: the map has already decided the ooze rose.
  "gray-ooze-surges": { kind: "action", state: "gray-ooze-surges", scope: "party", location: PEN_LOCATION, dc: null },
} as const satisfies Record<string, WalkFilm>

export type WalkFilmCue = keyof typeof WALK_FILMS

/**
 * Read a message from the map's frame. Anything but a known cue is null. The caller checks origin and source.
 * `total` is the check the hero rolled for this look, when the cue is one that takes a check; an older map that
 * sends no total reads as null, and a cue that wants a check then fails earned() rather than playing unearned.
 */
export function parseWalkFilm(data: unknown): { cue: WalkFilmCue; total: number | null } | null {
  if (!data || typeof data !== "object") return null
  const m = data as Record<string, unknown>
  if (m.type !== "aop:walk-film" || typeof m.cue !== "string") return null
  if (!Object.prototype.hasOwnProperty.call(WALK_FILMS, m.cue)) return null
  const total = typeof m.total === "number" && Number.isFinite(m.total) ? m.total : null
  return { cue: m.cue as WalkFilmCue, total }
}

/** Did the roll earn the film? A cue with no DC always has; a cue with one needs a total that meets it. */
export function filmEarned(cue: WalkFilmCue, total: number | null): boolean {
  const dc = WALK_FILMS[cue].dc
  if (dc === null) return true
  return total !== null && total >= dc
}

/** The /api/cinematics query for a cue, as the seated character (or none, for an unseated window). */
export function walkFilmParams(cue: WalkFilmCue, characterId: string | null): URLSearchParams {
  const f: WalkFilm = WALK_FILMS[cue]
  const params = new URLSearchParams({ location: f.location, kind: f.kind, scope: f.scope, trigger_type: "player_initiated" })
  if (f.state) params.set("state", f.state)
  if (characterId) params.set("character_id", characterId)
  return params
}
