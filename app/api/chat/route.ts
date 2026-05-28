import { generateText } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
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

=== CRITICAL OUTPUT RULES — READ FIRST ===
These rules are MANDATORY. The dashboard CANNOT detect game state changes from prose alone. Tags are the ONLY way to update the UI.

1. LOCATION CHANGES: You MUST emit [UPDATE_LOCATION: <name>] AND [LOCATION_IMAGE: <scene description>] on their own lines at the END of any response where the character moves to a new area. If you describe entering a tunnel, ledge, chamber, or any new space — EMIT THE TAGS.

2. DAMAGE: You MUST emit [DAMAGE: <amount> <type>] for ANY damage taken. If your prose says "you take 4 points of acid damage" or "the blow deals 6 slashing damage", you MUST ALSO emit the tag. Example: [DAMAGE: 4 acid]

3. HEALING: You MUST emit [HEAL: <amount>] whenever HP is restored.

4. CONDITIONS: You MUST emit [CONDITION_ADD: <name>] when the player gains ANY condition (poisoned, grappled, prone, restrained, frightened, exhaustion, bleeding, acid_burn, manacled, etc.). Emit [CONDITION_REMOVE: <name>] when it clears.

5. NPC/MONSTER ENCOUNTERS: You MUST emit [NPC_ENCOUNTER: <Name> | <description> | <portrait_prompt>] the FIRST time any NPC or monster meaningfully interacts with the player. If you describe a gray ooze blocking passage, a drow guard confronting them, or any creature entering the scene — EMIT THE TAG.

6. NPC DEPARTURES: You MUST emit [NPC_LEAVE: <Name>] when an NPC/monster dies, flees, or the encounter ends.

7. ITEMS: You MUST emit [ITEM_ADD: name | quantity | type | description] when player acquires items and [ITEM_REMOVE: name | quantity] when they lose/use items.

WHEN IN DOUBT, EMIT THE TAG. False positives are acceptable. Missed state changes break the game.

=== EXAMPLE OF CORRECT OUTPUT ===
Here is a CORRECT response that properly mixes prose with tags:

"The acidic tendril of the gray ooze lashes across your arm, searing flesh. You cry out as the corrosive slime eats into your skin.

[DAMAGE: 4 acid]
[CONDITION_ADD: acid_burn]

Gritting your teeth against the pain, you spot a narrow fissure in the cavern wall behind the creature — an escape route, perhaps, if you can get past this gelatinous horror.

[NPC_ENCOUNTER: Gray Ooze | A pulsing mass of corrosive jelly blocking the passage | dark fantasy concept art of a translucent gray ooze creature in a damp Underdark tunnel, bioluminescent fungi, dim lighting]"

And when the player escapes to a new area:

"You squeeze through the fissure, the ooze's pseudopod grasping uselessly at the stone behind you. The passage opens onto a vast underground ledge, the darkness below seemingly infinite.

[NPC_LEAVE: Gray Ooze]
[UPDATE_LOCATION: Underdark Ledge]
[LOCATION_IMAGE: vast underground cavern ledge overlooking an endless dark abyss, bioluminescent fungi clinging to walls, ancient stone formations, dramatic fantasy lighting]"

=== END CRITICAL RULES ===

=== COMBAT RULES (MANDATORY) ===
D&D 5E combat is turn-based and must follow the rules strictly. NO EXCEPTIONS.

ATTACK ROLLS & HITS:
- When a player declares an attack, ALWAYS ask them to roll 1d20 + their attack modifier vs the target's AC. NEVER resolve hits/misses yourself.
- Wait for their roll. Once they provide the result, narrate whether it hits based on the NPC's AC (shown below).
- Natural 1 = miss. Natural 20 = auto-hit crit.
- On a hit, ask for a damage roll using the appropriate die (e.g., "Roll 1d4+4 damage" for a dagger, or "Roll 1d8+2" for a rapier).

  DAMAGE & NPC HP:
  - When they provide damage, narrate the wound AND emit [NPC_DAMAGE: <Name> <amount>] on its own line.
  - The dashboard parses this and decrements the NPC's current HP.
  - After every hit, ALWAYS tell the player the NPC's current HP. Example: "Your blade rakes across its chitin. The Hook Horror screams. (Hook Horror: 63/75 HP)"
  - DO NOT declare an NPC dead unless its HP reaches 0. Only use [NPC_LEAVE: <Name>] when it dies or flees.
  - CRITICAL: If an NPC is killed, there MUST be AT LEAST ONE [NPC_DAMAGE:] tag in the same response bringing its HP to 0 or below. You cannot emit [NPC_LEAVE:] without prior damage. Example wrong: "The Hook Horror falls. [NPC_LEAVE: Hook Horror]" (missing damage tag). Example correct: "[NPC_DAMAGE: Hook Horror 10] [NPC_LEAVE: Hook Horror]"

NPC COUNTER-ATTACKS:
- When an NPC attacks Fifi, roll 1d20 + the NPC's attack bonus vs her AC.
- If hit, roll the NPC's damage dice and emit [DAMAGE: <amount> <type>] so her HP updates.
- Example: "The Hook Horror's barbed leg lashes out! [DAMAGE: 7 piercing]"

CRITICAL HITS:
- On a natural 20 attack, double the damage DICE (not the modifier). Example: 1d8+4 becomes 2d8+4.
- Roll the doubled dice and narrate the critical hit, then emit [NPC_DAMAGE:] with the total.

CURRENT NPC STATS (Hook Horror):
- AC: 15
- Attack: +7 to hit
- Damage: 1d8+4 (bite or claw) + 2d6 (barbed leg, once per combat)
- HP: 75 max
- Conditions: none

WORKED EXAMPLE — TWO-TURN COMBAT:

Turn 1:
"The Hook Horror's mandibles snap. You have an opening. What do you do?"
[Player: "I attack with my dagger"]
"Roll 1d20 + your attack modifier."
[Player: "I rolled 22"]
"A solid hit! Roll 1d4+4 damage."
[Player: "I rolled 6"]
"Your dagger slides between its chitinous plates, drawing ichor. The creature shrills in pain.

[NPC_DAMAGE: Hook Horror 6]
(Hook Horror: 69/75 HP)"

Turn 2:
"The Hook Horror retaliates, its barbed leg whipping toward your face."
"[[1d20+7]] for its attack. [rolling 16] Its leg catches your shoulder!

[DAMAGE: 5 piercing]

You take a glancing blow. What's your action?"

When it dies:
"Your final strike pierces the creature's core. It collapses, ichor pooling around its broken body.

[NPC_DAMAGE: Hook Horror 10]
[NPC_LEAVE: Hook Horror]

Victory is yours—but the sound of its death-screams echoes through the caverns. Something larger might have heard that."

=== END COMBAT RULES ===

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
  - [NPC_ENCOUNTER: name | description | portrait_prompt | CR=<n> | XP=<n> | type=<creature_type>] — when an NPC/monster enters active combat or interaction
  - name: The creature's name (e.g. "Gray Ooze", "Ilvara")
  - description: Short tactical description visible to player
  - portrait_prompt: Art prompt for generating portrait
  - CR: Challenge Rating from Monster Manual (e.g., CR=3 for Hook Horror, CR=1/2 for Gray Ooze)
  - XP: XP value from Monster Manual (e.g., XP=700 for CR 3, XP=100 for CR 1/2)
  - type: Creature type from Monster Manual (e.g., Monstrosity, Ooze, Humanoid)
  - ALWAYS use real Monster Manual stats. Hook Horror = CR 3, XP 700, Monstrosity. Gray Ooze = CR 1/2, XP 100, Ooze.
  - Example: [NPC_ENCOUNTER: Gray Ooze | A pulsing mass of corrosive jelly | dark fantasy concept art of a gray ooze creature, dim cave lighting, menacing | CR=0.5 | XP=100 | type=Ooze]
  - [NPC_LEAVE: name] — when an NPC/monster dies, flees, or is no longer interacting
  - Example: [NPC_LEAVE: Gray Ooze]
  - [NPC_IMAGE: description] — generates a portrait image only (no encounter tracking). Use ONLY for purely visual reveals with no interaction.

  === CRITICAL NPC INTERACTION RULE ===
  When a player TALKS TO or INTERACTS WITH any named NPC (not just sees them), you MUST emit [NPC_ENCOUNTER:] for that NPC. This is what shows their portrait card in the UI. Use [NPC_IMAGE:] is NOT enough for interactive NPCs.

  MANDATORY: Any time the player speaks to, approaches, or directly interacts with a named NPC, emit:
  [NPC_ENCOUNTER: Name | short description | portrait_prompt | CR=0 | XP=0 | type=Humanoid]

  Use CR=0 XP=0 type=Humanoid for non-combat NPCs (prisoners, allies, merchants).

  NPC portrait prompts for Out of the Abyss characters (use these EXACTLY as the portrait_prompt):
    * Ilvara Mizzrym → dark fantasy portrait of a tall elegant drow priestess, stark white hair, obsidian skin, crimson spider-silk robes, cruel violet eyes, silver holy symbol of Lolth, dramatic Underdark lighting
    * Jorlan Duskryn → dark fantasy portrait of a drow warrior, half his face horribly scarred and burned, silver-white hair, black leather armor, bitter haunted expression, dim cave torchlight
    * Sarith Kzekarit → dark fantasy portrait of a drow soldier, unusually pale even for a drow, sunken eyes, grey-tinged skin showing signs of fungal illness, hollow gaze, Underdark setting
    * Eldeth Feldrun → dark fantasy portrait of a stout shield dwarf woman, auburn braided hair, sturdy build, tattered prisoner clothes, proud defiant expression, Underdark cave background
    * Jimjar → dark fantasy portrait of a wiry deep gnome, large curious eyes, wide infectious grin, messy dark hair, nimble fingers, prisoner rags, Underdark cave background
    * Ront → dark fantasy portrait of a hulking orc, heavily scarred face, tusks, greasy black hair, prisoner rags straining over massive frame, sullen aggressive expression
    * Stool → dark fantasy illustration of a small myconid sprout, rounded mushroom cap head, glowing bioluminescent spores, childlike innocent posture, soft purple-blue glow, Underdark cave
    * Topsy → dark fantasy portrait of a deep gnome girl, dark eyes, nervous expression, slightly feral look, messy hair, prisoner rags, subtle signs of lycanthropy
    * Turvy → dark fantasy portrait of a deep gnome boy, twin to Topsy, nervous darting eyes, fidgety posture, prisoner rags, subtle signs of lycanthropy
    * Shuushar → dark fantasy portrait of a kuo-toa monk, blue-grey fish-like humanoid, large bulbous eyes, calm serene expression, prisoner rags, Underdark cave background
    * Derendil → dark fantasy portrait of a quaggoth, large white-furred ape-like humanoid, intelligent sad eyes, claims to be an elven prince, prisoner rags, Underdark cave

  Example for Ilvara interaction:
  [NPC_ENCOUNTER: Ilvara Mizzrym | Mistress of Velkynvelve, priestess of Lolth | dark fantasy portrait of a tall elegant drow priestess, stark white hair, obsidian skin, crimson spider-silk robes, cruel violet eyes, silver holy symbol of Lolth, dramatic Underdark lighting | CR=0 | XP=0 | type=Humanoid]

  === END NPC INTERACTION RULE ===

LOCATION:
- [UPDATE_LOCATION: name] — updates the current location in world state. ALWAYS emit this when the player moves to a new area.
  - Example: [UPDATE_LOCATION: Underdark Tunnels]
- [LOCATION_IMAGE: description] — generates a new location background image. ALWAYS emit this alongside UPDATE_LOCATION.
  - Example: [LOCATION_IMAGE: vast cavern with bioluminescent fungi, dramatic shadows, glowing mushrooms]
- CRITICAL: You MUST emit BOTH [UPDATE_LOCATION:] AND [LOCATION_IMAGE:] together every time the player enters a new location. Never emit one without the other.

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
    model: anthropic("claude-sonnet-4-6"),
    system: lichPrompt,
    messages: [
      ...conversationHistory,
      { role: "user", content: message }
    ],
  })
  
  const rawText = result.text || ""
  
  // === WARNING LOG: Detect when Malachar describes state changes without tags ===
  const hasDamageTag = /\[DAMAGE:/i.test(rawText)
  const hasLocationTag = /\[UPDATE_LOCATION:/i.test(rawText)
  const hasNpcEncounterTag = /\[NPC_ENCOUNTER:/i.test(rawText)
  const hasConditionTag = /\[CONDITION_ADD:/i.test(rawText)
  
  // Check for damage-like prose without tag
  if (!hasDamageTag && /\b(take|takes|dealt|deals|suffer|suffers)\s+\d+\s*(points?\s*(of\s*)?)?(damage|hit points?|hp)/i.test(rawText)) {
    console.warn("[v0] WARNING: Response describes damage but contains no [DAMAGE:] tag!")
  }
  
  // Check for location change prose without tag
  if (!hasLocationTag && /\b(you\s+(arrive|enter|emerge|step|climb|crawl|squeeze|descend|ascend)\s+(at|into|onto|through|out|in))|(\binto\s+(a|the|an)\s+(chamber|cavern|tunnel|passage|room|corridor|ledge|chute))/i.test(rawText)) {
    console.warn("[v0] WARNING: Response describes location change but contains no [UPDATE_LOCATION:] tag!")
  }
  
  // Check for NPC/monster introduction without tag
  if (!hasNpcEncounterTag && /\b(looms?|blocks?|confronts?|appears?|emerges?|attacks?|lunges?|approaches?)\s+(before|toward|at)\s+(you|the\s+party)/i.test(rawText)) {
    console.warn("[v0] WARNING: Response describes NPC/monster encounter but contains no [NPC_ENCOUNTER:] tag!")
  }
  
  // Check for condition-like prose without tag
  if (!hasConditionTag && /\b(you\s+(are|feel|become)\s+(poisoned|paralyzed|frightened|charmed|grappled|restrained|prone|blinded|deafened|stunned|unconscious|incapacitated))/i.test(rawText)) {
    console.warn("[v0] WARNING: Response describes condition but contains no [CONDITION_ADD:] tag!")
  }
  
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
    
    // Handle NPC_ENCOUNTER tags - [NPC_ENCOUNTER: name | description | portrait_prompt | CR=<n> | XP=<n> | type=<creature_type>]
    // Updated regex to capture optional CR/XP/type at the end
    const npcEncounterMatches = rawText.matchAll(/\[NPC_ENCOUNTER:\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)(?:\|\s*CR\s*=\s*([0-9.\/]+))?\s*(?:\|\s*XP\s*=\s*(\d+))?\s*(?:\|\s*type\s*=\s*([^\]]+))?\s*\]/gi)
    for (const match of npcEncounterMatches) {
      const [, npcName, description, portraitPrompt, crStr, xpStr, monsterType] = match
      const name = npcName.trim()
      const desc = description.trim()
      const prompt = portraitPrompt.trim()
      const cr = crStr ? parseFloat(crStr.trim()) : undefined
      const xp = xpStr ? parseInt(xpStr.trim()) : undefined
      const type = monsterType ? monsterType.trim() : undefined
      
      console.log("[v0] NPC_ENCOUNTER tag found:", name, "| CR:", cr, "| XP:", xp, "| Type:", type)
      
      // Generate portrait image via Fal
      let portraitUrl: string | null = null
      try {
        const result = await fal.subscribe("fal-ai/flux/schnell", {
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
          challenge_rating: cr,
          xp_value: xp,
          monster_type: type,
          is_active: true,
          hp_max: 75, // Default HP - will be overridden if specific NPC stats are known
          hp_current: 75,
        })
        if (error) {
          console.error("[v0] Error creating NPC encounter:", error)
        } else {
          console.log("[v0] NPC encounter created:", name, "| XP:", xp)
        }
      }
    }
    
    // Handle NPC_DAMAGE tags - [NPC_DAMAGE: Name amount]
    const npcDamageMatches = rawText.matchAll(/\[NPC_DAMAGE:\s*([^|\s]+)\s+(\d+)\s*\]/gi)
    for (const match of npcDamageMatches) {
      const [, npcName, amountStr] = match
      const name = npcName.trim()
      const amount = parseInt(amountStr) || 0
      console.log("[v0] NPC_DAMAGE tag found:", name, "takes", amount, "damage")
      
      if (amount > 0) {
        // Get NPC's current HP
        const { data: npc } = await supabase
          .from("npc_encounters")
          .select("hp_current, hp_max")
          .eq("name", name)
          .eq("character_id", playerCharacter.id)
          .eq("is_active", true)
          .single()
        
        if (npc) {
          const newHp = Math.max(0, (npc.hp_current || 0) - amount)
          const isDefeated = newHp <= 0
          
          // Update NPC HP
          const { error } = await supabase
            .from("npc_encounters")
            .update({ 
              hp_current: newHp,
              is_active: !isDefeated  // Deactivate if HP reaches 0
            })
            .eq("name", name)
            .eq("character_id", playerCharacter.id)
          
          if (error) {
            console.error("[v0] Error applying NPC damage:", error)
          } else {
            console.log("[v0] NPC HP updated:", npc.hp_current, "->", newHp, "| Defeated:", isDefeated)
          }
        }
      }
    }
    
    // Handle NPC_LEAVE tags - [NPC_LEAVE: name]
    const npcLeaveMatches = rawText.matchAll(/\[NPC_LEAVE:\s*([^\]]+)\]/gi)
    for (const match of npcLeaveMatches) {
      const [, npcName] = match
      const name = npcName.trim()
      console.log("[v0] NPC_LEAVE tag found:", name)
      
      // Fetch NPC to check if it's truly defeated (HP = 0) and get XP
      const { data: npc } = await supabase
        .from("npc_encounters")
        .select("id, hp_current, hp_max, xp_value, is_active")
        .eq("name", name)
        .eq("character_id", playerCharacter.id)
        .eq("is_active", true)
        .single()
      
      if (npc) {
        // Check if NPC is defeated narratively without HP reaching 0 (missing damage tags)
        if ((npc.hp_current || 0) > 0) {
          console.warn("[v0] WARNING: [NPC_LEAVE:] emitted for", name, 'but hp_current is', npc.hp_current, '— NPC defeated narratively without [NPC_DAMAGE:] tags!')
        }
        
        // Award XP if the NPC has xp_value (true defeat)
        if (npc.xp_value && (npc.hp_current || 0) <= 0) {
          console.log("[v0] Awarding", npc.xp_value, 'XP for defeating', name)
          
          // Get current XP and level to check for level-up
          const { data: char } = await supabase
            .from("characters")
            .select("xp, level")
            .eq("id", playerCharacter.id)
            .single()
          
          if (char) {
            const newXp = (char.xp || 0) + npc.xp_value
            const { error: xpError } = await supabase
              .from("characters")
              .update({ xp: newXp })
              .eq("id", playerCharacter.id)
            
            if (xpError) {
              console.error("[v0] Error awarding XP:", xpError)
            } else {
              // Check if this crossed a level threshold
              const xpThresholds = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000]
              const currentLevel = xpThresholds.findIndex(xp => newXp < xp) || xpThresholds.length
              const leveledUp = currentLevel > (char.level || 1)
              
              if (leveledUp) {
                console.log("[v0] LEVEL UP! New level:", currentLevel, '| XP:', newXp)
              } else {
                console.log("[v0] XP awarded. Total XP:", newXp, "| Next level at:", xpThresholds[Math.min((char.level || 1) + 1, xpThresholds.length - 1)])
              }
            }
          }
        }
      }
      
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
      const result = await fal.subscribe("fal-ai/flux/schnell", {
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
      const result = await fal.subscribe("fal-ai/flux/schnell", {
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
        const result = await fal.subscribe("fal-ai/flux/schnell", {
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
    .replace(/\[NPC_DAMAGE:[^\]]+\]/gi, "")
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

  // === AUTO NPC DETECTION FROM QUOTED SPEECH ===
  // If no NPC_ENCOUNTER tag was fired, scan the response for quoted dialogue
  // and automatically detect which NPC is speaking, then generate their portrait.
  const hadNpcEncounterTag = /\[NPC_ENCOUNTER:/i.test(rawText)
  if (!hadNpcEncounterTag && playerCharacter) {
    const hasQuotes = /[\u201C\u201D""]/.test(responseText) || /"[^"]{3,}"/.test(responseText)
    if (hasQuotes) {
      try {
        const detectionPrompt = `You are analyzing a D&D dungeon master's narration from "Out of the Abyss".

Narration:
"""
${responseText}
"""

Is a specific named NPC speaking the quoted dialogue? Known NPCs: Ilvara Mizzrym, Jorlan Duskryn, Sarith Kzekarit, Eldeth Feldrun, Jimjar, Ront, Stool, Topsy, Turvy, Shuushar, Derendil.

Respond ONLY with valid JSON, no other text:
- If a named NPC is speaking: {"npc": "Exact NPC Name", "description": "one sentence physical description"}
- If speaker is unnamed or unclear: {"npc": null}`

        const detectionResult = await generateText({
          model: anthropic("claude-haiku-4-5-20251001"),
          messages: [{ role: "user", content: detectionPrompt }],
        })

        const parsed = JSON.parse(detectionResult.text.trim())

        if (parsed.npc) {
          const npcName: string = parsed.npc
          console.log("[v0] Auto-detected speaking NPC:", npcName)

          const portraitPrompts: Record<string, string> = {
            "Ilvara Mizzrym": "dark fantasy portrait of a tall elegant drow priestess, stark white hair, obsidian skin, crimson spider-silk robes, cruel violet eyes, silver holy symbol of Lolth, dramatic Underdark lighting",
            "Jorlan Duskryn": "dark fantasy portrait of a drow warrior, half his face horribly scarred and burned, silver-white hair, black leather armor, bitter haunted expression, dim cave torchlight",
            "Sarith Kzekarit": "dark fantasy portrait of a drow soldier, unusually pale even for a drow, sunken eyes, grey-tinged skin showing signs of fungal illness, hollow gaze, Underdark setting",
            "Eldeth Feldrun": "dark fantasy portrait of a stout shield dwarf woman, auburn braided hair, sturdy build, tattered prisoner clothes, proud defiant expression, Underdark cave background",
            "Jimjar": "dark fantasy portrait of a wiry deep gnome, large curious eyes, wide infectious grin, messy dark hair, nimble fingers, prisoner rags, Underdark cave background",
            "Ront": "dark fantasy portrait of a hulking orc, heavily scarred face, tusks, greasy black hair, prisoner rags straining over massive frame, sullen aggressive expression",
            "Stool": "dark fantasy illustration of a small myconid sprout, rounded mushroom cap head, glowing bioluminescent spores, childlike innocent posture, soft purple-blue glow, Underdark cave",
            "Topsy": "dark fantasy portrait of a deep gnome girl, dark eyes, nervous expression, slightly feral look, messy hair, prisoner rags, subtle signs of lycanthropy",
            "Turvy": "dark fantasy portrait of a deep gnome boy, twin to Topsy, nervous darting eyes, fidgety posture, prisoner rags, subtle signs of lycanthropy",
            "Shuushar": "dark fantasy portrait of a kuo-toa monk, blue-grey fish-like humanoid, large bulbous eyes, calm serene expression, prisoner rags, Underdark cave background",
            "Derendil": "dark fantasy portrait of a quaggoth, large white-furred ape-like humanoid, intelligent sad eyes, claims to be an elven prince, prisoner rags, Underdark cave",
          }

          const portraitPrompt = portraitPrompts[npcName] ||
            `dark fantasy portrait of ${parsed.description || npcName}, dramatic Underdark lighting, detailed RPG character art`

          // Generate portrait via Fal
          let autoPortraitUrl: string | null = null
          try {
            const result = await fal.subscribe("fal-ai/flux/schnell", {
              input: {
                prompt: `Dark fantasy portrait: ${portraitPrompt}. Style: detailed RPG character art, dramatic fantasy lighting, painterly, professional illustration.`,
                image_size: "square_hd",
                num_inference_steps: 4,
                num_images: 1,
              },
            }) as any
            if (result?.images?.[0]?.url) {
              autoPortraitUrl = result.images[0].url
              console.log("[v0] Auto-generated portrait for:", npcName)
            }
          } catch (err) {
            console.error("[v0] Auto portrait generation failed:", err)
          }

          // Upsert NPC encounter in Supabase
          const { data: existingNpc } = await supabase
            .from("npc_encounters")
            .select("id")
            .eq("name", npcName)
            .eq("character_id", playerCharacter.id)
            .single()

          if (existingNpc) {
            await supabase
              .from("npc_encounters")
              .update({
                is_active: true,
                portrait_url: autoPortraitUrl || undefined,
                description: parsed.description || undefined,
              })
              .eq("id", existingNpc.id)
          } else {
            await supabase.from("npc_encounters").insert({
              character_id: playerCharacter.id,
              name: npcName,
              description: parsed.description || `${npcName} is speaking`,
              portrait_url: autoPortraitUrl,
              is_active: true,
              hp_max: null,
              hp_current: null,
              challenge_rating: 0,
              xp_value: 0,
              monster_type: "Humanoid",
            })
          }

          if (autoPortraitUrl) {
            npcImageUrl = autoPortraitUrl
          }
        }
      } catch (err) {
        console.error("[v0] NPC auto-detection failed:", err)
      }
    }
  }
  // === END AUTO NPC DETECTION ===

  return Response.json({ 
    text: responseText || "", 
    npcImageUrl, 
    locationImageUrl,
    updatedLocation: updatedLocation || undefined,
  })
}
