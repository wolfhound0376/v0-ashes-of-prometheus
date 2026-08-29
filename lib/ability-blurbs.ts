// ============================================================================
// WHAT THE BUTTON ACTUALLY DOES.
//
// The rack used to hang a native `title` off each icon, which meant the only
// explanation of a spell was the browser's own tooltip: half a second late,
// eight pixels tall, and gone the moment you moved. At a live table that is
// the same as no explanation at all — the player asks out loud, the DM
// answers, and the HUD may as well not exist.
//
// So: a real blurb per ability, short enough to read in the pause before you
// commit to a turn. Range and duration are the two numbers people actually
// ask for, kept separate so the panel can lay them out rather than burying
// them in prose.
//
// Text is condensed from SRD 5.1 (CC-BY-4.0) — the same source the rest of
// this codebase cites. It is a reminder, not a rules substitute: anything
// contested still goes to the book.
//
// The party's real spell lists live in characters.sheet_spellcasting; this
// covers those plus the universal actions. An ability with no entry still
// renders — it just shows its name and type, which is what the rack did
// before. A missing blurb must never blank a button.
// ============================================================================

export interface Blurb {
  /** One or two sentences. What it does, in the voice of a reminder. */
  text: string
  range?: string
  duration?: string
  save?: string
  damage?: string
}

const B = (text: string, extra: Omit<Blurb, "text"> = {}): Blurb => ({ text, ...extra })

export const ABILITY_BLURBS: Record<string, Blurb> = {
  // ---- Kenta, sorcerer ----------------------------------------------------
  "ray of frost": B("A beam of freezing air. On a hit, cold damage and the target's speed drops by 10 feet until your next turn.", { range: "60 ft.", damage: "1d8 cold", duration: "Instant" }),
  "shocking grasp": B("Lightning leaps from your hand. On a hit, the target can't take reactions until its next turn — it cannot make an opportunity attack as you walk away.", { range: "Touch", damage: "1d8 lightning", duration: "Instant" }),
  "minor illusion": B("A sound, or an image no larger than a 5-foot cube. It makes no sound if it's an image and no image if it's a sound. Investigation check to disbelieve.", { range: "30 ft.", duration: "1 minute" }),
  "chill touch": B("A spectral hand grips the target. On a hit, necrotic damage, and it cannot regain hit points until your next turn. Undead also have disadvantage on attacks against you.", { range: "120 ft.", damage: "1d8 necrotic", duration: "1 round" }),
  "disguise self": B("You change how you look — clothing, armour, height and build within a foot of your own. It does not hold up to touch.", { range: "Self", duration: "1 hour" }),
  "fog cloud": B("A 20-foot sphere of fog spreads around a point. The area is heavily obscured: everything inside is effectively blind.", { range: "120 ft.", duration: "Concentration, 1 hour" }),

  // ---- Samson, cleric -----------------------------------------------------
  guidance: B("Touch a willing creature. Once before the spell ends it adds 1d4 to one ability check of its choice.", { range: "Touch", duration: "Concentration, 1 minute" }),
  "toll the dead": B("A mournful bell tolls. The target takes necrotic damage on a failed save — and more if it is already wounded.", { range: "60 ft.", save: "Wisdom", damage: "1d8, or 1d12 if damaged" }),
  thaumaturgy: B("A minor wonder of divine power: your voice booms, flames flicker and change colour, a door slams, the ground trembles. Showmanship, not force.", { range: "30 ft.", duration: "Up to 1 minute" }),
  sanctuary: B("Warded. Anything that targets the protected creature must pass a Wisdom save or choose a new target — broken the moment the warded creature attacks or casts at someone.", { range: "30 ft.", save: "Wisdom", duration: "1 minute" }),
  "healing word": B("A word of healing at range, as a BONUS action — the reason a downed friend gets back up while you still swing.", { range: "60 ft.", damage: "1d4 + spellcasting mod healed", duration: "Instant" }),
  "guiding bolt": B("A lance of light. On a hit, radiant damage, and the next attack against that target has advantage.", { range: "120 ft.", damage: "4d6 radiant", duration: "Instant" }),
  "shield of faith": B("A shimmering field grants a creature +2 AC. Bonus action to cast.", { range: "60 ft.", duration: "Concentration, 10 minutes" }),

  // ---- Scott, bard --------------------------------------------------------
  "mage hand": B("A spectral hand you can use to manipulate, open, or carry up to 10 pounds — never to attack.", { range: "30 ft.", duration: "1 minute" }),
  "vicious mockery": B("An insult laced with enchantment. On a failed save the target takes psychic damage and has disadvantage on its next attack roll.", { range: "60 ft.", save: "Wisdom", damage: "1d4 psychic" }),
  "dissonant whispers": B("A discordant melody only the target hears. Psychic damage on a failed save, and it must immediately flee from you using its reaction.", { range: "60 ft.", save: "Wisdom", damage: "3d6 psychic" }),
  "faerie fire": B("Objects and creatures in a 20-foot cube are outlined in light. Attacks against them have advantage, and they cannot benefit from invisibility.", { range: "60 ft.", save: "Dexterity", duration: "Concentration, 1 minute" }),
  sleep: B("Roll 5d8. That many hit points of creatures, weakest first, fall unconscious. Undead and anything immune to charm ignore it entirely.", { range: "90 ft.", duration: "1 minute" }),

  // ---- universal actions --------------------------------------------------
  attack: B("Swing. One attack with the weapon in hand — more if your class grants Extra Attack."),
  dash: B("Move again. Your speed for the turn doubles — the amber squares on the board are the extra reach."),
  disengage: B("Step away clean. Your movement doesn't provoke opportunity attacks for the rest of the turn."),
  dodge: B("Give ground. Attacks against you have disadvantage, and you gain advantage on Dexterity saves, until your next turn."),
  hide: B("A Stealth check against passive Perception. Success gives you advantage on your next attack — and the rogue's sneak attack."),
  help: B("Aid an ally. Their next ability check, or their next attack against a creature within 5 feet of you, has advantage."),
  ready: B("Name a trigger and an action now; it fires on your reaction when the trigger comes."),
  search: B("Look for what's hidden — a Perception or Investigation check instead of an attack."),
  "use-item": B("Draw, drink, or use. A potion, a scroll, the thing in your pack that changes the fight."),
  "use item": B("Draw, drink, or use. A potion, a scroll, the thing in your pack that changes the fight."),
  "sneak attack": B("Once per turn, when you have advantage or a friend is adjacent to your target, add the extra dice.", { damage: "By rogue level" }),
}

/** Case- and punctuation-insensitive lookup. */
export function blurbFor(name: string): Blurb | null {
  const k = name.toLowerCase().replace(/['’]/g, "").trim()
  return ABILITY_BLURBS[k] ?? ABILITY_BLURBS[k.replace(/\s+/g, "-")] ?? null
}
