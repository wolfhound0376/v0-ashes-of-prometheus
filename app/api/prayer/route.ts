// PRAY — the camp action, resolved against a rule instead of improvised.
//
// The PRAY button has existed on the camp screen since 2026-09-26. Until now
// `CAMP_ACTION_RULES.pray` resolved to `dmScene()` — "no rule; the DM answers
// or does not" — so every press handed Malachar a blank page and let him decide
// what a god does. This route is the other end of that button.
//
//   POST { characterId, petition, posture, offering?, deitySlug?, sandbox? }
//     → resolves the prayer, writes it down, moves the hidden ledger, and
//       returns the narration contract Malachar must stay inside.
//
// WHAT THIS ROUTE DECIDES: nothing. `lib/camp-prayer` + `lib/prayer` decide;
// this moves rows. The one judgement here is refusing to invent a deity.
//
// SERVICE ROLE IS REQUIRED, not a convenience: `character_faith` and
// `faith_events` have RLS on with NO select policy by design — they are the
// hidden ledger. An anon read of them returns zero rows and no error, which is
// the same silent shape as the scene_effects blackout. Everything here goes
// through createAdminClient for that reason.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { prayAtCamp, faithPatchAfter, type FaithRow } from "@/lib/camp-prayer"
import type { Deity, Offering, Posture } from "@/lib/prayer"

type Db = ReturnType<typeof createAdminClient>

const POSTURES: Posture[] = ["aloud", "murmured", "silent"]

/** The campaign clock, or null when no clock is running. */
async function readClock(db: Db): Promise<{ day: number; minutes: number } | null> {
  const { data } = await db
    .from("game_clock").select("game_day, minutes_of_day")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle()
  if (!data) return null
  const day = Number(data.game_day), minutes = Number(data.minutes_of_day)
  return Number.isFinite(day) && Number.isFinite(minutes) ? { day, minutes } : null
}

/**
 * The faith this character is praying through. A deity named in the request is
 * honoured only if it EXISTS in `deities` — the catalogue rule from AGENTS.md
 * applied to gods. An unknown slug is not quietly created; the prayer goes up
 * addressed to nobody, which the rules already handle (a worse table, cap 2).
 */
async function resolveDeity(db: Db, slug: string | null): Promise<Deity | null> {
  if (!slug) return null
  const { data } = await db
    .from("deities").select("slug, name, reach, is_hostile_to, portfolio")
    .eq("slug", slug).maybeSingle()
  if (!data) return null
  return {
    slug: data.slug,
    name: data.name,
    reach: data.reach ?? undefined,
    enemies: Array.isArray(data.is_hostile_to) ? (data.is_hostile_to as string[]) : undefined,
    portfolio: typeof data.portfolio === "string"
      ? data.portfolio.split(",").map((s: string) => s.trim()).filter(Boolean)
      : undefined,
  }
}

export async function POST(req: NextRequest) {
  let db: Db
  try {
    db = createAdminClient()
  } catch {
    return NextResponse.json({ error: "server is not configured for writes" }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.characterId || typeof body.petition !== "string") {
    return NextResponse.json({ error: "characterId and petition are required" }, { status: 400 })
  }
  const posture: Posture = POSTURES.includes(body.posture) ? body.posture : "silent"

  const { data: character } = await db
    .from("characters").select("id, name, class, level, rest_actions_remaining")
    .eq("id", body.characterId).maybeSingle()
  if (!character) return NextResponse.json({ error: "no such character" }, { status: 404 })

  // The faith row carries the hidden ledger AND which god this character holds
  // to. A deity named in the request only overrides it if that deity exists.
  const { data: faithRow } = await db
    .from("character_faith")
    .select("deity_slug, attention, accord, debt, vows, last_prayer_day, is_primary")
    .eq("character_id", character.id)
    .order("is_primary", { ascending: false })
    .limit(1).maybeSingle()

  const faith = (faithRow as FaithRow | null) ?? null
  const deity = await resolveDeity(db, body.deitySlug ?? faith?.deity_slug ?? null)

  const clock = await readClock(db)

  // Where they are, for the wrong listener and for Lathander's reach.
  // The party's position is `party_position` -> `travel_nodes`; travel_nodes has
  // no is_current column (checked, 2026-10-08 — an earlier draft of this route
  // assumed one and would have thrown at runtime).
  const { data: pos } = await db
    .from("party_position").select("node_id").limit(1).maybeSingle()
  const { data: node } = pos?.node_id
    ? await db.from("travel_nodes").select("name, metadata").eq("id", pos.node_id).maybeSingle()
    : { data: null as { name: string; metadata: unknown } | null }
  const meta = (node?.metadata ?? {}) as Record<string, unknown>
  // A hostile local faith is a property of the NODE, declared in its metadata.
  // No key means nobody hostile is listening, and the wrong listener never
  // rolls — never guessed from the location's name.
  const locationFaith = await resolveDeity(db, (meta.location_faith as string) ?? null)

  const offering: Offering = body.offering?.kind
    ? { kind: body.offering.kind, verified: false, note: body.offering.note }
    : { kind: "none", verified: true }

  // An offering is only worth something once it has been checked against what
  // the character actually carries. A promise is worth nothing (lib/prayer).
  if (offering.kind !== "none" && body.offering?.inventoryItemId) {
    const { data: item } = await db
      .from("inventory_items").select("id")
      .eq("id", body.offering.inventoryItemId)
      .eq("character_id", character.id).maybeSingle()
    offering.verified = !!item
  }

  const decision = prayAtCamp(
    {
      character: { id: character.id, name: character.name, class: character.class, level: character.level },
      faith,
      deity,
      petition: body.petition,
      posture,
      offering,
      context: {
        locationFaith,
        // This campaign is the Underdark: sunless unless a node says otherwise.
        sunless: meta.sunless !== false,
        minutesOfDay: clock?.minutes ?? undefined,
        gravity: typeof body.gravity === "number" ? body.gravity : undefined,
        confined: meta.confined === true,
      },
      gameDay: clock?.day ?? 0,
      actionsRemaining: character.rest_actions_remaining,
    },
    Math.random,
  )

  if (!decision.ok || !decision.result) {
    return NextResponse.json({ ok: false, note: decision.note, remaining: decision.remaining }, { status: 200 })
  }

  const result = decision.result
  const standing = faith
    ? { attention: faith.attention, accord: faith.accord, debt: faith.debt, vows: faith.vows }
    : { attention: 0, accord: 0, debt: 0 }
  const patch = faithPatchAfter(standing, result, clock?.day ?? 0)

  // The log. Written whatever the tier — a silence is a prayer that happened.
  await db.from("prayers").insert({
    character_id: character.id,
    deity_slug: deity?.slug ?? null,
    game_day: clock?.day ?? null,
    minutes_of_day: clock?.minutes ?? null,
    location: node?.name ?? null,
    posture,
    petition: body.petition,
    offering: { ...offering },
    standing: { ...standing, observance: decision.observance },
    response_number: result.responseNumber,
    roll: result.roll,
    tier: result.tier,
    gravity: typeof body.gravity === "number" ? body.gravity : null,
    overheard_by: result.overheard ? (locationFaith?.name ?? "the place itself") : null,
  })

  if (deity) {
    await db.from("character_faith").upsert(
      {
        character_id: character.id,
        deity_slug: deity.slug,
        attention: patch.attention,
        accord: standing.accord,
        debt: patch.debt,
        last_prayer_day: patch.last_prayer_day,
        state: patch.state,
        last_reason: `prayed: ${result.tierName}`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "character_id,deity_slug" },
    )

    await db.from("faith_events").insert({
      character_id: character.id,
      deity_slug: deity.slug,
      kind: `prayer:${result.tierName.replace(/\s+/g, "_")}`,
      gravity: typeof body.gravity === "number" ? body.gravity : null,
      deltas: { attention: patch.attention - standing.attention, accord: 0, debt: result.debtDelta },
      note: decision.note,
      source: "camp:pray",
    })
  }

  // Spend the camp action. A silence costs one too — see lib/camp-prayer.
  await db.from("characters")
    .update({ rest_actions_remaining: decision.remaining })
    .eq("id", character.id)

  // Only an audible prayer reaches the party log (Sam, 2026-10-01).
  if (decision.visibility === "party") {
    await db.from("dialogue").insert({
      speaker: character.name,
      speaker_type: "player",
      text: `*prays aloud${deity ? ` to ${deity.name}` : ""}* — ${body.petition}`,
      channel: "dm",
    })
  }

  return NextResponse.json({
    ok: true,
    tier: result.tier,
    tierName: result.tierName,
    visibility: decision.visibility,
    observance: decision.observance,
    standing: decision.standing,
    remaining: decision.remaining,
    overheard: result.overheard,
    // Malachar's brief. He writes the words; he does not decide the outcome.
    narration: decision.narration,
    note: decision.note,
  })
}
