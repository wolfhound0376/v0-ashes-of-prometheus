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

export const actionsData = [
  { id: "cast-spell", name: "Cast a Spell", description: "Use a spell from your spellbook.", icon: "sparkles" },
  { id: "use-ability", name: "Use an Ability", description: "Use a class or racial ability.", icon: "zap" },
  { id: "dash", name: "Dash", description: "Move up to your speed.", icon: "move" },
  { id: "disengage", name: "Disengage", description: "Move without provoking opportunity attacks.", icon: "shield-off" },
  { id: "help", name: "Help", description: "Aid an ally in their task.", icon: "hand-helping" },
  { id: "ready", name: "Ready", description: "Prepare an action to trigger later.", icon: "clock" },
  { id: "search", name: "Search", description: "Look for hidden things.", icon: "search" },
  { id: "cast-ritual", name: "Cast Ritual", description: "Cast a ritual spell.", icon: "book-open" },
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
  { id: "mage-hand", name: "Mage Hand", icon: "mage-hand", iconUrl: null, unlocked: true },
  { id: "fire-bolt", name: "Fire Bolt", icon: "fire-bolt", iconUrl: "/icons/abilities/fire-bolt.png", unlocked: true },
  { id: "shield", name: "Shield", icon: "shield", iconUrl: null, unlocked: true },
  { id: "magic-missile", name: "Magic Missile", icon: "magic-missile", iconUrl: null, unlocked: true },
  { id: "detect-magic", name: "Detect Magic", icon: "detect-magic", iconUrl: null, unlocked: true },
  { id: "locked", name: "Lv. 10", icon: "locked", iconUrl: null, unlocked: false },
]
