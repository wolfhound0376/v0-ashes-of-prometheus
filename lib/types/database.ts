// Database types for D&D Dashboard content management

export interface Environment {
  id: string
  name: string
  time_of_day: string
  background_image_url: string | null
  fog_overlay_url: string | null
  ambient_animation: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export interface Character {
  id: string
  name: string
  level: number
  class: string
  xp: number
  xp_to_next: number
  avatar_image_url: string | null
  portrait_image_url: string | null
  hp_current: number
  hp_max: number
  ac: number
  initiative: number
  proficiency_bonus: number
  passive_perception: number
  str_score: number
  str_modifier: number
  dex_score: number
  dex_modifier: number
  con_score: number
  con_modifier: number
  int_score: number
  int_modifier: number
  wis_score: number
  wis_modifier: number
  cha_score: number
  cha_modifier: number
  weight_current: number
  weight_max: number
  is_player: boolean
  created_at: string
  updated_at: string
}

export interface EquipmentItem {
  id: string
  character_id: string
  slot: 'head' | 'neck' | 'torso' | 'legs' | 'feet' | 'main_hand' | 'off_hand' | 'ring1' | 'ring2'
  name: string
  icon_url: string | null
  equipped: boolean
  description: string | null
  stats_bonus: Record<string, number>
  created_at: string
  updated_at: string
}

export interface InventoryItem {
  id: string
  character_id: string
  name: string
  quantity: number
  icon_url: string | null
  icon_type: 'custom' | 'preset'
  preset_icon: string | null
  description: string | null
  weight: number
  value: number
  item_type: 'weapon' | 'armor' | 'consumable' | 'misc' | 'currency'
  created_at: string
  updated_at: string
}

export interface Action {
  id: string
  name: string
  description: string | null
  icon_url: string | null
  icon_type: 'preset' | 'custom'
  preset_icon: string | null
  action_type: 'action' | 'bonus_action' | 'reaction'
  color_scheme: 'green' | 'orange' | 'purple'
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Ability {
  id: string
  character_id: string
  name: string
  icon_url: string | null
  icon_type: 'preset' | 'custom'
  preset_icon: string | null
  unlocked: boolean
  unlock_level: number | null
  description: string | null
  spell_level: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Dialogue {
  id: string
  environment_id: string
  speaker: string
  speaker_type: 'npc' | 'player'
  text: string
  portrait_url: string | null
  sort_order: number
  created_at: string
}

export interface MagicalResource {
  id: string
  character_id: string
  resource_type: 'spell_slots' | 'sorcery_points' | 'arcane_charges'
  current_value: number
  max_value: number
  icon_url: string | null
  created_at: string
  updated_at: string
}

export interface DashboardAsset {
  id: string
  asset_type: 'background' | 'overlay' | 'icon' | 'animation' | 'border' | 'divider'
  panel_type: string | null
  name: string
  file_url: string | null
  thumbnail_url: string | null
  animation_css: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface EnvironmentInventory {
  id: string
  environment_id: string | null
  campaign_id: string | null
  location: string | null
  name: string
  description: string | null
  quantity: number
  icon_url: string | null
  icon_type: 'custom' | 'preset'
  preset_icon: string | null
  weight: number
  value: number
  item_type: 'weapon' | 'armor' | 'consumable' | 'misc' | 'currency' | 'quest'
  requirements: string | null
  is_hidden: boolean
  is_available: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// Form types for creating/updating
export type CreateEnvironment = Omit<Environment, 'id' | 'created_at' | 'updated_at'>
export type CreateCharacter = Omit<Character, 'id' | 'created_at' | 'updated_at'>
export type CreateEquipmentItem = Omit<EquipmentItem, 'id' | 'created_at' | 'updated_at'>
export type CreateInventoryItem = Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'>
export type CreateAction = Omit<Action, 'id' | 'created_at' | 'updated_at'>
export type CreateAbility = Omit<Ability, 'id' | 'created_at' | 'updated_at'>
export type CreateDialogue = Omit<Dialogue, 'id' | 'created_at'>
export type CreateMagicalResource = Omit<MagicalResource, 'id' | 'created_at' | 'updated_at'>
export type CreateDashboardAsset = Omit<DashboardAsset, 'id' | 'created_at' | 'updated_at'>
export type CreateEnvironmentInventory = Omit<EnvironmentInventory, 'id' | 'created_at' | 'updated_at'>

// Preset icon options
export const ACTION_PRESET_ICONS = [
  'cast-spell',
  'use-ability', 
  'dash',
  'disengage',
  'help',
  'ready',
  'search',
  'cast-ritual'
] as const

export const ABILITY_PRESET_ICONS = [
  'mage-hand',
  'fire-bolt',
  'shield',
  'magic-missile',
  'detect-magic',
  'locked'
] as const

export const INVENTORY_PRESET_ICONS = [
  'backpack',
  'robe',
  'potion',
  'scroll',
  'pearl',
  'rope',
  'torch',
  'gold'
] as const

export const EQUIPMENT_SLOTS = [
  'head',
  'neck', 
  'torso',
  'legs',
  'feet',
  'main_hand',
  'off_hand',
  'ring1',
  'ring2'
] as const
