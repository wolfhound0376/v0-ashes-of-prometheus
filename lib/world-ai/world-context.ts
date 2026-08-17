// World Context Service - Gathers all world-building data for Malachar
import { createClient } from "@/lib/supabase/server"
import { calculateAC } from "@/lib/armor-class"
import { CAMPAIGNS, Campaign } from "./campaigns"
import type { Character, InventoryItem, EquipmentItem, Ability, Environment, Dialogue } from "@/lib/types/database"
import {
  retrieveBookPassages,
  formatBookPassages,
  formatPersonality,
  type BookRetrieval,
  type LichPersonality,
} from "./book-retrieval"

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
    race: string
    level: number
    hp: string
    ac: number
    speed: string
    proficiencyBonus: number
    abilityScores: {
      strength: number
      dexterity: number
      constitution: number
      intelligence: number
      wisdom: number
      charisma: number
    }
    savingThrows: string[]
    skills: string[]
    features: string[]
    abilities: string[]
    equipment: string[]
    inventory: string[]
    conditions: string[]
  }>
  // Active conditions on NPCs currently present in the scene, keyed by name.
  npcConditions: Array<{ name: string; conditions: string[] }>
  environment: {
    name: string
    timeOfDay: string
    description: string
    availableItems: Array<{
      id: string
      name: string
      description: string
      itemType: string
      quantity: number
      isHidden: boolean
    }>
  } | null
  recentDialogue: Array<{
    speaker: string
    text: string
  }>
  book: BookRetrieval
  personality: LichPersonality | null
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

// Short ability key -> display label for saving throws.
const ABILITY_LABEL: Record<string, string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
}

// Standard 5e skill -> governing ability (short key). Lookups are normalized
// (underscores to spaces, lowercased) so "sleight_of_hand" and "Sleight of Hand"
// both resolve.
const SKILL_ABILITY: Record<string, string> = {
  "acrobatics": "dex",
  "animal handling": "wis",
  "arcana": "int",
  "athletics": "str",
  "deception": "cha",
  "history": "int",
  "insight": "wis",
  "intimidation": "cha",
  "investigation": "int",
  "medicine": "wis",
  "nature": "int",
  "perception": "wis",
  "performance": "cha",
  "persuasion": "cha",
  "religion": "int",
  "sleight of hand": "dex",
  "stealth": "dex",
  "survival": "wis",
}

const abilityMod = (score: number) => Math.floor((score - 10) / 2)
const fmtBonus = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
const normalizeSkillKey = (raw: string) => raw.replace(/_/g, " ").trim().toLowerCase()
const titleCaseSkill = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

// Fetch characters from Supabase with their equipment and abilities
export async function fetchCharacters(): Promise<WorldContext["characters"]> {
  try {
    const supabase = await createClient()
    
    // Fetch characters
    const { data: characters, error: charError } = await supabase
      .from("characters")
      .select("*")
      .eq("is_player", true)
      .is("archived_at", null)
    
    if (charError || !characters) {
      console.error("[WorldContext] Error fetching characters:", charError)
      return []
    }

    // Fetch related data for each character
    const result = await Promise.all(characters.map(async (char: Character) => {
      // Get equipment
      const { data: equipment } = await supabase
        .from("equipment_items")
        .select("name, slot, stats_bonus")
        .eq("character_id", char.id)
        .eq("is_equipped", true)
      
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

      // Derive AC from equipped armour + ability modifiers, never the stale
      // hand-entered characters.ac column. This keeps the DM's view honest: with
      // the party's gear confiscated to the drow storeroom (nothing but Rags
      // equipped), Malachar correctly sees 10 + DEX rather than a phantom value.
      const derivedAc = calculateAC(char, equipment || [])

      // Pull the real sheet data the character forge already stored. These
      // columns exist on the row (select("*")) but aren't in the hand-written
      // Character interface, so read them via a narrow cast.
      const sheet = char as Character & {
        sheet_save_proficiencies?: string[] | null
        sheet_skill_proficiencies?: Record<string, string> | null
        sheet_features?: Array<{ name?: string; desc?: string; source?: string }> | null
      }

      const profBonus = char.proficiency_bonus || Math.floor((char.level - 1) / 4) + 2
      const scoreByAbility: Record<string, number> = {
        str: char.str_score || 10,
        dex: char.dex_score || 10,
        con: char.con_score || 10,
        int: char.int_score || 10,
        wis: char.wis_score || 10,
        cha: char.cha_score || 10,
      }

      // Saving throws: e.g. ["dex","int"] -> "DEX +5, INT +3" (mod + prof bonus).
      const savingThrows = Array.isArray(sheet.sheet_save_proficiencies)
        ? (sheet.sheet_save_proficiencies
            .map((k) => {
              const key = String(k).trim().toLowerCase()
              const label = ABILITY_LABEL[key]
              if (!label) return null
              return `${label} ${fmtBonus(abilityMod(scoreByAbility[key] ?? 10) + profBonus)}`
            })
            .filter(Boolean) as string[])
        : []

      // Skills: { Stealth: "expertise" } -> "Stealth +7 (expertise)".
      // Expertise doubles the proficiency bonus.
      const skills =
        sheet.sheet_skill_proficiencies && typeof sheet.sheet_skill_proficiencies === "object"
          ? (Object.entries(sheet.sheet_skill_proficiencies)
              .map(([rawName, level]) => {
                const lookup = normalizeSkillKey(rawName)
                const ability = SKILL_ABILITY[lookup]
                if (!ability) return null
                const isExpertise = String(level).toLowerCase() === "expertise"
                const bonus = abilityMod(scoreByAbility[ability] ?? 10) + profBonus * (isExpertise ? 2 : 1)
                return `${titleCaseSkill(lookup)} ${fmtBonus(bonus)}${isExpertise ? " (expertise)" : ""}`
              })
              .filter(Boolean) as string[])
          : []

      // Features: { name, desc, source } -> "Name — first sentence of desc" (≤120 chars).
      const features = Array.isArray(sheet.sheet_features)
        ? (sheet.sheet_features
            .map((f) => {
              const name = (f?.name || "").trim()
              if (!name) return null
              const descRaw = (f?.desc || "").trim()
              if (!descRaw) return name
              const firstSentence = descRaw.split(/(?<=[.!?])\s/)[0] || descRaw
              const capped =
                firstSentence.length > 120 ? `${firstSentence.slice(0, 120).trimEnd()}…` : firstSentence
              return `${name} — ${capped}`
            })
            .filter(Boolean) as string[])
        : []

      return {
        name: char.name,
        class: char.class,
        race: (char as Character & { sheet_species?: string }).sheet_species || "Unknown",
        level: char.level,
        hp: `${char.hp_current}/${char.hp_max}`,
        ac: derivedAc.total,
        speed: char.speed || "30 ft.", // Real sheet speed text, falls back to 30 ft.
        proficiencyBonus: profBonus,
        abilityScores: {
          strength: char.str_score || 10,
          dexterity: char.dex_score || 10,
          constitution: char.con_score || 10,
          intelligence: char.int_score || 10,
          wisdom: char.wis_score || 10,
          charisma: char.cha_score || 10,
        },
        savingThrows,
        skills,
        features,
        abilities: abilities?.map((a: { name: string }) => a.name) || [],
        equipment: equipment?.map((e: { name: string; slot: string }) => `${e.name} (${e.slot})`) || [],
        inventory: inventory?.map((i: { name: string; quantity: number }) => 
          i.quantity > 1 ? `${i.name} x${i.quantity}` : i.name
        ) || [],
        conditions: Array.isArray((char as Character & { conditions?: string[] }).conditions)
          ? ((char as Character & { conditions?: string[] }).conditions as string[])
          : [],
      }
    }))

    return result
  } catch (error) {
    console.error("[WorldContext] Error in fetchCharacters:", error)
    return []
  }
}

// Fetch active NPCs' conditions (present in the current scene).
export async function fetchNpcConditions(): Promise<WorldContext["npcConditions"]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("npc_encounters")
      .select("name, conditions, is_active")
      .eq("is_active", true)
    if (error || !data) return []
    // Dedupe by name; keep the first non-empty conditions set per NPC name.
    const byName = new Map<string, string[]>()
    for (const row of data as { name: string; conditions: string[] | null }[]) {
      const conds = Array.isArray(row.conditions) ? row.conditions : []
      if (!byName.has(row.name) || (byName.get(row.name)!.length === 0 && conds.length > 0)) {
        byName.set(row.name, conds)
      }
    }
    return Array.from(byName.entries())
      .filter(([, conds]) => conds.length > 0)
      .map(([name, conditions]) => ({ name, conditions }))
  } catch (error) {
    console.error("[WorldContext] Error fetching NPC conditions:", error)
    return []
  }
}

// Fetch current environment with available items
export async function fetchEnvironment(campaignId?: string, location?: string): Promise<WorldContext["environment"]> {
  try {
    const supabase = await createClient()
    
    // Query by location name if provided, otherwise get first
    let query = supabase
      .from("environments")
      .select("id, name, time_of_day, description")
    
    if (location) {
      query = query.eq("name", location)
    }
    
    const { data: env, error } = await query
      .limit(1)
      .single()
    
    if (error || !env) {
      return null
    }

    // Fetch available items in this environment/location
    let itemsQuery = supabase
      .from("environment_inventory")
      .select("id, name, description, item_type, quantity, is_hidden")
      .eq("is_available", true)
    
    if (env.id) {
      itemsQuery = itemsQuery.eq("environment_id", env.id)
    }
    if (campaignId) {
      itemsQuery = itemsQuery.eq("campaign_id", campaignId)
    }
    if (location) {
      itemsQuery = itemsQuery.eq("location", location)
    }

    const { data: items } = await itemsQuery

    return {
      name: env.name,
      timeOfDay: env.time_of_day,
      description: env.description || "",
      availableItems: items?.map((item: { 
        id: string
        name: string
        description: string
        item_type: string
        quantity: number
        is_hidden: boolean 
      }) => ({
        id: item.id,
        name: item.name,
        description: item.description || "",
        itemType: item.item_type,
        quantity: item.quantity,
        isHidden: item.is_hidden,
      })) || []
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
      // DM channel only — party whispers never enter world context.
      .eq("channel", "dm")
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

async function fetchPersonality(): Promise<LichPersonality | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("lich_personality")
      .select("snark, cruelty, crassness, swearing, fourth_wall, roast_target")
      .limit(1)
      .maybeSingle()
    return (data as LichPersonality) ?? null
  } catch (err) {
    console.warn("[WorldContext] personality fetch failed:", err)
    return null
  }
}

// "1" -> "Act 1 - Prisoners of the Drow". The act label is half of what makes
// retrieval land in the right chapter, so resolve it properly rather than
// passing the bare episode number.
function episodeLabelFor(campaignId: string, episode: string): string {
  const campaign = CAMPAIGNS[campaignId as keyof typeof CAMPAIGNS]
  const match = campaign?.contexts?.episodes?.find(([value]) => value === episode)
  return match ? match[1] : ""
}

// Build the full world context
export async function buildWorldContext(
  campaignId: string,
  episode: string,
  location: string,
  heat: string,
  playerMessage: string = ""
): Promise<WorldContext> {
  const supabase = await createClient()

  // Fetch the CURRENT location from database (most recently created/updated)
  // This ensures we always use the latest location even after [UPDATE_LOCATION:] tags
  const { data: latestEnv } = await supabase
    .from("environments")
    .select("name")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  const currentLocation = latestEnv?.name || location
  console.log("[WorldContext] Using location:", currentLocation)

  const [characters, environment, recentDialogue, npcConditions, personality, book] =
    await Promise.all([
      fetchCharacters(),
      fetchEnvironment(campaignId, currentLocation),
      fetchRecentDialogue(),
      fetchNpcConditions(),
      fetchPersonality(),
      retrieveBookPassages(campaignId, playerMessage, {
        episodeLabel: episodeLabelFor(campaignId, episode),
        location: currentLocation,
      }),
    ])

  const campaign = buildCampaignContext(campaignId, episode, currentLocation, heat)

  return {
    campaign: campaign || {
      name: "Unknown Campaign",
      subtitle: "",
      description: "",
      systemPrompt: "",
      currentEpisode: episode,
      currentLocation: currentLocation,
      heatLevel: heat,
      lore: [],
      quickActions: [],
      maps: []
    },
    characters,
    npcConditions,
    environment,
    recentDialogue,
    personality,
    book,
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

  const bookBlock = formatBookPassages(context.book)
  if (bookBlock) lines.push(bookBlock)

  const personalityBlock = formatPersonality(context.personality)
  if (personalityBlock) lines.push(personalityBlock)

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
      lines.push(`\n${char.name} (Level ${char.level} ${char.race} ${char.class})`)
      lines.push(`  HP: ${char.hp}, AC: ${char.ac}, Speed: ${char.speed}`)
      lines.push(`  Proficiency Bonus: +${char.proficiencyBonus}`)
      lines.push(`  Ability Scores: STR ${char.abilityScores.strength}, DEX ${char.abilityScores.dexterity}, CON ${char.abilityScores.constitution}, INT ${char.abilityScores.intelligence}, WIS ${char.abilityScores.wisdom}, CHA ${char.abilityScores.charisma}`)
      lines.push(`  Active Conditions: ${char.conditions.length > 0 ? char.conditions.join(", ") : "None"}`)
      if (char.savingThrows.length > 0) {
        lines.push(`  Saving Throw Proficiencies: ${char.savingThrows.join(", ")}`)
      }
      if (char.skills.length > 0) {
        lines.push(`  Skill Proficiencies: ${char.skills.join(", ")}`)
      }
      if (char.features.length > 0) {
        lines.push(`  Features: ${char.features.join("; ")}`)
      }
      if (char.abilities.length > 0) {
        lines.push(`  Class Features/Abilities: ${char.abilities.join(", ")}`)
      }
      if (char.equipment.length > 0) {
        lines.push(`  Equipped: ${char.equipment.join(", ")}`)
      }
      if (char.inventory.length > 0) {
        lines.push(`  Inventory: ${char.inventory.join(", ")}`)
      } else {
        lines.push(`  Inventory: Empty`)
      }
    }
    lines.push("")
  }

  // NPC conditions currently in effect
  if (context.npcConditions.length > 0) {
    lines.push(`=== NPC CONDITIONS ===`)
    for (const npc of context.npcConditions) {
      lines.push(`- ${npc.name}: ${npc.conditions.join(", ")}`)
    }
    lines.push("")
  }

  // HARD RULE: conditions are binding constraints on the narrative.
  lines.push(`=== CONDITIONS RULE (MANDATORY) ===`)
  lines.push(
    `The "Active Conditions" listed for each player character and the "NPC CONDITIONS" above are BINDING facts about the current scene. You MUST honor them in every response: a Manacled or Restrained creature cannot move freely or use its hands; behind a Magical Barrier it cannot physically cross or reach through; Prone, Poisoned, Frightened, Invisible, and Exhaustion impose their standard D&D 5e effects. NEVER narrate a character acting in a way their conditions forbid, and never silently drop a condition. A condition only changes when you emit the appropriate [CONDITION_ADD:] or [CONDITION_REMOVE:] tag.`
  )
  lines.push("")

  // Environment
  if (context.environment) {
    lines.push(`=== CURRENT ENVIRONMENT ===`)
    lines.push(`${context.environment.name} (${context.environment.timeOfDay})`)
    if (context.environment.description) {
      lines.push(context.environment.description)
    }
    
    // Available items in environment (excluding hidden ones from display)
    const visibleItems = context.environment.availableItems.filter(item => !item.isHidden)
    if (visibleItems.length > 0) {
      lines.push(`\nItems available to acquire:`)
      for (const item of visibleItems) {
        lines.push(`- ${item.name}${item.quantity > 1 ? ` (x${item.quantity})` : ""}: ${item.description}`)
      }
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
