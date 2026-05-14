import { streamText, tool } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { buildWorldContext, formatWorldContextForAI } from "@/lib/world-ai/world-context"
import { CAMPAIGNS } from "@/lib/world-ai/campaigns"

// Generate an icon for an item using AI image generation
async function generateItemIcon(itemName: string, itemType: string): Promise<string | null> {
  try {
    const response = await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/generate-item-icon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemName, itemType })
    })
    
    if (response.ok) {
      const { iconUrl } = await response.json()
      return iconUrl
    }
  } catch (error) {
    console.error('[Chat] Error generating item icon:', error)
  }
  return null
}

export async function POST(req: Request) {
  const { message, campaignId = "abyss" } = await req.json()
  
  const supabase = await createClient()
  const campaign = CAMPAIGNS[campaignId as keyof typeof CAMPAIGNS] || CAMPAIGNS.abyss
  
  // Get the player character
  const { data: playerCharacter } = await supabase
    .from("characters")
    .select("id, name")
    .eq("is_player", true)
    .single()
  
  // Get recent dialogue history for context (last 20 messages)
  const { data: recentDialogue } = await supabase
    .from("dialogue")
    .select("speaker, text")
    .order("created_at", { ascending: false })
    .limit(20)
  
  // Build world context with character data
  const worldContext = await buildWorldContext(
    campaignId,
    campaign.contexts.defaults.episode,
    campaign.contexts.locations[0],
    campaign.contexts.defaults.heat
  )
  const worldContextText = formatWorldContextForAI(worldContext)
  
  // Build conversation history for the AI
  const conversationHistory = (recentDialogue || [])
    .reverse()
    .map(d => ({
      role: d.speaker === "Malachar" ? "assistant" : "user" as const,
      content: `${d.speaker}: ${d.text}`
    }))
  
  // Save player message to dialogue
  await supabase.from("dialogue").insert({
    speaker: worldContext.characters[0]?.name || "Player",
    text: message,
    source: "player"
  })
  
  // The Lich Malachar system prompt
  const lichPrompt = `You are Malachar, a lich who serves as Dungeon Master. You speak with dark elegance, ancient wisdom, and subtle menace. You never break character.

${campaign.systemPrompt}

${worldContextText}

RULES:
- Address the player by their character name
- Reference their class abilities, stats, and inventory when relevant
- For dice rolls, write [[XdY+Z]] and wait for the player to roll
- Keep responses concise (1-3 paragraphs) unless describing important scenes
- Track their progress through the campaign
- IMPORTANT: When the player acquires ANY item (through scavenging, finding, stealing, being given, etc.), you MUST use the giveItem tool to add it to their inventory
- When rolling for starting equipment or scavenged items, use the giveItem tool for each item they receive
- Describe the item narratively, then call giveItem to actually add it to their inventory

AMBIENT MUSIC:
- Use the playMusic tool to set the atmosphere during narration
- Match music to the current scene:
  - COMBAT: "there-be-dragons" (dragons/epic), "rise-of-the-ancients" (boss fights), "dark-angel" (celestial)
  - TENSION: "dark-and-stormy" (storms), "burning-village" (disaster/urgency)
  - TRAVEL: "mountain-pass" (overland), "carriage-journey" (roads), "astral-plane" (planar)
  - NATURE: "forest-night" (wilderness), "swamplandia" (swamps), "druid-hilltop" (sacred), "the-feywild" (fey)
  - DUNGEON: "dungeon-i" (generic), "cavern-of-lost-souls" (haunted), "mummys-tomb" (ancient), "castle-jail" (prison), "sewers" (city)
  - HORROR: "vampire-castle" (gothic), "graveyard" (cemetery), "heart-meat-corridor" (aberrant), "shadowfell" (dark realm)
  - MYSTERY: "sleeping-dragon" (stealth), "wizards-tower" (arcane), "floating-ice-castle" (frost)
  - SOCIAL: "tavern-music" (inns), "country-village" (peaceful), "waterkeep" (city), "blacksmith-shoppe" (shops)
- Use "stop" for dialogue-heavy or quiet moments
- Don't change music too frequently - let it establish atmosphere

EXPERIENCE POINTS (D&D 5E):
- Award XP using the awardXP tool when players:
  - Defeat monsters (use standard 5E XP values based on CR)
  - Complete quests or objectives
  - Solve puzzles or overcome challenges creatively
  - Achieve significant roleplay moments
  - Survive dangerous encounters
- Standard monster XP by CR: CR0=10, CR1/8=25, CR1/4=50, CR1/2=100, CR1=200, CR2=450, CR3=700, CR4=1100, CR5=1800, CR6=2300, CR7=2900, CR8=3900
- Always announce XP awards narratively, e.g. "The shadows of your fallen foes yield their essence... you gain 200 experience points."
- When a player is ready to level up, congratulate them dramatically`

  const result = streamText({
    model: "anthropic/claude-sonnet-4-20250514",
    system: lichPrompt,
    messages: [
      ...conversationHistory,
      { role: "user", content: message }
    ],
    tools: {
      giveItem: tool({
        description: "Add an item to the player's inventory. Use this whenever the player acquires, finds, is given, or scavenges an item.",
        inputSchema: z.object({
          name: z.string().describe("The item name, e.g. 'Rusty Dagger', 'Silk Rope', 'Gold Coin'"),
          quantity: z.number().default(1).describe("How many of this item"),
          description: z.string().describe("A brief description of the item"),
          itemType: z.enum(["weapon", "armor", "tool", "consumable", "treasure", "misc"]).describe("The type of item"),
          weight: z.number().default(0.1).describe("Weight in pounds"),
          value: z.number().default(0).describe("Value in copper pieces"),
        }),
        execute: async ({ name, quantity, description, itemType, weight, value }) => {
          if (!playerCharacter?.id) {
            return { success: false, error: "No player character found" }
          }
          
          // Check if item already exists in inventory
          const { data: existingItem } = await supabase
            .from("inventory_items")
            .select("id, quantity")
            .eq("character_id", playerCharacter.id)
            .eq("name", name)
            .single()
          
          if (existingItem) {
            // Update quantity
            await supabase
              .from("inventory_items")
              .update({ quantity: existingItem.quantity + quantity })
              .eq("id", existingItem.id)
            
            return { success: true, message: `Added ${quantity} more ${name} to inventory (total: ${existingItem.quantity + quantity})` }
          }
          
          // Generate a custom icon for the new item
          const iconUrl = await generateItemIcon(name, itemType)
          
          // Insert new item
          const { error } = await supabase
            .from("inventory_items")
            .insert({
              character_id: playerCharacter.id,
              name,
              quantity,
              description,
              item_type: itemType,
              weight,
              value,
              icon_type: iconUrl ? "custom" : "preset",
              icon_url: iconUrl,
              preset_icon: iconUrl ? null : getPresetIcon(itemType),
            })
          
          if (error) {
            console.error('[Chat] Error adding item:', error)
            return { success: false, error: "Failed to add item to inventory" }
          }
          
          return { success: true, message: `Added ${quantity}x ${name} to inventory` }
        }
      }),
      removeItem: tool({
        description: "Remove an item from the player's inventory. Use when items are consumed, lost, or given away.",
        inputSchema: z.object({
          name: z.string().describe("The item name to remove"),
          quantity: z.number().default(1).describe("How many to remove"),
        }),
        execute: async ({ name, quantity }) => {
          if (!playerCharacter?.id) {
            return { success: false, error: "No player character found" }
          }
          
          const { data: existingItem } = await supabase
            .from("inventory_items")
            .select("id, quantity")
            .eq("character_id", playerCharacter.id)
            .eq("name", name)
            .single()
          
          if (!existingItem) {
            return { success: false, error: `${name} not found in inventory` }
          }
          
          if (existingItem.quantity <= quantity) {
            // Remove entirely
            await supabase
              .from("inventory_items")
              .delete()
              .eq("id", existingItem.id)
            return { success: true, message: `Removed all ${name} from inventory` }
          } else {
            // Reduce quantity
            await supabase
              .from("inventory_items")
              .update({ quantity: existingItem.quantity - quantity })
              .eq("id", existingItem.id)
            return { success: true, message: `Removed ${quantity} ${name} (${existingItem.quantity - quantity} remaining)` }
          }
        }
      }),
      awardXP: tool({
        description: "Award experience points to the player character. Use after defeating monsters, completing quests, solving puzzles, or achieving significant milestones. Follow D&D 5E XP values.",
        inputSchema: z.object({
          amount: z.number().describe("The amount of XP to award"),
          reason: z.string().describe("Why XP is being awarded, e.g. 'Defeated goblin', 'Completed quest', 'Creative problem solving'"),
          source: z.enum(["encounter", "quest", "milestone", "dm_award"]).default("dm_award").describe("The source of the XP"),
        }),
        execute: async ({ amount, reason, source }) => {
          if (!playerCharacter?.id) {
            return { success: false, error: "No player character found" }
          }
          
          // Get current character data
          const { data: character } = await supabase
            .from("characters")
            .select("name, level, experience_points")
            .eq("id", playerCharacter.id)
            .single()
          
          if (!character) {
            return { success: false, error: "Character not found" }
          }
          
          // D&D 5E XP thresholds for leveling
          const xpThresholds: Record<number, number> = {
            1: 0, 2: 300, 3: 900, 4: 2700, 5: 6500,
            6: 14000, 7: 23000, 8: 34000, 9: 48000, 10: 64000,
            11: 85000, 12: 100000, 13: 120000, 14: 140000, 15: 165000,
            16: 195000, 17: 225000, 18: 265000, 19: 305000, 20: 355000
          }
          
          const currentXP = character.experience_points || 0
          const newXP = currentXP + amount
          const currentLevel = character.level || 1
          const nextLevelXP = currentLevel < 20 ? xpThresholds[currentLevel + 1] : 0
          const xpToNextLevel = nextLevelXP > 0 ? Math.max(0, nextLevelXP - newXP) : 0
          const canLevelUp = currentLevel < 20 && newXP >= nextLevelXP
          
          // Update character XP
          const { error: updateError } = await supabase
            .from("characters")
            .update({ 
              experience_points: newXP,
              xp_to_next_level: xpToNextLevel
            })
            .eq("id", playerCharacter.id)
          
          if (updateError) {
            console.error('[Chat] Error updating XP:', updateError)
            return { success: false, error: "Failed to update XP" }
          }
          
          // Record in XP history
          await supabase
            .from("xp_history")
            .insert({
              character_id: playerCharacter.id,
              amount,
              reason,
              source
            })
          
          if (canLevelUp) {
            return { 
              success: true, 
              message: `Awarded ${amount} XP for: ${reason}. ${character.name} now has ${newXP} XP total.`,
              canLevelUp: true,
              newTotal: newXP,
              xpToNextLevel: 0,
              levelUpMessage: `${character.name} has enough experience to reach Level ${currentLevel + 1}!`
            }
          }
          
          return { 
            success: true, 
            message: `Awarded ${amount} XP for: ${reason}. ${character.name} now has ${newXP} XP total. ${xpToNextLevel} XP needed to reach Level ${currentLevel + 1}.`,
            canLevelUp: false,
            newTotal: newXP,
            xpToNextLevel
          }
        }
      }),
      playMusic: tool({
        description: `Trigger ambient music to set the mood. Available tracks by category:
COMBAT: 'there-be-dragons' (epic battles), 'rise-of-the-ancients' (boss fights)
TENSION: 'dark-and-stormy' (storms/danger), 'burning-village' (urgent/disaster)
EXPLORATION: 'mountain-pass' (travel), 'carriage-journey' (road trips), 'astral-plane' (planar travel)
NATURE: 'forest-night' (peaceful), 'swamplandia' (swamps), 'druid-hilltop' (sacred groves), 'the-feywild' (fey realm)
DUNGEON: 'dungeon-i' (underground), 'cavern-of-lost-souls' (haunted), 'mummys-tomb' (ancient), 'castle-jail' (prison), 'sewers' (city underground)
HORROR: 'vampire-castle' (gothic), 'graveyard' (cemetery), 'heart-meat-corridor' (flesh dungeons), 'shadowfell' (dark realm)
MYSTERY: 'sleeping-dragon' (sneaking), 'wizards-tower' (arcane), 'floating-ice-castle' (frost realms)
AMBIENT: 'country-village' (peaceful town), 'tavern-music' (inn/social), 'waterkeep' (city), 'blacksmith-shoppe' (forge)
Use 'stop' to fade out music.`,
        inputSchema: z.object({
          trackId: z.enum([
            "there-be-dragons", "dark-and-stormy", "forest-night", "sleeping-dragon",
            "mountain-pass", "swamplandia", "rise-of-the-ancients", "dungeon-i",
            "country-village", "wizards-tower", "vampire-castle", "dark-angel",
            "astral-plane", "burning-village", "carriage-journey", "cavern-of-lost-souls",
            "druid-hilltop", "mummys-tomb", "castle-jail", "the-feywild",
            "tavern-music", "waterkeep", "floating-ice-castle", "blacksmith-shoppe",
            "graveyard", "sewers", "heart-meat-corridor", "shadowfell", "stop"
          ]).describe("The track ID to play, or 'stop' to stop music"),
          reason: z.string().optional().describe("Brief reason for the music change")
        }),
        execute: async ({ trackId, reason }) => {
          if (trackId === "stop") {
            return { success: true, action: "stop", message: "Music fading out..." }
          }
          
          const trackNames: Record<string, string> = {
            "there-be-dragons": "There Be Dragons", "dark-and-stormy": "Dark and Stormy",
            "forest-night": "Forest Night", "sleeping-dragon": "Sleeping Dragon",
            "mountain-pass": "Mountain Pass", "swamplandia": "Swamplandia",
            "rise-of-the-ancients": "Rise of the Ancients", "dungeon-i": "Dungeon I",
            "country-village": "Country Village", "wizards-tower": "Wizard's Tower",
            "vampire-castle": "Vampire Castle", "dark-angel": "Dark Angel",
            "astral-plane": "Astral Plane", "burning-village": "Burning Village",
            "carriage-journey": "Carriage Journey", "cavern-of-lost-souls": "Cavern of Lost Souls",
            "druid-hilltop": "Druid Hilltop", "mummys-tomb": "Mummy's Tomb",
            "castle-jail": "Castle Jail", "the-feywild": "The Feywild",
            "tavern-music": "Tavern Music", "waterkeep": "Waterkeep",
            "floating-ice-castle": "Floating Ice Castle", "blacksmith-shoppe": "Blacksmith Shoppe",
            "graveyard": "Graveyard", "sewers": "Sewers",
            "heart-meat-corridor": "Heart Meat Corridor", "shadowfell": "Shadowfell"
          }
          
          return { 
            success: true, action: "play", trackId,
            trackName: trackNames[trackId], reason: reason || "Setting the mood"
          }
        }
      }),
    },
    maxSteps: 5, // Allow multiple tool calls in one response
    onFinish: async ({ text }) => {
      // Save Malachar's response after streaming completes
      await supabase.from("dialogue").insert({
        speaker: "Malachar",
        text,
        source: "world_ai"
      })
    }
  })
  
  return result.toTextStreamResponse()
}

// Map item types to preset icons as fallback
function getPresetIcon(itemType: string): string {
  const iconMap: Record<string, string> = {
    weapon: "sword",
    armor: "shield",
    tool: "wrench",
    consumable: "potion",
    treasure: "gem",
    misc: "backpack",
  }
  return iconMap[itemType] || "backpack"
}
