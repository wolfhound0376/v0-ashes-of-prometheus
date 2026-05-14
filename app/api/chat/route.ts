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
- Describe the item narratively, then call giveItem to actually add it to their inventory`

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
