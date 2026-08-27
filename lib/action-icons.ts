// The action icons Sam commissioned — ornate gold-framed art, one per 5e
// action. Uploaded to vtt-assets/action-icons as webp (~17 KB each, down
// from 2.3 MB PNGs).
//
// The map is by NAME, so a sheet that lists "Shield of Faith" or a rack that
// offers the universal "Dash" both resolve without a lookup table in the
// database. Anything unmatched falls back to a drawn glyph — a missing icon
// must never blank a button.

const BASE = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/action-icons"
const SPELL_BASE = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/spell-icons"

/**
 * Every commissioned spell icon, keyed exactly as the manifest names them.
 * A spell resolves by slugifying its name, so "Eldritch Blast" finds
 * eldritch-blast and "Hunter's Mark" finds hunters-mark without a lookup
 * table anyone has to maintain by hand.
 *
 * Each of these was verified to return 200 from the bucket before it was
 * listed here. A slug in this set with no file behind it is worse than an
 * absent one: the fallback glyph never fires and the button renders broken.
 */
const SPELL_SLUGS = new Set([
  "aid", "alter-self", "animal-friendship", "animal-handling", "armor-of-agathys",
  "bardic-inspiration", "beast-bond", "beautyberry", "bless", "blink", "burning-hands",
  "counterspell", "create-or-destroy-water", "cure-wounds", "dash", "detect-magic",
  "disengage", "disguise-self", "dispel-magic", "earth-tremor", "eldritch-blast",
  "enlarge-reduce", "ensnaring-strike", "entangle", "expeditious-retreat", "fade-away",
  "faerie-fire", "false-life", "feather-fall", "fireball", "flame-strike", "fog-cloud",
  "goodberry", "grease", "greater-invisibility", "guidance", "guiding-bolt", "healing-spirit", "healing-word",
  "heat-metal", "hellish-rebuke", "hex", "hide", "hold-person", "hunters-mark", "inflict-wounds",
  "invisibility", "jump", "leomunds-tiny-hut", "longstrider", "magic-missile", "magic-weapon",
  "mirror-image", "misty-step", "moonbeam", "prayer-of-healing", "protection-from-evil-and-good",
  "purify-food-and-drink", "sacred-flame", "sacred-weapon", "sanctuary", "searing-smite",
  "shatter", "shield", "silence", "silent-image", "sleep", "sneak-attack", "spirit-guardians",
  "spiritual-weapon", "suggestion", "tashas-hideous-laughter", "thorn-whip", "thunderwave",
  "vicious-mockery", "witch-bolt", "wrathful-smite", "zephyr-strike",
])

/** "Hunter's Mark" -> "hunters-mark". Apostrophes vanish, spaces become dashes. */
const slugify = (name: string) =>
  name.toLowerCase().replace(/['\u2019]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const SLUGS = [
  "attack", "bonus-attack", "offhand-attack", "opportunity-attack",
  "dash", "disengage", "dodge", "hide", "search", "ready", "help",
  "use-item", "second-wind", "uncanny-dodge",
  "mage-hand", "detect-magic", "shield", "shield-of-faith",
] as const

export type ActionSlug = (typeof SLUGS)[number]

export const actionIconUrl = (slug: ActionSlug) => `${BASE}/${slug}.webp`

/** Spell / action name → icon slug. Case and punctuation insensitive. */
const BY_NAME: Record<string, ActionSlug> = {
  attack: "attack",
  "bonus action attack": "bonus-attack",
  "offhand attack": "offhand-attack",
  "off-hand attack": "offhand-attack",
  "two weapon fighting": "offhand-attack",
  "opportunity attack": "opportunity-attack",
  dash: "dash",
  disengage: "disengage",
  dodge: "dodge",
  hide: "hide",
  search: "search",
  ready: "ready",
  help: "help",
  "use an object": "use-item",
  "use item": "use-item",
  "second wind": "second-wind",
  "uncanny dodge": "uncanny-dodge",
  "mage hand": "mage-hand",
  "detect magic": "detect-magic",
  shield: "shield",
  "shield of faith": "shield-of-faith",
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim()

export function iconFor(name: string): string | null {
  // A commissioned spell icon wins — it was drawn for this exact spell.
  const spell = slugify(name)
  if (SPELL_SLUGS.has(spell)) return `${SPELL_BASE}/${spell}.webp`
  // Otherwise the generic action art, which covers Attack, Dash, Dodge and
  // the rest of the universal 5e actions.
  const slug = BY_NAME[norm(name)]
  return slug ? actionIconUrl(slug) : null
}

/** Every spell that has art, for tooling that wants to report the gaps. */
export const SPELLS_WITH_ART = [...SPELL_SLUGS].sort()

/** The universal 5e actions every combatant has, in the order a table uses them. */
export const CORE_ACTIONS: { name: string; slug: ActionSlug; kind: "action" | "bonus" | "reaction" }[] = [
  { name: "Attack", slug: "attack", kind: "action" },
  { name: "Dash", slug: "dash", kind: "action" },
  { name: "Disengage", slug: "disengage", kind: "action" },
  { name: "Dodge", slug: "dodge", kind: "action" },
  { name: "Hide", slug: "hide", kind: "action" },
  { name: "Search", slug: "search", kind: "action" },
  { name: "Help", slug: "help", kind: "action" },
  { name: "Ready", slug: "ready", kind: "action" },
  { name: "Use an Object", slug: "use-item", kind: "action" },
]
