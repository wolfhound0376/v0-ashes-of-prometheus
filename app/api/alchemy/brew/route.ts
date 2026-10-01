// The alchemy bench — brewing 2-3 ingredients into a potion.
//
//   POST {characterId, itemSlugs[], check, die, recipeSlug?, base?}
//                                  → brew; consumes, awards, records reveals
//   POST {…, sandbox: true}        → rehearsal: resolve it, write NOTHING
//
// Rules live in lib/alchemy-bench.ts and nothing here second-guesses them.
// This route reads the bench's inputs out of Postgres and writes its
// consequences back.
//
// A PLAYER VERB, fenced exactly the way /api/alchemy/taste and
// /api/ground-items are fenced: not DM-gated, but it must name its own
// character and that character must exist. Per AGENTS.md §5 the characterId
// comes from the caller and is never read off sessions.active_character_id —
// that is the "one global seat" bug, and here it would brew out of one
// player's pack and teach another player the result.
//
// THE DICE ARE NOT ROLLED HERE. The board owns them
// (components/dice/dice-provider) and Malachar narrates the exact total and
// never re-rolls it. The caller sends both the TOTAL (`check`) and the raw
// FACE (`die`), because a natural 1 is absolute failure and no total can
// tell you whether the die showed a 1.
//
// WHAT IS DELIBERATELY NOT HERE:
//   * (Runes are wired as of 2026-10-01: gate in lib/alchemy-runes.ts.)
//   * The camp action budget. lib/camp.ts already knows `brew` spends an
//     action; nothing wires it to this route yet.
//
// Service role, because character_known_effects and inventory_items are
// public-read with no anon write policy by design.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { benchProficient } from "@/lib/alchemy-pack"
import { isPrep } from "@/lib/extraction"
import { canInscribe, isRuneSchool, RUNE_MATERIALS, type KnownRune } from "@/lib/alchemy-runes"
import { catalogRow, plainHeld, takeOne, type PackRow } from "@/lib/alchemy-pack-ops"
import {
  brewAtBench, MIN_INGREDIENTS, MAX_INGREDIENTS,
  type BenchIngredient, type BaseLiquid, type RecipeReliability, type RuneSchool,
} from "@/lib/alchemy-bench"

export const dynamic = "force-dynamic"

type Db = ReturnType<typeof createAdminClient>

/** The catalogue row every brewed potion is an instance of. A brew is an
 *  unlabelled flask of something the brewer made; WHAT it does lives in
 *  inventory_items.brew, not in a new catalogue row per effect. Nothing is
 *  invented: if this row is missing the route refuses rather than minting an
 *  item the catalogue has never heard of.
 *
 *  That row is deliberately `stackable = false`, and it is the only reason
 *  two brews cannot silently become one. This route inserts its own rows and
 *  never stacks, but /api/ground-items DOES stack by name on pickup when the
 *  catalogue row allows it — so a tier III clean brew dropped beside a tier I
 *  corrupt one would merge into a single row and one of the two `brew` blobs
 *  would simply be gone. */
const BREW_ITEM_SLUG = "brewed-potion"

const ROMAN = ["", "I", "II", "III"]

/** The board's log is the dialogue feed; the HUD is already subscribed. */
async function narrate(db: Db, text: string) {
  await db.from("dialogue").insert({ speaker: "Malachar", text, channel: "dm" })
}

export async function POST(req: NextRequest) {
  let body: {
    characterId?: string
    itemSlugs?: unknown
    check?: number
    die?: number
    recipeSlug?: string
    base?: BaseLiquid
    rune?: string
    sandbox?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }

  const { characterId } = body
  const sandbox = body.sandbox === true
  const check = Number(body.check)
  const die = Number(body.die)
  const slugs = Array.isArray(body.itemSlugs) ? body.itemSlugs.filter((s): s is string => typeof s === "string") : []

  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })
  if (slugs.length < MIN_INGREDIENTS || slugs.length > MAX_INGREDIENTS) {
    return NextResponse.json(
      { error: `itemSlugs must name ${MIN_INGREDIENTS}-${MAX_INGREDIENTS} ingredients` },
      { status: 400 },
    )
  }
  if (!Number.isFinite(check) || !Number.isFinite(die)) {
    return NextResponse.json(
      { error: "check must be the d20 total you rolled, and die the face it showed" },
      { status: 400 },
    )
  }
  if (body.rune !== undefined && body.rune !== null && !isRuneSchool(body.rune)) {
    return NextResponse.json({ error: "rune must be one of the eight schools" }, { status: 400 })
  }
  const rune: RuneSchool | null = isRuneSchool(body.rune) ? body.rune : null

  const BASES: BaseLiquid[] = ["water", "blessed-water", "holy-water"]
  if (body.base !== undefined && !BASES.includes(body.base)) {
    // An unknown string made the impurity cap undefined and the result NaN.
    return NextResponse.json({ error: `base must be one of ${BASES.join(", ")}` }, { status: 400 })
  }

  const db = createAdminClient()

  // Never .single() on a query that might match zero rows — AGENTS.md §8.
  const { data: character } = await db
    .from("characters")
    .select("id, name, class, sheet_proficiencies, sheet_skill_proficiencies")
    .eq("id", characterId)
    .maybeSingle()
  if (!character) return NextResponse.json({ error: "no such character" }, { status: 404 })

  const { data: itemRows } = await db
    .from("items")
    .select("id, slug, name, alchemy_effects")
    .in("slug", slugs)
  const byslug = new Map((itemRows ?? []).map((r) => [r.slug as string, r]))

  const missing = slugs.filter((s) => !byslug.has(s))
  if (missing.length > 0) {
    return NextResponse.json({ error: `the catalogue has no ${missing.join(", ")}` }, { status: 404 })
  }

  // The pack, by catalogue link where the row has one and by name where it
  // does not — the same resolution /api/ground-items uses for drops.
  const { data: packRows } = await db
    .from("inventory_items")
    .select("id, name, quantity, item_id, prep")
    .eq("character_id", characterId)
  const pack = packRows ?? []
  // Only PREPARED ingredients go into a brew (extraction, Sam 2026-10-01).
  // Clean ones are used before bruised ones, so a brewer who has a good one
  // never pays for a bad one. Raw rows are counted only to say "prepare it".
  const matches = (p: (typeof pack)[number], itemId: string, name: string) =>
    p.item_id ? p.item_id === itemId : p.name === name
  const holdingOf = (itemId: string, name: string) =>
    pack
      .filter((p) => matches(p, itemId, name) && isPrep(p.prep))
      .sort((a, b) => Number(isPrep(a.prep) && a.prep.bruised) - Number(isPrep(b.prep) && b.prep.bruised))
  const rawOf = (itemId: string, name: string) =>
    pack.filter((p) => matches(p, itemId, name) && !p.prep).reduce((n, p) => n + (p.quantity ?? 1), 0)

  const { data: knownRows } = await db
    .from("character_known_effects")
    .select("item_slug, column_index")
    .eq("character_id", characterId)
    .in("item_slug", slugs)

  let recipe: { slug: string; reliability: RecipeReliability } | null = null
  if (body.recipeSlug) {
    const { data: r } = await db
      .from("items").select("slug, name, properties").eq("slug", body.recipeSlug).maybeSingle()
    if (!r) return NextResponse.json({ error: "no such recipe" }, { status: 404 })
    const known = await db
      .from("character_known_recipes")
      .select("recipe_slug")
      .eq("character_id", characterId)
      .eq("recipe_slug", body.recipeSlug)
      .maybeSingle()
    if (!known.data) {
      return NextResponse.json({ error: "this character has not learned that recipe" }, { status: 403 })
    }
    const rel = (r.properties as { reliability?: string } | null)?.reliability
    // An unmarked recipe is an honest one. A `drifted` or `sabotaged` value
    // is NEVER echoed back in the response — the brewer finds out later, in
    // the dark, which is the entire point of the Poisoned Cookbook.
    recipe = {
      slug: r.slug as string,
      reliability: rel === "drifted" || rel === "sabotaged" ? rel : "true",
    }
  }

  const unprepared = slugs.filter((slug) => {
    const row = byslug.get(slug)!
    return holdingOf(row.id as string, row.name as string).length === 0 && rawOf(row.id as string, row.name as string) > 0
  })
  if (unprepared.length > 0) {
    const names = unprepared.map((s) => byslug.get(s)!.name as string)
    return NextResponse.json(
      { error: `prepare it first: ${names.join(", ")}`, reason: "not_prepared", detail: unprepared },
      { status: 422 },
    )
  }

  // A blessed or holy base must actually be in the pack, and it is used up
  // with the ingredients whatever the outcome. Before 2026-10-01 the route
  // took the base on the caller's word and never consumed it.
  let baseRow: PackRow | null = null
  if (body.base && body.base !== "water") {
    const item = await catalogRow(db, body.base)
    const held = item ? await plainHeld(db, characterId, item) : []
    if (held.length === 0) {
      return NextResponse.json(
        { error: `no ${item?.name ?? body.base} in this pack to brew on`, reason: "no_base" },
        { status: 422 },
      )
    }
    baseRow = held[0]
  }

  // A rune: the mark must be known, the brewer arcane (or trained in Arcana
  // with a TAUGHT mark), and one rune material in the pack. One rune, one
  // material, used up whatever the outcome — a natural 1 takes the rune too.
  let runeMaterial: PackRow | null = null
  if (rune) {
    const { data: marks } = await db
      .from("character_known_runes").select("school, learned_via").eq("character_id", characterId)
    const mats: PackRow[] = []
    for (const slug of RUNE_MATERIALS) {
      const item = await catalogRow(db, slug)
      if (item) mats.push(...(await plainHeld(db, characterId, item)))
    }
    const gate = canInscribe(
      character as { name: string; class?: string | null; sheet_skill_proficiencies?: unknown },
      (marks ?? []) as KnownRune[],
      rune,
      mats.reduce((n, r) => n + (r.quantity ?? 1), 0),
    )
    if (!gate.ok) return NextResponse.json({ error: gate.reason, reason: "cannot_inscribe" }, { status: 422 })
    runeMaterial = mats[0]
  }

  const ingredients: BenchIngredient[] = slugs.map((slug) => {
    const row = byslug.get(slug)!
    const held = holdingOf(row.id as string, row.name as string)
    const first = held.find((p) => (p.quantity ?? 1) > 0)
    return {
      bruised: Boolean(first && isPrep(first.prep) && first.prep.bruised),
      slug,
      name: row.name as string,
      grid: row.alchemy_effects,
      knownColumns: (knownRows ?? [])
        .filter((k) => k.item_slug === slug)
        .map((k) => k.column_index as number),
      have: held.reduce((n, p) => n + (p.quantity ?? 1), 0),
    }
  })

  const result = brewAtBench({
    ingredients,
    check,
    die,
    proficient: benchProficient(character.sheet_proficiencies),
    recipe,
    base: body.base,
    rune,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.reason, detail: result.detail ?? null }, { status: 422 })
  }

  // The product row must exist before anything is consumed, or a brew could
  // eat three ingredients and have nowhere to put the potion.
  const { data: product } = await db
    .from("items")
    .select("id, slug, name, description, icon_url, pixel_icon_url, item_type, weight, value")
    .eq("slug", BREW_ITEM_SLUG)
    .maybeSingle()
  if (result.outcome === "potion" && !product && !sandbox) {
    return NextResponse.json(
      {
        error: `the catalogue has no '${BREW_ITEM_SLUG}' row, so there is nothing to pour the brew into`,
        reason: "no_product_row",
      },
      { status: 503 },
    )
  }

  const effectNames = new Map<string, string>()
  if (result.effects.length > 0) {
    const { data: effs } = await db
      .from("alchemy_effects").select("slug, name, summary, is_harmful").in("slug", result.effects)
    for (const e of effs ?? []) effectNames.set(e.slug as string, e.name as string)
  }

  const label =
    result.effects.map((e) => effectNames.get(e) ?? e).join(" / ") +
    ` (${ROMAN[result.potency]})`

  // Rehearsal stops here: everything above is a read, everything below writes.
  if (!sandbox) {
    // The potion goes in FIRST. If the insert is refused, nothing has been
    // consumed yet and the brewer keeps their ingredients. The other order
    // ate three ingredients and then failed the CHECK constraint on every
    // brew ever attempted (fixed 2026-10-01: the constraint wanted `effect`,
    // this writes `effects`).
    if (result.outcome === "potion" && product) {
      const { error } = await db.from("inventory_items").insert({
        character_id: characterId,
        name: `Brew — ${label}`,
        quantity: 1,
        description: product.description,
        item_type: product.item_type,
        icon_url: product.icon_url,
        item_id: product.id,
        weight: product.weight,
        value: product.value,
        // The instance data. Two potions off the same pair can differ.
        brew: {
          effects: result.effects,
          potency: result.potency,
          impurity: result.impurity,
          rune,
          base: body.base ?? "water",
          recipe: recipe?.slug ?? null,
          brewed_by: characterId,
          brewed_at: new Date().toISOString(),
        },
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // One of each, every outcome — a failed brew costs the same as a good one.
    for (const slug of result.consumed) {
      const row = byslug.get(slug)!
      const held = holdingOf(row.id as string, row.name as string)
      const from = held.find((p) => (p.quantity ?? 1) > 0)
      if (!from) continue
      const left = (from.quantity ?? 1) - 1
      if (left <= 0) await db.from("inventory_items").delete().eq("id", from.id)
      else await db.from("inventory_items").update({ quantity: left }).eq("id", from.id)
    }

    if (runeMaterial) {
      const err = await takeOne(db, runeMaterial)
      if (err) return NextResponse.json({ error: err }, { status: 500 })
    }

    if (baseRow) {
      const err = await takeOne(db, baseRow)
      if (err) return NextResponse.json({ error: err }, { status: 500 })
    }

    if (result.revealed.length > 0) {
      // on conflict do nothing: two brews landing together must not 409.
      const { error } = await db.from("character_known_effects").upsert(
        result.revealed.map((r) => ({
          character_id: characterId,
          item_slug: r.itemSlug,
          column_index: r.column,
          learned_via: "brew",
        })),
        { onConflict: "character_id,item_slug,column_index", ignoreDuplicates: true },
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const line =
      result.outcome === "critical_failure"
        ? `${character.name} reaches for the flask. ${result.summary} [CINEMATIC: ${result.critical!.cue}]`
        : result.outcome === "inert"
          ? `${character.name} works the bench. ${result.summary}`
          : `${character.name} brews ${label}. ${result.summary}`
    await narrate(db, line)
  }

  return NextResponse.json({
    sandbox,
    character: character.name,
    outcome: result.outcome,
    consumed: result.consumed,
    effects: result.effects.map((slug) => ({ slug, name: effectNames.get(slug) ?? slug })),
    label: result.outcome === "potion" ? label : null,
    potency: result.potency,
    impurity: result.impurity,
    // The reasons are for the DM. A sabotaged recipe's line would name the
    // liar, so the player-facing client must not render this list.
    impurityReasons: result.impurityReasons,
    learned: result.revealed,
    critical: result.critical,
    dc: result.dc,
    beat: result.beat,
    summary: result.summary,
  })
}
