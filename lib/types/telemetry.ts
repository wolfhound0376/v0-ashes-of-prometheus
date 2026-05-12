// Telemetry data structure for AI-assisted game state management
// This format enables external AI assistants to read and process game state

export interface CharacterTelemetry {
  hp: number
  max_hp: number
  ac: number
  position: [number, number] // [x, y] grid coordinates
  conditions: string[] // e.g., ["prone", "poisoned", "hidden"]
  last_roll: number | null
  roll_type: string | null // e.g., "STEALTH_CHECK", "ATTACK_ROLL", "SAVING_THROW"
  roll_result: "success" | "failure" | "critical_success" | "critical_failure" | null
  resources: {
    action: boolean
    bonus_action: boolean
    reaction: boolean
    spell_slots: number[]
    concentration: string | null // Active concentration spell
  }
}

export interface EnvironmentState {
  name: string
  description: string
  lighting: "bright" | "dim" | "darkness" | "magical_darkness"
  terrain: string[]
  hazards: string[]
  active_effects: string[]
}

export interface TelemetryPayload {
  // Session identification
  session_id: string
  campaign_id: string
  encounter_id: string
  
  // Active character data
  active_character: string
  character_id: string
  character_class: string
  character_level: number
  
  // Game state telemetry
  telemetry: CharacterTelemetry
  
  // Intent and narrative
  intent_vector: string // Player's declared intent in natural language
  action_type: string // Mechanical action being attempted
  
  // Environment context
  environment: EnvironmentState
  
  // Turn tracking
  round_number: number
  initiative_order: string[]
  current_turn: string
  
  // Metadata
  timestamp: string // ISO 8601 format
  dm_notes?: string // Optional DM annotations
}

export interface TelemetryResponse {
  success: boolean
  sha?: string // GitHub commit SHA for the update
  message: string
  timestamp: string
}

// Default empty telemetry for initialization
export const emptyTelemetry: TelemetryPayload = {
  session_id: "",
  campaign_id: "",
  encounter_id: "",
  active_character: "",
  character_id: "",
  character_class: "",
  character_level: 1,
  telemetry: {
    hp: 10,
    max_hp: 10,
    ac: 10,
    position: [0, 0],
    conditions: [],
    last_roll: null,
    roll_type: null,
    roll_result: null,
    resources: {
      action: true,
      bonus_action: true,
      reaction: true,
      spell_slots: [],
      concentration: null,
    },
  },
  intent_vector: "",
  action_type: "IDLE",
  environment: {
    name: "Unknown",
    description: "",
    lighting: "bright",
    terrain: [],
    hazards: [],
    active_effects: [],
  },
  round_number: 0,
  initiative_order: [],
  current_turn: "",
  timestamp: new Date().toISOString(),
}
