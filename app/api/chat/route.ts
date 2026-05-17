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
  
  // Persist player's message to the dialogue table FIRST
  const playerName = playerCharacter?.name || "Player"
  const { error: playerDialogueError } = await supabase.from("dialogue").insert({
    speaker: playerName,
    speaker_type: "player",
    text: message,
  })
  if (playerDialogueError) {
    console.error("[v0] Error inserting player dialogue:", playerDialogueError)
  }
  
  // Get recent dialogue history for context (last 20 messages)
  const { data: recentDialogue } = await supabase
    .from("dialogue")
    .select("speaker, text")
    .order("created_at", { ascending: false })
    .limit(20)
  
  // Build world context with character data
  // Don't pass a hardcoded location - let buildWorldContext fetch the latest from database
  const worldContext = await buildWorldContext(
    campaignId,
    campaign.contexts.defaults.episode,
    "", // Pass empty string - buildWorldContext will query the latest location from DB
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
  const currentLocation = worldContext.environment?.name || "Velkynvelve (slave pen)"
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
- CRITICAL: When moving to a new STAGE/LOCATION, you MUST include BOTH tags in your response:
  * [LOCATION_IMAGE: vivid description of the new location for image generation]
  * [UPDATE_LOCATION: exact name of the new location]
  * These tags are REQUIRED and cannot be omitted when transitioning between stages. Without them, the environment will not update.
- Enforce the starting conditions: slaves have NO gear, NO weapons, NO spell components. They are barefoot and manacled until they escape or acquire items.

RULES:
- Address the player by their character name
- Reference their class abilities, stats, and inventory when relevant
- For dice rolls, write [[XdY+Z]] and wait for the player to roll
- Keep responses concise (1-3 paragraphs) unless describing important scenes
- Track their progress through the campaign

STRUCTURED TAGS — CRITICAL FOR GAME STATE:
Include these tags inline with your prose whenever game state changes. The system parses them to update the dashboard.

ITEMS:
- [ITEM_ADD: name | quantity | type | description] — when player acquires an item
  - type must be: weapon, armor, consumable, misc, currency
  - Example: [ITEM_ADD: Rusty Dagger | 1 | weapon | A corroded blade found in the rubble]
- [ITEM_REMOVE: name | quantity] — when player loses/uses/gives away an item
  - Example: [ITEM_REMOVE: Health Potion | 1]

HEALTH & CONDITIONS:
- [DAMAGE: amount type] — when player takes damage. Include this EVERY time damage is dealt.
  - Example: [DAMAGE: 4 acid] or [DAMAGE: 8 slashing]
- [HEAL: amount] — when player is healed
  - Example: [HEAL: 5]
- [CONDITION_ADD: name] — when player gains a condition
  - Standard D&D 5e: prone, poisoned, charmed, frightened, grappled, incapacitated, invisible, paralyzed, petrified, restrained, stunned, unconscious, blinded, deafened, exhaustion
  - Narrative: acid_burn, bleeding, manacled, etc.
  - Example: [CONDITION_ADD: poisoned]
- [CONDITION_REMOVE: name] — when a condition clears
  - Example: [CONDITION_REMOVE: prone]

NPC/MONSTER ENCOUNTERS:
- [NPC_ENCOUNTER: name | description | portrait_prompt] — when an NPC/monster enters active combat or interaction
  - name: The creature's name (e.g. "Gray Ooze", "Ilvara")
  - description: Short tactical description visible to player
  - portrait_prompt: Art prompt for generating portrait
  - Example: [NPC_ENCOUNTER: Gray Ooze | A pulsing mass of corrosive jelly | dark fantasy concept art of a gray ooze creature, dim cave lighting, menacing]
- [NPC_LEAVE: name] — when an NPC/monster dies, flees, or is no longer interacting
  - Example: [NPC_LEAVE: Gray Ooze]
- [NPC_IMAGE: description] — generates a portrait image only (no encounter tracking)
  - Use for introducing NPCs visually without adding to active encounters

LOCATION:
- [UPDATE_LOCATION: name] — updates the current location in world state
  - Example: [UPDATE_LOCATION: Underdark Tunnels]
- [LOCATION_IMAGE: description] — generates a new location background image
  - Example: [LOCATION_IMAGE: vast cavern with bioluminescent fungi]

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
    const removeMatches = rawText.matchAll(/\[ITEM_REMOVE:\s*([^|]+)\|\s*(\d+)\s*\]/gi)
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
    
    // Handle DAMAGE tags - [DAMAGE: amount type]
    const damageMatches = rawText.matchAll(/\[DAMAGE:\s*(\d+)\s*(\w+)?\s*\]/gi)
    for (const match of damageMatches) {
      const [, amountStr, damageType] = match
      const amount = parseInt(amountStr) || 0
      console.log("[v0] DAMAGE tag found:", amount, damageType || "untyped")
      
      if (amount > 0) {
        // Get current HP and apply damage
        const { data: char } = await supabase
          .from("characters")
          .select("hp_current")
          .eq("id", playerCharacter.id)
          .single()
        
        if (char) {
          const newHp = Math.max(0, (char.hp_current || 0) - amount)
          const { error } = await supabase
            .from("characters")
            .update({ hp_current: newHp })
            .eq("id", playerCharacter.id)
          
          if (error) {
            console.error("[v0] Error applying damage:", error)
          } else {
            console.log("[v0] HP updated:", char.hp_current, "->", newHp)
          }
        }
      }
    }
    
    // Handle HEAL tags - [HEAL: amount]
    const healMatches = rawText.matchAll(/\[HEAL:\s*(\d+)\s*\]/gi)
    for (const match of healMatches) {
      const [, amountStr] = match
      const amount = parseInt(amountStr) || 0
      console.log("[v0] HEAL tag found:", amount)
      
      if (amount > 0) {
        // Get current HP and max HP, apply healing
        const { data: char } = await supabase
          .from("characters")
          .select("hp_current, hp_max")
          .eq("id", playerCharacter.id)
          .single()
        
        if (char) {
          const newHp = Math.min(char.hp_max || 10, (char.hp_current || 0) + amount)
          const { error } = await supabase
            .from("characters")
            .update({ hp_current: newHp })
            .eq("id", playerCharacter.id)
          
          if (error) {
            console.error("[v0] Error applying heal:", error)
          } else {
            console.log("[v0] HP healed:", char.hp_current, "->", newHp)
          }
        }
      }
    }
    
    // Handle CONDITION_ADD tags - [CONDITION_ADD: name]
    const conditionAddMatches = rawText.matchAll(/\[CONDITION_ADD:\s*([^\]]+)\]/gi)
    for (const match of conditionAddMatches) {
      const [, conditionName] = match
      const condition = conditionName.trim().toLowerCase()
      console.log("[v0] CONDITION_ADD tag found:", condition)
      
      // Get current conditions array
      const { data: char } = await supabase
        .from("characters")
        .select("conditions")
        .eq("id", playerCharacter.id)
        .single()
      
      const currentConditions: string[] = (char?.conditions as string[]) || []
      if (!currentConditions.includes(condition)) {
        const { error } = await supabase
          .from("characters")
          .update({ conditions: [...currentConditions, condition] })
          .eq("id", playerCharacter.id)
        
        if (error) {
          console.error("[v0] Error adding condition:", error)
        } else {
          console.log("[v0] Condition added:", condition)
        }
      }
    }
    
    // Handle CONDITION_REMOVE tags - [CONDITION_REMOVE: name]
    const conditionRemoveMatches = rawText.matchAll(/\[CONDITION_REMOVE:\s*([^\]]+)\]/gi)
    for (const match of conditionRemoveMatches) {
      const [, conditionName] = match
      const condition = conditionName.trim().toLowerCase()
      console.log("[v0] CONDITION_REMOVE tag found:", condition)
      
      // Get current conditions array
      const { data: char } = await supabase
        .from("characters")
        .select("conditions")
        .eq("id", playerCharacter.id)
        .single()
      
      const currentConditions: string[] = (char?.conditions as string[]) || []
      if (currentConditions.includes(condition)) {
        const { error } = await supabase
          .from("characters")
          .update({ conditions: currentConditions.filter(c => c !== condition) })
          .eq("id", playerCharacter.id)
        
        if (error) {
          console.error("[v0] Error removing condition:", error)
        } else {
          console.log("[v0] Condition removed:", condition)
        }
      }
    }
    
    // Handle NPC_ENCOUNTER tags - [NPC_ENCOUNTER: name | description | portrait_prompt]
    const npcEncounterMatches = rawText.matchAll(/\[NPC_ENCOUNTER:\s*([^|]+)\|\s*([^|]+)\|\s*([^\]]+)\]/gi)
    for (const match of npcEncounterMatches) {
      const [, npcName, description, portraitPrompt] = match
      const name = npcName.trim()
      const desc = description.trim()
      const prompt = portraitPrompt.trim()
      console.log("[v0] NPC_ENCOUNTER tag found:", name)
      
      // Generate portrait image via Fal
      let portraitUrl: string | null = null
      try {
        const result = await fal.subscribe("fal-ai/flux-schnell", {
          input: {
            prompt: `Dark fantasy portrait: ${prompt}. Style: detailed RPG character/creature art, dramatic fantasy lighting, painterly, professional illustration.`,
            image_size: "square_hd",
            num_inference_steps: 4,
            num_images: 1,
          },
        }) as any
        if (result?.images && result.images.length > 0) {
          portraitUrl = result.images[0].url
          console.log("[v0] NPC portrait generated:", portraitUrl)
        }
      } catch (err) {
        console.error("[v0] NPC portrait generation failed:", err)
      }
      
      // Check if this NPC already exists (might be returning)
      const { data: existingNpc } = await supabase
        .from("npc_encounters")
        .select("id")
        .eq("name", name)
        .eq("character_id", playerCharacter.id)
        .single()
      
      if (existingNpc) {
        // Reactivate existing NPC
        await supabase
          .from("npc_encounters")
          .update({ 
            is_active: true, 
            description: desc,
            portrait_url: portraitUrl || undefined 
          })
          .eq("id", existingNpc.id)
        console.log("[v0] NPC reactivated:", name)
      } else {
        // Insert new NPC encounter
        const { error } = await supabase.from("npc_encounters").insert({
          character_id: playerCharacter.id,
          name,
          description: desc,
          portrait_url: portraitUrl,
          is_active: true,
        })
        if (error) {
          console.error("[v0] Error creating NPC encounter:", error)
        } else {
          console.log("[v0] NPC encounter created:", name)
        }
      }
    }
    
    // Handle NPC_LEAVE tags - [NPC_LEAVE: name]
    const npcLeaveMatches = rawText.matchAll(/\[NPC_LEAVE:\s*([^\]]+)\]/gi)
    for (const match of npcLeaveMatches) {
      const [, npcName] = match
      const name = npcName.trim()
      console.log("[v0] NPC_LEAVE tag found:", name)
      
      const { error } = await supabase
        .from("npc_encounters")
        .update({ is_active: false })
        .eq("name", name)
        .eq("character_id", playerCharacter.id)
        .eq("is_active", true)
      
      if (error) {
        console.error("[v0] Error deactivating NPC:", error)
      } else {
        console.log("[v0] NPC deactivated:", name)
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
      }) as any
      if (result?.images && result.images.length > 0) {
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
      }) as any
      if (result?.images && result.images.length > 0) {
        locationImageUrl = result.images[0].url
        console.log("[v0] Location image generated:", locationImageUrl)
      }
    } catch (err) {
      console.error("[v0] Location image generation failed:", err)
    }
  } else {
    console.log("[v0] No [LOCATION_IMAGE:] tag found in response")
  }

  // Parse UPDATE_LOCATION tag to update the campaign location
  let updatedLocation: string | null = null
  const updateLocationMatch = rawText.match(/\[UPDATE_LOCATION:\s*([^\]]+)\]/)
  if (updateLocationMatch) {
    updatedLocation = updateLocationMatch[1].trim()
    console.log("[v0] Updating campaign location to:", updatedLocation)
    console.log("[v0] Current locationImageUrl:", locationImageUrl ? "SET" : "EMPTY", "| updatedLocation:", updatedLocation)
    
    // If no LOCATION_IMAGE tag was provided, auto-generate one based on the location name
    if (!locationImageUrl && updatedLocation) {
      console.log("[v0] Auto-generating location image for:", updatedLocation)
      try {
        const result = await fal.subscribe("fal-ai/flux-schnell", {
          input: {
            prompt: `Dark fantasy environment illustration: ${updatedLocation}. A dramatic scene in the Underdark of D&D. Style: detailed RPG scene art, atmospheric, dramatic fantasy lighting, professional concept art.`,
            image_size: "square_hd",
            num_inference_steps: 4,
            num_images: 1,
          },
        }) as any
        console.log("[v0] Fal result received:", result ? "YES" : "NO")
        if (result?.images && result.images.length > 0) {
          locationImageUrl = result.images[0].url
          console.log("[v0] Auto-generated location image:", locationImageUrl)
        } else {
          console.log("[v0] Fal returned no images. Result:", JSON.stringify(result).substring(0, 200))
        }
      } catch (err) {
        console.error("[v0] Auto-generation of location image failed:", err instanceof Error ? err.message : String(err))
      }
    } else {
      console.log("[v0] Skipping auto-generation: locationImageUrl exists or no updatedLocation")
    }
    
    try {
      // Create or update the environment record with the new location and image
      const { data: existingEnv } = await supabase
        .from("environments")
        .select("id")
        .eq("name", updatedLocation)
        .single()
      
      if (existingEnv) {
        // Location already exists - if we have an image (either from tag or auto-generated), update it
        if (locationImageUrl) {
          const { error: updateErr } = await supabase
            .from("environments")
            .update({ background_image_url: locationImageUrl })
            .eq("id", existingEnv.id)
          if (updateErr) {
            console.error("[v0] Error updating environment image:", updateErr)
          } else {
            console.log("[v0] Updated existing environment with image URL:", locationImageUrl.substring(0, 80))
          }
        } else {
          console.log("[v0] No image URL to update for existing environment")
        }
      } else {
        // Create new location environment with the image
        const { error: insertErr } = await supabase.from("environments").insert({
          name: updatedLocation,
          time_of_day: "Unknown",
          description: `The party has arrived at ${updatedLocation}.`,
          background_image_url: locationImageUrl || undefined,
        })
        if (insertErr) {
          console.error("[v0] Error creating environment:", insertErr)
        } else {
          console.log("[v0] Created new environment:", updatedLocation, "with image:", locationImageUrl ? "YES" : "NO")
        }
      }
    } catch (err) {
      console.error("[v0] Location update error:", err)
    }
  }

  // Strip all tags from the displayed text
  const responseText = rawText
    .replace(/\[ITEM_ADD:[^\]]+\]/gi, "")
    .replace(/\[ITEM_REMOVE:[^\]]+\]/gi, "")
    .replace(/\[NPC_IMAGE:[^\]]+\]/gi, "")
    .replace(/\[LOCATION_IMAGE:[^\]]+\]/gi, "")
    .replace(/\[UPDATE_LOCATION:[^\]]+\]/gi, "")
    .replace(/\[DAMAGE:[^\]]+\]/gi, "")
    .replace(/\[HEAL:[^\]]+\]/gi, "")
    .replace(/\[CONDITION_ADD:[^\]]+\]/gi, "")
    .replace(/\[CONDITION_REMOVE:[^\]]+\]/gi, "")
    .replace(/\[NPC_ENCOUNTER:[^\]]+\]/gi, "")
    .replace(/\[NPC_LEAVE:[^\]]+\]/gi, "")
    .trim()
  
  // Persist Malachar's response to the dialogue table
  if (responseText) {
    const { error: dialogueError } = await supabase.from("dialogue").insert({
      speaker: "Malachar",
      speaker_type: "dm",
      text: responseText,
    })
    if (dialogueError) {
      console.error("[v0] Error inserting Malachar dialogue:", dialogueError)
    }
  }
  
  return Response.json({ text: responseText || "", npcImageUrl, locationImageUrl })
}
