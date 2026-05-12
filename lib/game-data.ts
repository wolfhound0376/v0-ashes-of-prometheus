export const characterData = {
  name: "Eldric Moonwhisper",
  level: 7,
  class: "Wizard",
  xp: 18450,
  xpToNext: 25000,
  abilities: {
    str: { score: 10, modifier: 0 },
    dex: { score: 14, modifier: 2 },
    con: { score: 12, modifier: 1 },
    int: { score: 18, modifier: 4 },
    wis: { score: 13, modifier: 1 },
    cha: { score: 16, modifier: 3 },
  },
  hp: { current: 38, max: 38 },
  ac: 15,
  initiative: 2,
  proficiencyBonus: 3,
  passivePerception: 13,
  equipment: {
    head: { name: "Circlet of Intellect", equipped: true },
    neck: { name: "Amulet of Health", equipped: true },
    torso: { name: "Robe of the Archmagi", equipped: true },
    legs: { name: "Traveler's Pants", equipped: true },
    feet: { name: "Boots of Elvenkind", equipped: true },
    mainHand: { name: "Staff of Power", equipped: true },
    offHand: { name: "Spellbook", equipped: true },
    ring1: { name: "Ring of Protection", equipped: true },
    ring2: { name: "Ring of Spell Storing", equipped: true },
  },
  weight: { current: 64.3, max: 120 },
}

export const dialogueData = [
  { speaker: "Gareth", text: "Travelers don't come this way often. What brings you to our village?" },
  { speaker: "You", text: "I'm looking for a place to rest and some news of the road ahead." },
  { speaker: "Gareth", text: "The road to the north is forested and dangerous. Best be prepared." },
  { speaker: "You", text: "Thank you. I'll keep that in mind." },
]

// D&D 5E Actions - type determines color: action (green), bonus (yellow), reaction (purple)
export const actionsData = [
  // Standard Actions (Green)
  { id: "attack", name: "Attack", description: "Make a melee or ranged attack.", icon: "sword", iconUrl: "/icons/actions/attack.png", type: "action" },
  { id: "cast-spell", name: "Cast a Spell", description: "Cast a spell with a casting time of 1 action.", icon: "sparkles", iconUrl: "/icons/actions/cast-spell.png", type: "action" },
  { id: "dash", name: "Dash", description: "Double your movement speed for this turn.", icon: "move", iconUrl: "/icons/actions/dash.png", type: "action" },
  { id: "disengage", name: "Disengage", description: "Your movement doesn't provoke opportunity attacks.", icon: "shield-off", iconUrl: null, type: "action" },
  { id: "dodge", name: "Dodge", description: "Attacks against you have disadvantage until your next turn.", icon: "shield", iconUrl: null, type: "action" },
  { id: "help", name: "Help", description: "Give an ally advantage on their next ability check or attack.", icon: "hand-helping", iconUrl: "/icons/actions/help.png", type: "action" },
  { id: "hide", name: "Hide", description: "Make a Dexterity (Stealth) check to hide.", icon: "eye-off", iconUrl: "/icons/actions/hide.png", type: "action" },
  { id: "ready", name: "Ready", description: "Prepare an action to trigger on a specific condition.", icon: "clock", iconUrl: null, type: "action" },
  { id: "search", name: "Search", description: "Make a Wisdom (Perception) or Intelligence (Investigation) check.", icon: "search", iconUrl: null, type: "action" },
  { id: "use-object", name: "Use an Object", description: "Interact with a second object or use a special object.", icon: "package", iconUrl: null, type: "action" },
  
  // Bonus Actions (Yellow)
  { id: "offhand-attack", name: "Offhand Attack", description: "Attack with a light weapon in your off hand.", icon: "swords", iconUrl: null, type: "bonus" },
  { id: "cast-bonus-spell", name: "Cast Bonus Spell", description: "Cast a spell with a casting time of 1 bonus action.", icon: "zap", iconUrl: null, type: "bonus" },
  { id: "cunning-action", name: "Cunning Action", description: "Dash, Disengage, or Hide as a bonus action. (Rogue)", icon: "footprints", iconUrl: null, type: "bonus" },
  { id: "second-wind", name: "Second Wind", description: "Regain 1d10 + fighter level hit points. (Fighter)", icon: "heart-pulse", iconUrl: null, type: "bonus" },
  
  // Reactions (Purple)
  { id: "opportunity-attack", name: "Opportunity Attack", description: "Attack a creature leaving your reach.", icon: "swords", iconUrl: null, type: "reaction" },
  { id: "cast-reaction-spell", name: "Cast Reaction Spell", description: "Cast a spell like Shield or Counterspell.", icon: "shield-plus", iconUrl: null, type: "reaction" },
  { id: "uncanny-dodge", name: "Uncanny Dodge", description: "Halve damage from an attack you can see. (Rogue)", icon: "shield-half", iconUrl: null, type: "reaction" },
]

export const inventoryData = [
  { id: "backpack", name: "Backpack", quantity: 1, icon: "backpack" },
  { id: "robe", name: "Robe of the Archmagi", quantity: 1, icon: "shirt" },
  { id: "healing-potion", name: "Healing Potion", quantity: 3, icon: "flask-conical" },
  { id: "scroll-fireball", name: "Scroll of Fireball", quantity: 1, icon: "scroll" },
  { id: "pearl-power", name: "Pearl of Power (1st Level)", quantity: 2, icon: "gem" },
  { id: "rope", name: "Rope", quantity: 2, icon: "cable" },
  { id: "torches", name: "Torches", quantity: 5, icon: "flame" },
  { id: "gold", name: "Gold", quantity: 1250, icon: "coins" },
]

export const environmentData = {
  location: "Greenmere Village",
  timeOfDay: "Afternoon",
}

export const quickAbilities = [
  { id: "mage-hand", name: "Mage Hand", icon: "mage-hand", iconUrl: "/icons/abilities/mage-hand.png", unlocked: true },
  { id: "fire-bolt", name: "Fire Bolt", icon: "fire-bolt", iconUrl: "/icons/abilities/fire-bolt.png", unlocked: true },
  { id: "shield", name: "Shield", icon: "shield", iconUrl: "/icons/abilities/shield.png", unlocked: true },
  { id: "magic-missile", name: "Magic Missile", icon: "magic-missile", iconUrl: "/icons/abilities/magic-missile.png", unlocked: true },
  { id: "detect-magic", name: "Detect Magic", icon: "detect-magic", iconUrl: "/icons/abilities/detect-magic.png", unlocked: true },
  { id: "locked", name: "Lv. 10", icon: "locked", iconUrl: null, unlocked: false },
]
