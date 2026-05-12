export interface CharacterTelemetry {
  hp: { current: number; max: number }
  ac: number
  level: number
  xp: number
  xpToNext: number
  location: string
  timeOfDay: string
  abilities: {
    str: { score: number; modifier: number }
    dex: { score: number; modifier: number }
    con: { score: number; modifier: number }
    int: { score: number; modifier: number }
    wis: { score: number; modifier: number }
    cha: { score: number; modifier: number }
  }
  resources: {
    action: number
    bonusAction: number
    reaction: number
    spellSlots: number
    maxSpellSlots: number
    sorceryPoints?: number
    maxSorceryPoints?: number
    arcaneCharges?: number
    maxArcaneCharges?: number
  }
  inventory: Array<{
    id: string
    name: string
    quantity: number
    icon?: string
  }>
  equipment: Record<string, { name: string; equipped: boolean }>
}

export interface TelemetryIntent {
  action: "cast_spell" | "use_ability" | "move" | "rest" | "trade" | "dialogue" | "combat" | "level_up" | "save_state" | string
  target?: string
  details?: string
}

export interface ArtifactStatus {
  character: string
  telemetry: CharacterTelemetry
  intent: string
  timestamp: string
  version: string
}

export const TELEMETRY_INTENTS = {
  CAST_SPELL: "Cast a spell",
  USE_ABILITY: "Used an ability",
  TOOK_DAMAGE: "Took damage",
  HEALED: "Healed",
  MOVED: "Changed location",
  RESTED: "Took a rest",
  TRADED: "Traded items",
  DIALOGUE: "Had a conversation",
  COMBAT_START: "Entered combat",
  COMBAT_END: "Combat ended",
  LEVEL_UP: "Gained a level",
  SAVE_STATE: "Manual save",
  SESSION_START: "Session started",
  SESSION_END: "Session ended",
} as const

export type TelemetryIntentType = keyof typeof TELEMETRY_INTENTS
