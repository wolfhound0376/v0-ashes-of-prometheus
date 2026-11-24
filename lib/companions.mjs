// CREATURE COMPANIONS (Sam, 2026-11-23: "Kenta's spider should have had more functionality. Lets create a mini module
// for this creature. This should be the template for characters that play with creatures or summons.")
// Design of record: project doc claude/Creature_Companions_Module_2026-11-23.md. Sam's calls the same day:
//   1. bond numbers as proposed ("Yes"): Animal Handling DC 10 when fed, at most one bond a long rest, unlocks 1/2/3;
//   2. at bond 1 an attack order needs the check, from bond 2 every order is obeyed ("Yes");
//   3. a drow who spots the spider does not crush it ("Don't crush. Agree with suggestion.");
//   4. its own art ("Yes"); 5. "Go".
//
// A companion is ONE record whatever the creature: what it is, who it belongs to, how it is controlled, its bond, and
// where it is (riding its owner or loose). The map keeps it in the shared walk state (`state.companions`, walk_world),
// so every screen at the table sees the same spider. Spells and class features change the CONTROL MODEL; everything
// else is the same code. Rules are marked [SRD] (SRD 5.1 text in campaign_chunks), [HOUSE] (Sam's call) or [CLAUDE]
// (a reading of Claude's, flagged for Sam).
//
// This file is pasted into the painted map at build (the COMPANIONS marker, scripts/velkynvelve-walk/build_walk.py) and
// read by lib/companions.test.ts, so the map and the tests run the SAME rules.

export const COMPANION_SOURCE = "Sam 2026-11-23 (claude/Creature_Companions_Module_2026-11-23.md); SRD 5.1 where marked"

/**
 * HOW A COMPANION IS CONTROLLED. Only `pet` is built today; the rest are the SRD's own words, kept here so the next
 * companion is filled in on the same card rather than built from scratch.
 *   obeys   "bond" (the pet track below), "always", or "bonus-action" (the owner spends one to command it)
 *   turn    "after-owner" (it acts right after its owner), "own" (it rolls its own initiative), "group"
 *   attacks false where the SRD says it cannot (a familiar)
 */
export const CONTROL_MODELS = {
  pet:      { built: true,  bonds: true,  obeys: "bond",         turn: "after-owner", attacks: true,  source: "[HOUSE] Sam 2026-11-23: bond + Animal Handling" },
  familiar: { built: false, bonds: false, obeys: "always",       turn: "own",         attacks: false, source: "[SRD] Find Familiar: always obeys, own initiative, can't attack, telepathy 100 ft, sees through its senses (action), delivers touch spells (reaction), dismissed to a pocket dimension" },
  conjured: { built: false, bonds: false, obeys: "always",       turn: "group",       attacks: true,  source: "[SRD] Conjure Animals: obeys verbal commands (no action); without orders it only defends itself" },
  undead:   { built: false, bonds: false, obeys: "bonus-action", turn: "own",         attacks: true,  source: "[SRD] Animate Dead: a bonus action commands any within 60 ft; without orders it only defends itself" },
  steed:    { built: false, bonds: false, obeys: "always",       turn: "own",         attacks: true,  source: "[SRD] Find Steed: telepathic bond within 1 mile; mount rules" },
  effect:   { built: true,  bonds: false, obeys: "always",       turn: "after-owner", attacks: false, source: "Mage Hand and Spiritual Weapon: steered like a cursor, not a creature (built separately)" },
}

/**
 * WHAT KINDS EXIST. A kind names its stat block (the map's ALLY_SHEETS row, from the SRD), its size, and what its body
 * lets it do. The pocket spider: OotA Scavenged Possessions 13-15 ("a living spider about the size of a tarantula"),
 * played as the SRD 5.1 Spider (Tiny beast, AC 12, 1 HP, 20 ft, climb 20, Stealth +4, darkvision 30 ft, passive 10).
 */
export const COMPANION_KINDS = {
  "pet-spider": {
    model: "pet", name: "Spider", size: "tiny", source: "OotA Scavenged Possessions 13-15; SRD 5.1 Spider",
    perch: true,          // [HOUSE] Tiny and Small companions ride their owner (shoulder, hood, sleeve)
    reach: 5,             // [SRD] Bite: reach 5 ft
    web: true,            // [HOUSE, ruled 2026-11-15] a web at its size: +4, 15 ft, DC 10 Str, recharge 5-6
  },
}

// ---------- THE THREE SPIDERS (Sam, 2026-11-23, shown three looks: "we keep all three. They are variations based on a
// D4 roll.") Which spider it is is rolled once, the first time it is set down, and kept on the record.
//   A REDKNEE  "really good at biting (advantage) and webbing; not much more than that."
//   B CAVE     "the intelligent spider and can calm other spiders near you by talking to them and calming emotions
//              reflexively, and can help you and can steal small (light) items."
//   C PHASE    "a baby phase spider and can teleport (phase) like BG3 and only can bite but can poison those he bites."
// Every spider keeps the SRD 5.1 Spider block (Tiny, AC 12, 1 HP, Bite +4). What a variant adds is [HOUSE].
// [CLAUDE] A d4 has four faces for three spiders: a 4 lets the owner choose (a lucky find). Hide, Dodge and Back to the
// sleeve stay for all three: they are how a 1-HP creature stays alive, not a talent. Fetch (stealing a small, light
// thing) is B's alone now; A and C do not fetch, even for Speak with Animals.
export const SPIDER_VARIANTS = {
  redknee: { face: 1, name: "Redknee", title: "redknee tarantula", blurb: "bites with advantage; spits webs",
    biteAdvantage: true, web: true, orders: ["bite", "web", "hide", "dodge", "perch"] },
  cave:    { face: 2, name: "Cave spider", title: "Underdark cave spider", blurb: "calms other spiders, helps you, steals small things",
    calm: true, steal: true, orders: ["bite", "help", "calm", "hide", "dodge", "perch"] },
  phase:   { face: 3, name: "Baby phase spider", title: "baby phase spider", blurb: "phases beside its prey; its bite poisons",
    phase: true, poisons: true, orders: ["bite", "hide", "dodge", "perch"] },
}
/** The d4: 1 redknee, 2 cave, 3 phase; a 4 is the owner's choice (null: ask them). */
export const spiderFromD4 = r => (r === 1 ? "redknee" : r === 2 ? "cave" : r === 3 ? "phase" : null)
/** A record's variant key, or null when it has not been rolled yet. */
export const variantOf = c => (c && SPIDER_VARIANTS[c.variant] ? c.variant : null)
/** "Skitter, a redknee tarantula" / "a redknee tarantula". */
export const variantTitle = c => (SPIDER_VARIANTS[variantOf(c)] || {}).title || "spider"

// [HOUSE] B's calm (Sam: "calm other spiders near you by talking to them and calming emotions reflexively"). Read as the
// SRD 5.1 Calm Emotions "indifferent" effect, for spiders only: each hostile spider within 30 ft of it makes a Charisma
// saving throw; on a failure it loses interest and backs off into the dark, out of the fight. It does this on its own
// ("reflexively") when a fight with spiders starts, even from the sleeve, and again as an order. The DC is Claude's.
export const CALM = { dc: 11, rangeFt: 30, source: "[HOUSE] Calm Emotions (SRD 5.1), spiders only: Cha save or indifferent" }
/** A hostile spider (not one of ours). */
export const isSpiderFoe = id => /spider/i.test(String(id || "")) && !/^pet-spider/.test(String(id || ""))
/** One spider's Charisma save against the calm: true = it is calmed. */
export const calmTakes = ({ total, natural }) => !(natural === 20 || (natural !== 1 && total >= CALM.dc))

// [HOUSE] C's phase (Sam: "can teleport (phase) like BG3"). The SRD Phase Spider's Ethereal Jaunt at its size: a bonus
// action, it vanishes and reappears up to 30 ft away, so its Bite reaches a foe up to 30 ft past its walk, and it can
// blink back to its owner's sleeve from 30 ft. Its poison (Sam: "can poison those he bites"): on a failed DC 9
// Constitution save the target is also Poisoned for 1 minute (10 rounds), on top of the SRD Spider's 1d4 poison damage.
// Numbers Claude's.
export const PHASE = { ft: 30, poisonRounds: 10, source: "[HOUSE] Ethereal Jaunt (SRD 5.1 Phase Spider) as a 30-ft blink; Poisoned 1 minute" }

// ---------- THE BOND (pets only) ----------
// [HOUSE] Sam's call 1: feeding it and a Wisdom (Animal Handling) check against DC 10 raises the bond by one, at most
// once a long rest. [CLAUDE] "Once a long rest" is read as once per game day: the SRD allows one long rest in 24 hours,
// and the painted map counts the day in changes of the watch (lib/world-time: a watch is 4 game hours, six a day).
export const BOND = {
  dc: 10, max: 3, watchesPerDay: 6,
  names: ["Wary", "Settled", "Trained", "Bonded"],
  /** What each step opens (the doc's table). Scout, Web the way and Distract are the next PR; listed so the menu can say what is coming. */
  unlocks: ["fights on its own", "takes orders in a fight", "obeys every order", "fetches without Speak with Animals"],
}
/** The bond as a clamped whole number. */
export const bondOf = c => Math.max(0, Math.min(BOND.max, Math.floor(Number(c && c.bond) || 0)))
/** The game day a watch count falls in (the feeding cap's key). */
export const feedDay = rotations => Math.floor(Math.max(0, Number(rotations) || 0) / BOND.watchesPerDay)

/**
 * Can it be fed now? {ok, why}. Only a pet bonds; a bond already at its top needs no more; one feeding counts a day.
 * `hasFood` is the owner (or the leader) carrying something it eats.
 */
export function canFeed(c, { rotations = 0, hasFood = false } = {}) {
  if (!c || !c.alive) return { ok: false, why: "it is gone" }
  const k = CONTROL_MODELS[(COMPANION_KINDS[c.kind] || {}).model]
  if (!k || !k.bonds) return { ok: false, why: "only a living pet bonds" }
  if (bondOf(c) >= BOND.max) return { ok: false, why: "it trusts you as much as it ever will" }
  if (c.fedDay != null && c.fedDay === feedDay(rotations)) return { ok: false, why: "it has eaten today" }
  if (!hasFood) return { ok: false, why: "nothing it eats" }
  return { ok: true, why: `Animal Handling DC ${BOND.dc} · bond ${bondOf(c)} → ${bondOf(c) + 1}` }
}
/**
 * The feeding's outcome. A success raises the bond; either way the day's feeding is spent (it ate). `ok`, when given,
 * is the dashboard's own verdict (lib/walk-roll.ts "companion:feed" settles the DC server-side) and wins.
 * @param {object} c the companion record
 * @param {{total?: number, natural?: number, rotations?: number, ok?: boolean}} roll
 */
export function feedResult(c, { total = 0, natural = 0, rotations = 0, ok: verdict = undefined }) {
  const ok = typeof verdict === "boolean" ? verdict : natural === 20 || (natural !== 1 && total >= BOND.dc)
  const before = bondOf(c), after = ok ? Math.min(BOND.max, before + 1) : before
  return { ok, before, after, fedDay: feedDay(rotations), name: BOND.names[after] }
}

// ---------- ORDERS IN A FIGHT ----------
// [HOUSE] Sam's call 2. Bond 0: no orders; it fights on its own (the ally AI). Bond 1: a keep-safe order (Hide, Dodge,
// back to the sleeve) is obeyed; an attack order (Bite, Web, Help) needs the owner's Animal Handling DC 10, or it does
// its own thing that turn. Bond 2 and up: every order is obeyed.
export const COMMANDS = {
  bite:  { label: "Bite",               kind: "attack", needs: "foe in reach",    source: "[SRD] Spider: Bite +4, 1 piercing, DC 9 Con or 1d4 poison" },
  web:   { label: "Web",                kind: "attack", needs: "web ready, 15 ft", source: "[HOUSE, ruled 2026-11-15] +4, DC 10 Str, recharge 5-6" },
  help:  { label: "Help",               kind: "attack", needs: "foe in reach",    source: "[SRD] Help: the next ally attack on that foe, before its next turn, has advantage" },
  hide:  { label: "Hide",               kind: "safe",   needs: "",                source: "[SRD] Hide: Stealth +4 against their passive Perception" },
  dodge: { label: "Dodge",              kind: "safe",   needs: "",                source: "[SRD] Dodge" },
  perch: { label: "Back to the sleeve", kind: "safe",   needs: "owner in reach",  source: "[HOUSE] it runs to its owner and rides; nothing can target it there" },
  calm:  { label: "Calm the spiders",   kind: "safe",   needs: "a hostile spider within 30 ft", source: CALM.source },
}
/** "always" | "check" | "never": does it obey this order at this bond? */
export function obeys(c, cmd) {
  const m = CONTROL_MODELS[(COMPANION_KINDS[c && c.kind] || {}).model]
  if (!m) return "never"
  if (m.obeys !== "bond") return "always"
  const b = bondOf(c), k = (COMMANDS[cmd] || {}).kind
  if (!k || b < 1) return "never"
  if (b >= 2 || k === "safe") return "always"
  return "check"
}
/** The owner's roll to be obeyed (bond 1, an attack order). */
export const orderObeyed = ({ total, natural }) => natural === 20 || (natural !== 1 && total >= BOND.dc)

/**
 * The orders that can actually be given this turn (Sam's action-bar rule: no boxes for actions you can't take).
 * ctx: {biteFoes, webFoes, helpFoes: arrays of foe names it can reach, webReady, ownerReach: bool, hidden: bool}.
 * One row per order and target, nearest first; at most three targets an order so the list stays short.
 */
export function commandMenu(c, ctx = {}) {
  const out = [], b = bondOf(c), take = a => (Array.isArray(a) ? a : []).slice(0, 3)
  if (!c || !c.alive || b < 1) return out
  // a rolled spider gives only its own orders (SPIDER_VARIANTS); one not rolled yet keeps the full list
  const v = SPIDER_VARIANTS[variantOf(c)], may = cmd => !v || v.orders.includes(cmd)
  const row = (cmd, target) => { if (may(cmd)) out.push({ cmd, target: target ?? null, label: target ? `${COMMANDS[cmd].label}: ${target}` : COMMANDS[cmd].label, check: obeys(c, cmd) === "check" }) }
  for (const f of take(ctx.biteFoes)) row("bite", f)
  if (ctx.webReady) for (const f of take(ctx.webFoes)) row("web", f)
  for (const f of take(ctx.helpFoes)) row("help", f)
  if (ctx.spidersNear) row("calm")
  if (!ctx.hidden) row("hide")
  row("dodge")
  if (ctx.ownerReach) row("perch")
  return out
}

// ---------- OUT OF A FIGHT ----------
/**
 * Fetch (Sam, 2026-11-15): someone who can speak to it can ask it to bring a small thing off a drow. Call 1 adds the
 * other road: at bond 3 it has learned to fetch shiny things for its owner without words.
 */
export function canFetch(c, { canSpeak = false, isOwner = false } = {}) {
  if (!c || !c.alive || c.perched) return false
  const v = variantOf(c)
  if (v && !SPIDER_VARIANTS[v].steal) return false                      // only the cave spider steals (Sam, 2026-11-23)
  if (v === "cave") return !!canSpeak || (isOwner && bondOf(c) >= 1)    // the clever one: from bond 1 for its owner [CLAUDE]
  return !!canSpeak || (isOwner && bondOf(c) >= BOND.max)
}

// ---------- DROW AND SPIDERS ----------
// [HOUSE] Sam's call 3 ("Don't crush. Agree with suggestion."). [LORE] spiders are sacred to Lolth in Forgotten Realms
// lore; our ingested OotA text does not say it, so this is Sam's ruling, not the book's. A drow who catches it at
// work picks it up and sets it down out of the way; the spider lives and the item stays where it was. A drow does not
// choose it as a target in a fight.
export const DROW_ID = /^(drow|jorlan|ilvara|shoor|asha|liana|escort-drow|surgeon)/i
export const drowSpares = (attackerId, targetKind) => DROW_ID.test(String(attackerId || "")) && !!COMPANION_KINDS[targetKind]

// ---------- THE RECORD ----------
/** A clean record, or null. `perched` true = riding its owner (not on the floor); `alive` false = dead and gone. */
export function normaliseCompanion(kind, raw) {
  if (!COMPANION_KINDS[kind] || !raw || typeof raw !== "object") return null
  const name = typeof raw.name === "string" ? raw.name.replace(/[<>]/g, "").trim().slice(0, 24) : ""
  return {
    kind, owner: typeof raw.owner === "string" && raw.owner ? raw.owner : null, name: name || null,
    bond: bondOf(raw), fedDay: Number.isFinite(raw.fedDay) ? raw.fedDay : null,
    perched: !!raw.perched, alive: raw.alive !== false,
    variant: SPIDER_VARIANTS[raw.variant] ? raw.variant : null,
  }
}
/** A name a player typed, made safe for the log and the card (24 characters, no markup). */
export const companionName = s => String(s || "").replace(/[<>&"]/g, "").replace(/\s+/g, " ").trim().slice(0, 24)
/** How the log and the card call it: its name, else "the spider". */
export const companionLabel = c => (c && c.name) || `the ${variantOf(c) ? variantTitle(c) : String((COMPANION_KINDS[c && c.kind] || {}).name || "creature").toLowerCase()}`
