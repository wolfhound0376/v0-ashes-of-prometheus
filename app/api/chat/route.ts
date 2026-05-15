import { generateText, tool } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { buildWorldContext, formatWorldContextForAI } from "@/lib/world-ai/world-context"
import { CAMPAIGNS } from "@/lib/world-ai/campaigns"

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
- When the player acquires ANY item (through scavenging, finding, stealing, being given, etc.), you MUST use the giveItem tool AND write narrative text describing the acquisition. Never call a tool without also writing narrative.
- When items are consumed, lost, or given away, use the removeItem tool

INTERPRETING PLAYER MESSAGES:
- Messages starting with "[Dice Roll]" are MECHANICAL dice roll results from the player, not dialogue
  - Format: "[Dice Roll] CharacterName rolled XdY+Z for Purpose: [individual rolls] = Total"
  - Interpret the total as the result of whatever action was being attempted
  - Respond to the outcome (success/failure based on DC, damage dealt, etc.)
  - Do NOT ask them to roll again - they already rolled
- Messages starting with "[Reaction]" indicate the player used a reaction ability
  - Narrate the effect of the reaction and continue the scene
- All other messages are in-character dialogue or actions from the player

EXPERIENCE POINTS:
- When players defeat monsters, complete quests, or achieve milestones, announce XP awards narratively
- Follow D&D 5E XP values based on CR`

  const result = await generateText({
    model: "anthropic/claude-sonnet-4-20250514",
    system: lichPrompt,
    messages: [
      ...conversationHistory,
      { role: "user", content: message }
    ],
    tools: {
      giveItem: tool({
        description: "Add an item to the player's inventory. Use when the player acquires, finds, or is given an item. You MUST also write narrative text alongside this tool call.",
        parameters: z.object({
          name: z.string().describe("Item name, e.g. 'Rusty Dagger'"),
          quantity: z.number().optional().describe("How many, defaults to 1"),
          description: z.string().describe("Brief description of the item"),
          itemType: z.enum(["weapon", "armor", "consumable", "misc", "currency"]).optional().describe("Item category, defaults to misc"),
          weight: z.number().optional().describe("Weight in pounds, defaults to 0.1"),
          value: z.number().optional().describe("Value in copper pieces, defaults to 0"),
        }),
        execute: async ({ name, quantity: rawQty, description, itemType: rawType, weight: rawWeight, value: rawValue }) => {
          const quantity = rawQty ?? 1
          const itemType = rawType ?? "misc"
          const weight = rawWeight ?? 0.1
          const value = rawValue ?? 0
          if (!playerCharacter?.id) return { success: false, error: "No player character" }
          
          const { data: existing } = await supabase
            .from("inventory_items")
            .select("id, quantity")
            .eq("character_id", playerCharacter.id)
            .eq("name", name)
            .single()
          
          if (existing) {
            await supabase.from("inventory_items")
              .update({ quantity: existing.quantity + quantity })
              .eq("id", existing.id)
            return { success: true, message: `Updated ${name} (total: ${existing.quantity + quantity})` }
          }
          
          const { error } = await supabase.from("inventory_items").insert({
            character_id: playerCharacter.id,
            name, quantity, description,
            item_type: itemType, weight, value,
          })
          
          if (error) return { success: false, error: error.message }
          return { success: true, message: `Added ${quantity}x ${name}` }
        }
      }),
      removeItem: tool({
        description: "Remove an item from inventory. Use when items are consumed, lost, or given away.",
        parameters: z.object({
          name: z.string().describe("Item name to remove"),
          quantity: z.number().optional().describe("How many to remove, defaults to 1"),
        }),
        execute: async ({ name, quantity: rawQty }) => {
          const quantity = rawQty ?? 1
          if (!playerCharacter?.id) return { success: false, error: "No player character" }
          
          const { data: existing } = await supabase
            .from("inventory_items")
            .select("id, quantity")
            .eq("character_id", playerCharacter.id)
            .eq("name", name)
            .single()
          
          if (!existing) return { success: false, error: `${name} not found` }
          
          if (existing.quantity <= quantity) {
            await supabase.from("inventory_items").delete().eq("id", existing.id)
            return { success: true, message: `Removed all ${name}` }
          }
          
          await supabase.from("inventory_items")
            .update({ quantity: existing.quantity - quantity })
            .eq("id", existing.id)
          return { success: true, message: `Removed ${quantity} ${name}` }
        }
      }),
    },
    maxSteps: 2,
  })
  
  // Collect text from all steps (tool step + follow-up text step)
  let responseText = ""
  for (const step of result.steps) {
    if (step.text?.trim()) {
      responseText += (responseText ? "\n\n" : "") + step.text.trim()
    }
  }
  
  if (responseText) {
    await supabase.from("dialogue").insert({
      speaker: "Malachar",
      text: responseText,
      source: "world_ai"
    })
  }
  
  return Response.json({ text: responseText || "" })
}
