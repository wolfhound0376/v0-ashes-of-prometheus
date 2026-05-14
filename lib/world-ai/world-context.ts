// World Context Service - Gathers all world-building data for Malachar
import { createClient } from "@/lib/supabase/server"
import { CAMPAIGNS, Campaign } from "./campaigns"
import type { Character, InventoryItem, EquipmentItem, Ability, Environment, Dialogue } from "@/lib/types/database"

export interface WorldContext {
  campaign: {
    name: string
    subtitle: string
    description: string
    systemPrompt: string
    currentEpisode: string
    currentLocation: string
    heatLevel: string
    lore: Array<{ category: string; items: Array<{ name: string; text: string }> }>
    quickActions: Array<{ label: string; prompt: string }>
    maps: Array<{ name: string; hotspots: Array<{ name: string; text: string }> }>
  }
  characters: Array<{
    name: string
    class: string
    level: number
    hp: string
    ac: number
    abilities: string[]
    equipment: string[]
    inventory: string[]
  }>
  environment: {
    name: string
    timeOfDay: string
    description: string
  } | null
  recentDialogue: Array<{
    speaker: string
    text: string
  }>
}

// Build campaign context from the campaigns.ts data
export function buildCampaignContext(
  campaignId: string,
  episode: string,
  location: string,
  heat: string
): WorldContext["campaign"] | null {
  const campaign = CAMPAIGNS[campaignId]
  if (!campaign) return null

  return {
    name: campaign.name,
    subtitle: campaign.subtitle,
    description: campaign.description,
    systemPrompt: campaign.systemPrompt,
    currentEpisode: episode,
    currentLocation: location,
    heatLevel: heat,
    lore: campaign.lore,
    quickActions: campaign.quickActions.map(qa => ({
      label: qa.label,
      prompt: qa.prompt
    })),
    maps: campaign.maps.map(m => ({
      name: m.name,
      hotspots: m.hotspots.map(h => ({ name: h.name, text: h.text }))
    }))
  }
}

// Fetch characters from Supabase with their equipment and abilities
export async function fetchCharacters(): Promise<WorldContext["characters"]> {
  try {
    const supabase = await createClient()
    
    // Fetch characters
    const { data: characters, error: charError } = await supabase
      .from("characters")
      .select("*")
      .eq("is_player", true)
    
    if (charError || !characters) {
      console.error("[WorldContext] Error fetching characters:", charError)
      return []
    }

    // Fetch related data for each character
    const result = await Promise.all(characters.map(async (char: Character) => {
      // Get equipment
      const { data: equipment } = await supabase
        .from("equipment_items")
        .select("name, slot")
        .eq("character_id", char.id)
        .eq("equipped", true)
      
      // Get abilities
      const { data: abilities } = await supabase
        .from("abilities")
        .select("name")
        .eq("character_id", char.id)
        .eq("unlocked", true)
      
      // Get inventory
      const { data: inventory } = await supabase
        .from("inventory_items")
        .select("name, quantity")
        .eq("character_id", char.id)

      return {
        name: char.name,
        class: char.class,
        level: char.level,
        hp: `${char.hp_current}/${char.hp_max}`,
        ac: char.ac,
        abilities: abilities?.map((a: { name: string }) => a.name) || [],
        equipment: equipment?.map((e: { name: string; slot: string }) => `${e.name} (${e.slot})`) || [],
        inventory: inventory?.map((i: { name: string; quantity: number }) => 
          i.quantity > 1 ? `${i.name} x${i.quantity}` : i.name
        ) || []
      }
    }))

    return result
  } catch (error) {
    console.error("[WorldContext] Error in fetchCharacters:", error)
    return []
  }
}

// Fetch current environment
export async function fetchEnvironment(): Promise<WorldContext["environment"]> {
  try {
    const supabase = await createClient()
    
    const { data: env, error } = await supabase
      .from("environments")
      .select("name, time_of_day, description")
      .limit(1)
      .single()
    
    if (error || !env) {
      return null
    }

    return {
      name: env.name,
      timeOfDay: env.time_of_day,
      description: env.description || ""
    }
  } catch (error) {
    console.error("[WorldContext] Error fetching environment:", error)
    return null
  }
}

// Fetch recent dialogue
export async function fetchRecentDialogue(limit = 10): Promise<WorldContext["recentDialogue"]> {
  try {
    const supabase = await createClient()
    
    const { data: dialogue, error } = await supabase
      .from("dialogue")
      .select("speaker, text")
      .order("created_at", { ascending: false })
      .limit(limit)
    
    if (error || !dialogue) {
      return []
    }

    return dialogue.reverse().map((d: { speaker: string; text: string }) => ({
      speaker: d.speaker,
      text: d.text
    }))
  } catch (error) {
    console.error("[WorldContext] Error fetching dialogue:", error)
    return []
  }
}

// Build the full world context
export async function buildWorldContext(
  campaignId: string,
  episode: string,
  location: string,
  heat: string
): Promise<WorldContext> {
  const [characters, environment, recentDialogue] = await Promise.all([
    fetchCharacters(),
    fetchEnvironment(),
    fetchRecentDialogue()
  ])

  const campaign = buildCampaignContext(campaignId, episode, location, heat)

  return {
    campaign: campaign || {
      name: "Unknown Campaign",
      subtitle: "",
      description: "",
      systemPrompt: "",
      currentEpisode: episode,
      currentLocation: location,
      heatLevel: heat,
      lore: [],
      quickActions: [],
      maps: []
    },
    characters,
    environment,
    recentDialogue
  }
}

// Format world context as a string for the AI
export function formatWorldContextForAI(context: WorldContext): string {
  const lines: string[] = []

  // Campaign info
  lines.push(`=== CAMPAIGN: ${context.campaign.name} ===`)
  lines.push(`${context.campaign.subtitle}`)
  lines.push(`${context.campaign.description}`)
  lines.push("")
  lines.push(`CURRENT STATE:`)
  lines.push(`- Episode: ${context.campaign.currentEpisode}`)
  lines.push(`- Location: ${context.campaign.currentLocation}`)
  lines.push(`- Heat Level: ${context.campaign.heatLevel}`)
  lines.push("")

  // System prompt / DM instructions
  lines.push(`=== DM INSTRUCTIONS ===`)
  lines.push(context.campaign.systemPrompt)
  lines.push("")

  // Lore
  if (context.campaign.lore.length > 0) {
    lines.push(`=== LORE REFERENCE ===`)
    for (const category of context.campaign.lore) {
      lines.push(`\n[${category.category}]`)
      for (const item of category.items) {
        lines.push(`- ${item.name}: ${item.text}`)
      }
    }
    lines.push("")
  }

  // Map locations
  if (context.campaign.maps.length > 0) {
    lines.push(`=== MAP LOCATIONS ===`)
    for (const map of context.campaign.maps) {
      lines.push(`\n${map.name}:`)
      for (const hotspot of map.hotspots) {
        lines.push(`- ${hotspot.name}: ${hotspot.text}`)
      }
    }
    lines.push("")
  }

  // Characters
  if (context.characters.length > 0) {
    lines.push(`=== PLAYER CHARACTERS ===`)
    for (const char of context.characters) {
      lines.push(`\n${char.name} (Level ${char.level} ${char.class})`)
      lines.push(`  HP: ${char.hp}, AC: ${char.ac}`)
      if (char.abilities.length > 0) {
        lines.push(`  Abilities: ${char.abilities.join(", ")}`)
      }
      if (char.equipment.length > 0) {
        lines.push(`  Equipment: ${char.equipment.join(", ")}`)
      }
      if (char.inventory.length > 0) {
        lines.push(`  Inventory: ${char.inventory.join(", ")}`)
      }
    }
    lines.push("")
  }

  // Environment
  if (context.environment) {
    lines.push(`=== CURRENT ENVIRONMENT ===`)
    lines.push(`${context.environment.name} (${context.environment.timeOfDay})`)
    if (context.environment.description) {
      lines.push(context.environment.description)
    }
    lines.push("")
  }

  // Recent dialogue
  if (context.recentDialogue.length > 0) {
    lines.push(`=== RECENT DIALOGUE ===`)
    for (const d of context.recentDialogue) {
      lines.push(`${d.speaker}: "${d.text}"`)
    }
  }

  return lines.join("\n")
}
