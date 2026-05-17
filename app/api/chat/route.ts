import { generateText } from "ai"
import { createClient } from "@/lib/supabase/server"
import { buildWorldContext, formatWorldContextForAI } from "@/lib/world-ai/world-context"
import { CAMPAIGNS } from "@/lib/world-ai/campaigns"
import * as fal from "@fal-ai/serverless-client"

// Configure Fal client
fal.config({
  credentials: process.env.FAL_KEY,
})

if (!process.env.FAL_KEY) {
  console.warn("[v0] Warning: FAL_KEY environment variable not set. Image generation will fail.")
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
  
  // Determine campaign stage based on location
  const currentLocation = worldContext.environment?.currentLocation || "Velkynvelve (slave pen)"
  let stageContext = ""
  
  if (currentLocation.toLowerCase().includes("slave pen") || currentLocation.toLowerCase().includes("pen")) {
    stageContext = "CURRENT STAGE: Slave Pen (Stage 1-2). The party is imprisoned and manacled. Run the scavenging roll if not done, then describe their confinement and prisoner NPC introductions."
  } else if (currentLocation.toLowerCase().includes("outpost") || currentLocation.toLowerCase().includes("velkynvelve") && !currentLocation.toLowerCase().includes("pen")) {
    stageContext = "CURRENT STAGE: Velkynvelve Outpost (Stage 4). The party has escaped the slave pens and is now loose in the drow outpost. Describe the architecture, markets, bridges, patrols. They must find an exit."
  } else if (currentLocation.toLowerCase().includes("tunnel") || currentLocation.toLowerCase().includes("underdark")) {
    stageContext = "CURRENT STAGE: Underdark Tunnels (Stage 5+). The party has fled Velkynvelve. Describe vast caverns, bioluminescent fungi, distant echoes. They are beginning their journey through the Underdark."
  }

  // The Lich Malachar system prompt
  const lichPrompt = `You are Malachar, a lich who serves as Dungeon Master. You speak with dark elegance, ancient wisdom, and subtle menace. You never break character. You are running the D&D 5E campaign "Out of the Abyss" in the Underdark of Faerûn.

${worldContextText}

${stageContext}

FORMATTING — CRITICAL:
- NEVER use asterisks (*), underscores (_), backticks, or any markdown formatting in your responses
- NEVER wrap text in quotation marks unless it is actual spoken dialogue by an NPC
- Write plain prose. Use em-dashes, ellipses, and sentence structure for emphasis instead of markdown
- Your text will be read aloud by text-to-speech. Formatting characters are spoken literally and sound terrible.
- NEVER repeat your name "Malachar" in every response. Establish character once, then drop the name unless specifically needed.

PROGRESSION TRIGGERS — ENFORCE THESE:
- STAGE 1→2: Once the player rolls d100 for scavenged item, transition to describing the slave pen with other prisoners.
- STAGE 2→3: When the player attempts escape (attacks guard, breaks chains, negotiates, sneak attacks), immediately transition to the Escape Encounter. Roll [[1d6]] and describe the encounter.
- STAGE 3→4: When the player succeeds at the escape encounter (defeats/evades the obstacle), move them to the Velkynvelve Outpost. Describe stone bridges, rope walkways, drow merchants, the vast cavern below. They are no longer in cells but hunted.
- STAGE 4→5: When the player finds and uses an exit (secret tunnel, sewer grate, climbing down the web-covered walls), transition them to the Underdark Tunnels. Use [LOCATION_IMAGE: tag].
- If a stage fails (party captured/killed), revert to that stage and run it again.
- NEVER skip stages. Progression must feel earned through player actions.
- You are running OUT OF THE ABYSS, Act 1: Escape Velkynvelve. The progression is strictly:
  * STAGE 1 (Arrival): Ask the player to roll [[1d100]] on the Scavenged Items table for their hidden item. Do NOT skip. Do NOT assume.
  * STAGE 2 (Slave Pen): After they provide the d100 result, describe waking in Velkynvelve slave pen. Introduce fellow prisoners (Eldeth, Jimjar, Topsy/Tulgy, Shuushar, Stool, Ront, Derendil). They are manacled and stripped of gear. You are in the pen, watching guards.
  * STAGE 3 (Escape Attempt): When the player attempts to escape (break chains, attack guards, negotiate, sneak out), run the Escape Encounter. Roll [[1d6]] on the Velkynvelve Escape table to determine what obstacle/NPC they face. DO NOT skip this encounter.
  * STAGE 4 (Outpost): After they overcome the escape encounter and reach the drow outpost proper, describe Velkynvelve's architecture, markets, bridges, and the danger above. Introduce key NPCs like Ilvara (drow priestess), merchants, guards. The slave pens are one level below. They are now loose in a hostile drow enclave.
  * STAGE 5 (Tunnels): When they flee Velkynvelve entirely (leaving the outpost through tunnels, sewers, or hidden passages), transition to the Underdark tunnels. Describe the vast caverns, bioluminescent fungi, distant sounds. This is the beginning of Act 2.
- Track which STAGE the party is in based on their progress. If they backtrack or get captured, you may revert stages.
- When moving to a new STAGE, include a [LOCATION_IMAGE: description] tag.
- Enforce the starting conditions: slaves have NO gear, NO weapons, NO spell components. They are barefoot and manacled until they escape or acquire items.

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
- When an NPC or monster is first introduced, encountered, or enters the scene, include a tag: [NPC_IMAGE: detailed visual description for an artist]
  - Describe their appearance, race, clothing, weapons, posture, lighting, and mood
  - Example: [NPC_IMAGE: A gaunt drow priestess in black spider-silk robes, white hair pulled back severely, violet eyes glowing with malice, holding a bone-handled scourge, standing in dim purple torchlight of an Underdark cavern]
  - Only include this tag when a NEW character or creature appears, not for every mention

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
  
  // Parse NPC_IMAGE tag and generate an image using Fal
  let npcImageUrl: string | null = null
  const npcImageMatch = rawText.match(/\[NPC_IMAGE:\s*([^\]]+)\]/)
  if (npcImageMatch) {
    const npcDescription = npcImageMatch[1].trim()
    try {
      const result = await fal.subscribe("fal-ai/flux-schnell", {
        input: {
          prompt: `Dark fantasy portrait: ${npcDescription}. Style: detailed RPG character art, dramatic fantasy lighting, painterly, professional illustration.`,
          image_size: "square_hd",
          num_inference_steps: 4,
          num_images: 1,
        },
      })
      if (result.images && result.images.length > 0) {
        npcImageUrl = result.images[0].url
      }
    } catch (err) {
      console.error("[v0] NPC image generation failed:", err)
    }
  }

  // Parse LOCATION_IMAGE tag and generate scene image using Fal
  let locationImageUrl: string | null = null
  const locationImageMatch = rawText.match(/\[LOCATION_IMAGE:\s*([^\]]+)\]/)
  if (locationImageMatch) {
    const locationDescription = locationImageMatch[1].trim()
    console.log("[v0] Generating location image with Fal:", locationDescription.substring(0, 60))
    try {
      const result = await fal.subscribe("fal-ai/flux-schnell", {
        input: {
          prompt: `Dark fantasy environment illustration: ${locationDescription}. Style: detailed RPG scene art, atmospheric, dramatic fantasy lighting, professional concept art.`,
          image_size: "square_hd",
          num_inference_steps: 4,
          num_images: 1,
        },
      })
      if (result.images && result.images.length > 0) {
        locationImageUrl = result.images[0].url
        console.log("[v0] Location image generated:", locationImageUrl)
      }
    } catch (err) {
      console.error("[v0] Location image generation failed:", err)
    }
  } else {
    console.log("[v0] No [LOCATION_IMAGE:] tag found in response")
  }

  // Strip all tags from the displayed text
  const responseText = rawText
    .replace(/\[ITEM_ADD:[^\]]+\]/g, "")
    .replace(/\[ITEM_REMOVE:[^\]]+\]/g, "")
    .replace(/\[NPC_IMAGE:[^\]]+\]/g, "")
    .replace(/\[LOCATION_IMAGE:[^\]]+\]/g, "")
    .trim()
  
  if (responseText) {
    await supabase.from("dialogue").insert({
      speaker: "Malachar",
      text: responseText,
      source: "world_ai"
    })
  }
  
  return Response.json({ text: responseText || "", npcImageUrl, locationImageUrl })
}
