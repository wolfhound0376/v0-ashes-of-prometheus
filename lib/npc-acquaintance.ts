// Who an NPC actually knows (Sam, 2026-10-12: "The NPCs shouldn't use your name if they don't know you
// yet. They should talk to you based on their gravity to you in the relationship, their personality").
//
// A name is learned, not assumed. It is stored in `npc_knowledge` (kind "name", learned_from_character =
// the player character) the first time that character says their own name to the NPC in a conversation.
// Until then the NPC addresses them by what it can see. The relationship numbers come from
// `character_relationships` (trust, fear, respect, affection, debt, resentment), written by the gravity
// system; while there are none, the NPC treats the character as a stranger.

type Db = any // the admin client; untyped like the rest of the routes that use it

const RELATIONSHIP_DIMS = ["trust", "fear", "respect", "affection", "debt", "resentment"] as const

const firstWord = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? ""

/** The npc_encounters row for a name as the map or the talk window gives it ("Eldeth", "Eldeth Feldrun"). */
export async function findNpcRow(db: Db, npcName: string): Promise<{ id: string; name: string; description: string | null; disposition: string | null } | null> {
  const name = npcName.trim()
  if (!name) return null
  const cols = "id, name, description, disposition"
  const exact = await db.from("npc_encounters").select(cols).ilike("name", name).limit(1)
  if (exact.data?.[0]) return exact.data[0]
  const first = firstWord(name)
  const loose = await db.from("npc_encounters").select(cols).ilike("name", `${first}%`).limit(1)
  if (loose.data?.[0]) return loose.data[0]
  const titled = await db.from("npc_encounters").select(cols).ilike("name", `% ${first}%`).limit(1)
  return titled.data?.[0] ?? null
}

/** True once this NPC has learned this character's name. */
export async function npcKnowsName(db: Db, npcName: string, characterId: string): Promise<boolean> {
  if (!npcName || !characterId) return false
  const { data } = await db
    .from("npc_knowledge")
    .select("npc_name")
    .eq("kind", "name")
    .eq("learned_from_character", characterId)
  const want = firstWord(npcName)
  return (data ?? []).some((r: { npc_name: string }) => firstWord(r.npc_name) === want || r.npc_name.toLowerCase() === npcName.toLowerCase())
}

/** Did the player just tell them? Their own name (or its first word) said in their line. */
export function saysOwnName(message: string, characterName: string): boolean {
  const first = characterName.trim().split(/\s+/)[0]
  if (!first || first.length < 2) return false
  const esc = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\b${esc}\\b`, "i").test(message)
}

/** Record that the NPC now knows the name. Once is enough; a repeat does nothing. */
export async function learnName(db: Db, npcName: string, character: { id: string; name: string }): Promise<void> {
  if (await npcKnowsName(db, npcName, character.id)) return
  const { error } = await db.from("npc_knowledge").insert({
    npc_name: npcName,
    kind: "name",
    payload: { name: character.name },
    learned_from_character: character.id,
  })
  if (error) console.error("[acquaintance] could not record a learned name:", error.message)
}

/** The NPC's standing toward the character, in words, from character_relationships. Null = strangers. */
export async function relationshipSummary(db: Db, npcId: string, characterId: string): Promise<string | null> {
  if (!npcId || !characterId) return null
  const { data } = await db
    .from("character_relationships")
    .select(RELATIONSHIP_DIMS.join(", "))
    .eq("subject_id", npcId)
    .eq("object_id", characterId)
    .maybeSingle()
  if (!data) return null
  const parts = RELATIONSHIP_DIMS
    .map((d) => [d, Number((data as Record<string, unknown>)[d] ?? 0)] as const)
    .filter(([, v]) => v !== 0)
    .map(([d, v]) => `${d} ${v > 0 ? "+" : ""}${v}`)
  return parts.length ? parts.join(", ") : null
}
