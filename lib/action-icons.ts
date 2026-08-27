// The action icons Sam commissioned — ornate gold-framed art, one per 5e
// action. Uploaded to vtt-assets/action-icons as webp (~17 KB each, down
// from 2.3 MB PNGs).
//
// The map is by NAME, so a sheet that lists "Shield of Faith" or a rack that
// offers the universal "Dash" both resolve without a lookup table in the
// database. Anything unmatched falls back to a drawn glyph — a missing icon
// must never blank a button.

const BASE = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/action-icons"

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
  const slug = BY_NAME[norm(name)]
  return slug ? actionIconUrl(slug) : null
}

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
