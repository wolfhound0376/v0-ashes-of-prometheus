// D&D 5E Class Defaults based on System Reference Document 5.2.1
// These are applied when a character selects a class
export const classDefaults: Record<string, {
  hitDie: number
  primaryAbility: string[]
  savingThrows: string[]
  skillChoices: { count: number; options: string[] }
  armorProficiencies: string[]
  weaponProficiencies: string[]
  toolProficiencies: string[]
  startingHP: number // At level 1: hit die max + CON modifier
  level1Features: string[]
  spellcasting?: {
    ability: string
    cantripsKnown: number
    spellSlots: number[]
    spellList: string[]
  }
  classActions: string[] // Actions available to this class
}> = {
  "Barbarian": {
    hitDie: 12,
    primaryAbility: ["Strength"],
    savingThrows: ["Strength", "Constitution"],
    skillChoices: { count: 2, options: ["Animal Handling", "Athletics", "Intimidation", "Nature", "Perception", "Survival"] },
    armorProficiencies: ["Light", "Medium", "Shields"],
    weaponProficiencies: ["Simple", "Martial"],
    toolProficiencies: [],
    startingHP: 12, // + CON modifier
    level1Features: ["Rage", "Unarmored Defense", "Weapon Mastery"],
    classActions: ["attack", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object"],
  },
  "Bard": {
    hitDie: 8,
    primaryAbility: ["Charisma"],
    savingThrows: ["Dexterity", "Charisma"],
    skillChoices: { count: 3, options: ["Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"] },
    armorProficiencies: ["Light"],
    weaponProficiencies: ["Simple", "Hand Crossbow", "Longsword", "Rapier", "Shortsword"],
    toolProficiencies: ["Three musical instruments of your choice"],
    startingHP: 8,
    level1Features: ["Bardic Inspiration", "Spellcasting"],
    spellcasting: {
      ability: "Charisma",
      cantripsKnown: 2,
      spellSlots: [2],
      spellList: ["Dancing Lights", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion", "Prestidigitation", "True Strike", "Vicious Mockery"],
    },
    classActions: ["attack", "cast-spell", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object", "cast-bonus-spell"],
  },
  "Cleric": {
    hitDie: 8,
    primaryAbility: ["Wisdom"],
    savingThrows: ["Wisdom", "Charisma"],
    skillChoices: { count: 2, options: ["History", "Insight", "Medicine", "Persuasion", "Religion"] },
    armorProficiencies: ["Light", "Medium", "Shields"],
    weaponProficiencies: ["Simple"],
    toolProficiencies: [],
    startingHP: 8,
    level1Features: ["Divine Order", "Spellcasting"],
    spellcasting: {
      ability: "Wisdom",
      cantripsKnown: 3,
      spellSlots: [2],
      spellList: ["Guidance", "Light", "Mending", "Resistance", "Sacred Flame", "Spare the Dying", "Thaumaturgy", "Toll the Dead"],
    },
    classActions: ["attack", "cast-spell", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object", "cast-bonus-spell"],
  },
  "Druid": {
    hitDie: 8,
    primaryAbility: ["Wisdom"],
    savingThrows: ["Intelligence", "Wisdom"],
    skillChoices: { count: 2, options: ["Arcana", "Animal Handling", "Insight", "Medicine", "Nature", "Perception", "Religion", "Survival"] },
    armorProficiencies: ["Light", "Medium", "Shields"],
    weaponProficiencies: ["Club", "Dagger", "Dart", "Javelin", "Mace", "Quarterstaff", "Scimitar", "Sickle", "Sling", "Spear"],
    toolProficiencies: ["Herbalism Kit"],
    startingHP: 8,
    level1Features: ["Druidic", "Primal Order", "Spellcasting"],
    spellcasting: {
      ability: "Wisdom",
      cantripsKnown: 2,
      spellSlots: [2],
      spellList: ["Druidcraft", "Guidance", "Mending", "Message", "Poison Spray", "Produce Flame", "Resistance", "Shillelagh", "Thorn Whip"],
    },
    classActions: ["attack", "cast-spell", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object", "cast-bonus-spell"],
  },
  "Fighter": {
    hitDie: 10,
    primaryAbility: ["Strength", "Dexterity"],
    savingThrows: ["Strength", "Constitution"],
    skillChoices: { count: 2, options: ["Acrobatics", "Animal Handling", "Athletics", "History", "Insight", "Intimidation", "Perception", "Persuasion", "Survival"] },
    armorProficiencies: ["Light", "Medium", "Heavy", "Shields"],
    weaponProficiencies: ["Simple", "Martial"],
    toolProficiencies: [],
    startingHP: 10,
    level1Features: ["Fighting Style", "Second Wind", "Weapon Mastery"],
    classActions: ["attack", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object", "second-wind"],
  },
  "Monk": {
    hitDie: 8,
    primaryAbility: ["Dexterity", "Wisdom"],
    savingThrows: ["Strength", "Dexterity"],
    skillChoices: { count: 2, options: ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"] },
    armorProficiencies: [],
    weaponProficiencies: ["Simple", "Martial weapons with Light property"],
    toolProficiencies: ["One artisan's tools or musical instrument"],
    startingHP: 8,
    level1Features: ["Martial Arts", "Unarmored Defense"],
    classActions: ["attack", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object"],
  },
  "Paladin": {
    hitDie: 10,
    primaryAbility: ["Strength", "Charisma"],
    savingThrows: ["Wisdom", "Charisma"],
    skillChoices: { count: 2, options: ["Athletics", "Insight", "Intimidation", "Medicine", "Persuasion", "Religion"] },
    armorProficiencies: ["Light", "Medium", "Heavy", "Shields"],
    weaponProficiencies: ["Simple", "Martial"],
    toolProficiencies: [],
    startingHP: 10,
    level1Features: ["Lay on Hands", "Spellcasting", "Weapon Mastery"],
    spellcasting: {
      ability: "Charisma",
      cantripsKnown: 0,
      spellSlots: [2],
      spellList: [],
    },
    classActions: ["attack", "cast-spell", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object", "cast-bonus-spell"],
  },
  "Ranger": {
    hitDie: 10,
    primaryAbility: ["Dexterity", "Wisdom"],
    savingThrows: ["Strength", "Dexterity"],
    skillChoices: { count: 3, options: ["Animal Handling", "Athletics", "Insight", "Investigation", "Nature", "Perception", "Stealth", "Survival"] },
    armorProficiencies: ["Light", "Medium", "Shields"],
    weaponProficiencies: ["Simple", "Martial"],
    toolProficiencies: [],
    startingHP: 10,
    level1Features: ["Favored Enemy", "Spellcasting", "Weapon Mastery"],
    spellcasting: {
      ability: "Wisdom",
      cantripsKnown: 0,
      spellSlots: [2],
      spellList: [],
    },
    classActions: ["attack", "cast-spell", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object", "cast-bonus-spell"],
  },
  "Rogue": {
    hitDie: 8,
    primaryAbility: ["Dexterity"],
    savingThrows: ["Dexterity", "Intelligence"],
    skillChoices: { count: 4, options: ["Acrobatics", "Athletics", "Deception", "Insight", "Intimidation", "Investigation", "Perception", "Persuasion", "Sleight of Hand", "Stealth"] },
    armorProficiencies: ["Light"],
    weaponProficiencies: ["Simple", "Martial Finesse", "Martial Light"],
    toolProficiencies: ["Thieves' Tools"],
    startingHP: 8,
    level1Features: ["Expertise", "Sneak Attack", "Thieves' Cant", "Weapon Mastery"],
    classActions: ["attack", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object", "cunning-action", "uncanny-dodge"],
  },
  "Sorcerer": {
    hitDie: 6,
    primaryAbility: ["Charisma"],
    savingThrows: ["Constitution", "Charisma"],
    skillChoices: { count: 2, options: ["Arcana", "Deception", "Insight", "Intimidation", "Persuasion", "Religion"] },
    armorProficiencies: [],
    weaponProficiencies: ["Simple"],
    toolProficiencies: [],
    startingHP: 6,
    level1Features: ["Innate Sorcery", "Spellcasting"],
    spellcasting: {
      ability: "Charisma",
      cantripsKnown: 4,
      spellSlots: [2],
      spellList: ["Acid Splash", "Blade Ward", "Chill Touch", "Dancing Lights", "Fire Bolt", "Friends", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion", "Poison Spray", "Prestidigitation", "Ray of Frost", "Shocking Grasp", "True Strike"],
    },
    classActions: ["attack", "cast-spell", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object", "cast-bonus-spell"],
  },
  "Warlock": {
    hitDie: 8,
    primaryAbility: ["Charisma"],
    savingThrows: ["Wisdom", "Charisma"],
    skillChoices: { count: 2, options: ["Arcana", "Deception", "History", "Intimidation", "Investigation", "Nature", "Religion"] },
    armorProficiencies: ["Light"],
    weaponProficiencies: ["Simple"],
    toolProficiencies: [],
    startingHP: 8,
    level1Features: ["Eldritch Invocations", "Pact Magic"],
    spellcasting: {
      ability: "Charisma",
      cantripsKnown: 2,
      spellSlots: [1],
      spellList: ["Blade Ward", "Chill Touch", "Eldritch Blast", "Friends", "Mage Hand", "Minor Illusion", "Poison Spray", "Prestidigitation", "True Strike"],
    },
    classActions: ["attack", "cast-spell", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object", "cast-bonus-spell"],
  },
  "Wizard": {
    hitDie: 6,
    primaryAbility: ["Intelligence"],
    savingThrows: ["Intelligence", "Wisdom"],
    skillChoices: { count: 2, options: ["Arcana", "History", "Insight", "Investigation", "Medicine", "Nature", "Religion"] },
    armorProficiencies: [],
    weaponProficiencies: ["Simple"],
    toolProficiencies: [],
    startingHP: 6,
    level1Features: ["Arcane Recovery", "Ritual Adept", "Spellcasting"],
    spellcasting: {
      ability: "Intelligence",
      cantripsKnown: 3,
      spellSlots: [2],
      spellList: ["Acid Splash", "Blade Ward", "Chill Touch", "Dancing Lights", "Fire Bolt", "Friends", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion", "Poison Spray", "Prestidigitation", "Ray of Frost", "Shocking Grasp", "True Strike"],
    },
    classActions: ["attack", "cast-spell", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object", "cast-bonus-spell", "cast-reaction-spell"],
  },
}

// Helper function to get default ability scores for a class
export function getDefaultAbilityScores(className: string): Record<string, { score: number; modifier: number }> {
  const standardArray = [15, 14, 13, 12, 10, 8]
  const classData = classDefaults[className]
  
  // Standard point buy allocation based on primary ability
  const abilityPriority: Record<string, string[]> = {
    "Barbarian": ["str", "con", "dex", "wis", "cha", "int"],
    "Bard": ["cha", "dex", "con", "wis", "int", "str"],
    "Cleric": ["wis", "con", "str", "cha", "dex", "int"],
    "Druid": ["wis", "con", "dex", "int", "cha", "str"],
    "Fighter": ["str", "con", "dex", "wis", "cha", "int"],
    "Monk": ["dex", "wis", "con", "str", "cha", "int"],
    "Paladin": ["str", "cha", "con", "wis", "dex", "int"],
    "Ranger": ["dex", "wis", "con", "str", "int", "cha"],
    "Rogue": ["dex", "con", "wis", "cha", "int", "str"],
    "Sorcerer": ["cha", "con", "dex", "wis", "int", "str"],
    "Warlock": ["cha", "con", "dex", "wis", "int", "str"],
    "Wizard": ["int", "con", "dex", "wis", "cha", "str"],
  }
  
  const priority = abilityPriority[className] || ["str", "dex", "con", "int", "wis", "cha"]
  const scores: Record<string, { score: number; modifier: number }> = {}
  
  priority.forEach((ability, index) => {
    const score = standardArray[index]
    scores[ability] = { score, modifier: Math.floor((score - 10) / 2) }
  })
  
  return scores
}

// Helper function to calculate starting HP for a class
export function calculateStartingHP(className: string, conModifier: number, level: number = 1): number {
  const classData = classDefaults[className]
  if (!classData) return 10
  
  // Level 1: max hit die + CON modifier
  // Higher levels: average hit die (rounded up) + CON modifier per level
  const averageHitDie = Math.ceil(classData.hitDie / 2) + 1
  const firstLevelHP = classData.hitDie + conModifier
  const additionalHP = level > 1 ? (level - 1) * (averageHitDie + conModifier) : 0
  
  return firstLevelHP + additionalHP
}

// Helper function to get available actions for a class
export function getClassActions(className: string): string[] {
  const classData = classDefaults[className]
  return classData?.classActions || ["attack", "dash", "disengage", "dodge", "help", "hide", "ready", "search", "use-object"]
}

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
  { id: "disengage", name: "Disengage", description: "Your movement doesn't provoke opportunity attacks.", icon: "shield-off", iconUrl: "/icons/actions/disengage.png", type: "action" },
  { id: "dodge", name: "Dodge", description: "Attacks against you have disadvantage until your next turn.", icon: "shield", iconUrl: "/icons/actions/dodge.png", type: "action" },
  { id: "help", name: "Help", description: "Give an ally advantage on their next ability check or attack.", icon: "hand-helping", iconUrl: "/icons/actions/help.png", type: "action" },
  { id: "hide", name: "Hide", description: "Make a Dexterity (Stealth) check to hide.", icon: "eye-off", iconUrl: "/icons/actions/hide.png", type: "action" },
  { id: "ready", name: "Ready", description: "Prepare an action to trigger on a specific condition.", icon: "clock", iconUrl: "/icons/actions/ready.png", type: "action" },
  { id: "search", name: "Search", description: "Make a Wisdom (Perception) or Intelligence (Investigation) check.", icon: "search", iconUrl: "/icons/actions/search.png", type: "action" },
  { id: "use-object", name: "Use an Object", description: "Interact with a second object or use a special object.", icon: "package", iconUrl: "/icons/actions/use-object.png", type: "action" },
  
  // Bonus Actions (Yellow)
  { id: "offhand-attack", name: "Offhand Attack", description: "Attack with a light weapon in your off hand.", icon: "swords", iconUrl: "/icons/actions/offhand-attack.png", type: "bonus" },
  { id: "cast-bonus-spell", name: "Cast Bonus Spell", description: "Cast a spell with a casting time of 1 bonus action.", icon: "zap", iconUrl: "/icons/actions/cast-spell.png", type: "bonus" },
  { id: "cunning-action", name: "Cunning Action", description: "Dash, Disengage, or Hide as a bonus action. (Rogue)", icon: "footprints", iconUrl: "/icons/actions/cunning-action.png", type: "bonus", hasSubmenu: true },
  { id: "second-wind", name: "Second Wind", description: "Regain 1d10 + fighter level hit points. (Fighter)", icon: "heart-pulse", iconUrl: "/icons/actions/second-wind.png", type: "bonus" },
  
  // Reactions (Purple)
  { id: "opportunity-attack", name: "Opportunity Attack", description: "Attack a creature leaving your reach.", icon: "swords", iconUrl: "/icons/actions/opportunity-attack.png", type: "reaction" },
  { id: "cast-reaction-spell", name: "Cast Reaction Spell", description: "Cast a spell like Shield or Counterspell.", icon: "shield-plus", iconUrl: null, type: "reaction" },
  { id: "uncanny-dodge", name: "Uncanny Dodge", description: "Halve damage from an attack you can see. (Rogue)", icon: "shield-half", iconUrl: "/icons/actions/uncanny-dodge.png", type: "reaction" },
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
