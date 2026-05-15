import { generateText } from "ai"
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
- When the player acquires ANY item, include a tag at the end of your response: [ITEM_ADD: name | quantity | type | description]
  - type must be one of: weapon, armor, consumable, misc, currency
  - Example: [ITEM_ADD: Rusty Dagger | 1 | weapon | A corroded blade found in the rubble]
  - You may include multiple ITEM_ADD tags if multiple items are acquired
- When the player loses, uses, or gives away an item: [ITEM_REMOVE: name | quantity]
  - Example: [ITEM_REMOVE: Health Potion | 1]

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
  })
  
  const rawText = result.text || ""
  
  // Parse and process inventory tags from the response
  if (playerCharacter?.id) {
    // Handle ITEM_ADD tags
    const addMatches = rawText.matchAll(/\[ITEM_ADD:\s*([^|]+)\|\s*(\d+)\s*\|\s*(\w+)\s*\|\s*([^\]]+)\]/g)
    for (const match of addMatches) {
      const [, name, qty, type, description] = match
      const itemName = name.trim()
      const quantity = parseInt(qty.trim()) || 1
      const itemType = type.trim()
      const desc = description.trim()
      
      const { data: existing } = await supabase
        .from("inventory_items")
        .select("id, quantity")
        .eq("character_id", playerCharacter.id)
        .eq("name", itemName)
        .single()
      
      if (existing) {
        await supabase.from("inventory_items")
          .update({ quantity: existing.quantity + quantity })
          .eq("id", existing.id)
      } else {
        await supabase.from("inventory_items").insert({
          character_id: playerCharacter.id,
          name: itemName,
          quantity,
          description: desc,
          item_type: itemType,
        })
      }
    }
    
    // Handle ITEM_REMOVE tags
    const removeMatches = rawText.matchAll(/\[ITEM_REMOVE:\s*([^|]+)\|\s*(\d+)\s*\]/g)
    for (const match of removeMatches) {
      const [, name, qty] = match
      const itemName = name.trim()
      const quantity = parseInt(qty.trim()) || 1
      
      const { data: existing } = await supabase
        .from("inventory_items")
        .select("id, quantity")
        .eq("character_id", playerCharacter.id)
        .eq("name", itemName)
        .single()
      
      if (existing) {
        if (existing.quantity <= quantity) {
          await supabase.from("inventory_items").delete().eq("id", existing.id)
        } else {
          await supabase.from("inventory_items")
            .update({ quantity: existing.quantity - quantity })
            .eq("id", existing.id)
        }
      }
    }
  }
  
  // Strip inventory tags from the displayed text
  const responseText = rawText
    .replace(/\[ITEM_ADD:[^\]]+\]/g, "")
    .replace(/\[ITEM_REMOVE:[^\]]+\]/g, "")
    .trim()
  
  if (responseText) {
    await supabase.from("dialogue").insert({
      speaker: "Malachar",
      text: responseText,
      source: "world_ai"
    })
  }
  
  return Response.json({ text: responseText || "" })
}
