// Handing a page to someone.
//
// Sam (2026-09-29): "When an entry is highlighted clicking it gives the option
// to share it to some one."
//
//   GET  ?characterId=…        → who this character can hand a page to
//   POST {entryId, to}         → hand it over
//
// The rules live in lib/journal-share and are tested there; this route is the
// database half and nothing else. It exists because sharing writes rows the
// browser is not allowed to write: journal_entries admits an anon INSERT only
// as author='player', and a shared copy is author='import'. Per the standing
// rule, write access is never granted by widening a policy — it comes through
// a service-role route, which is this one.
//
// WHAT A SHARE ACTUALLY DOES, in one transaction's worth of writes:
//   1. a COPY of the page into the recipient's own journal (author 'import'),
//      or an npc_knowledge row when the reader is not a player;
//   2. the unlock, if the reader passes that section's gate;
//   3. the original's visibility moved outward — 'party' for a player,
//      'found' for an NPC, which is terminal and which the owner is never
//      told about.
//
// There is no UPDATE policy on journal_entries and that is deliberate, so the
// visibility move is the one write here that only a service role can make.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { shareEntry, shareTargets, type ShareSource, type ShareTarget } from "@/lib/journal-share"
import { isJournalSection, type JournalSection } from "@/lib/journal-sections"
import { isJournalVisibility } from "@/lib/journal"

export const dynamic = "force-dynamic"

/** Who is in the party, and who is standing in the scene to hand a page to. */
export async function GET(request: NextRequest) {
  const characterId = request.nextUrl.searchParams.get("characterId")
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })

  try {
    const db = createAdminClient()

    const [{ data: party }, { data: npcs }] = await Promise.all([
      db.from("characters").select("id, name, class, skills, sheet_proficiencies, sheet_spellcasting").eq("is_player", true).is("archived_at", null),
      db.from("npc_encounters").select("name").eq("is_active", true),
    ])

    const partyTargets: ShareTarget[] = (party ?? [])
      .filter((c) => c.id !== characterId)
      .map((c) => ({
        kind: "character",
        id: c.id,
        name: c.name,
        sheet: sheetOf(c),
      }))

    // NPC canon is keyed by NAME across every row (AGENTS.md §8), so the same
    // creature appearing twice must not offer itself twice.
    const seen = new Set<string>()
    const npcTargets: ShareTarget[] = (npcs ?? [])
      .map((n) => String(n.name ?? "").trim())
      .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))
      .map((name) => ({ kind: "npc", id: name, name }))

    return NextResponse.json({ party: partyTargets, present: npcTargets })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      entryId?: string
      to?: { kind?: string; id?: string; name?: string }
    }
    if (!body.entryId || !body.to?.id || !body.to?.name) {
      return NextResponse.json({ error: "entryId and to.{id,name} required" }, { status: 400 })
    }
    const kind = body.to.kind === "npc" ? "npc" : "character"

    const db = createAdminClient()

    const { data: row, error: readErr } = await db
      .from("journal_entries")
      .select("id, character_id, section, title, body, visibility, tags")
      .eq("id", body.entryId)
      .maybeSingle()
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: "no such page" }, { status: 404 })

    // Trust the table, not the caller: the section and visibility come off the
    // stored row, and an unrecognised value is a refusal rather than a guess.
    if (!isJournalSection(row.section) || !isJournalVisibility(row.visibility)) {
      return NextResponse.json({ error: "this page is stored in a shape this route does not recognise" }, { status: 409 })
    }

    let sheet: ShareTarget["sheet"]
    let fromName: string | null = null
    if (kind === "character") {
      const { data: reader } = await db
        .from("characters")
        .select("id, name, class, skills, sheet_proficiencies, sheet_spellcasting")
        .eq("id", body.to.id)
        .maybeSingle()
      if (!reader) return NextResponse.json({ error: "no such character" }, { status: 404 })
      sheet = sheetOf(reader)
    }
    const { data: owner } = await db.from("characters").select("name").eq("id", row.character_id).maybeSingle()
    fromName = owner?.name ?? null

    const entry: ShareSource = {
      id: row.id,
      characterId: row.character_id,
      section: row.section as JournalSection,
      title: row.title,
      body: row.body,
      visibility: row.visibility,
      tags: (row.tags ?? null) as Record<string, unknown> | null,
    }

    const outcome = shareEntry({
      entry,
      to: { kind, id: body.to.id, name: body.to.name, sheet },
      fromName,
    })
    if (!outcome.ok) return NextResponse.json({ ok: false, note: outcome.note }, { status: 409 })

    // The copy, or the NPC's memory of it.
    let copyId: string | null = null
    if (outcome.copy) {
      const { data: inserted, error } = await db.from("journal_entries").insert(outcome.copy).select("id").single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      copyId = inserted?.id ?? null
    }
    if (outcome.npc) {
      const { error } = await db.from("npc_knowledge").insert(outcome.npc)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // The unlock. Best-effort and reported: a share that granted the words but
    // not the capability must not read as a clean success.
    const unlockWarnings: string[] = []
    if (outcome.learns && outcome.copy && outcome.unlock === "recipe") {
      const slug = String((entry.tags as Record<string, unknown> | null)?.recipeSlug ?? "").trim()
      if (!slug) unlockWarnings.push("no recipeSlug on the page, so nothing was unlocked at the bench")
      else {
        const { error } = await db.from("character_known_recipes").upsert(
          { character_id: outcome.copy.character_id, recipe_slug: slug, learned_via: "shared", journal_id: copyId },
          { onConflict: "character_id,recipe_slug" },
        )
        if (error) unlockWarnings.push(`recipe not unlocked: ${error.message}`)
      }
    }

    // The original moves outward. Only a service role can do this — there is
    // no UPDATE policy on the table, on purpose.
    if (outcome.visibility !== entry.visibility) {
      const { error } = await db.from("journal_entries").update({ visibility: outcome.visibility }).eq("id", entry.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      note: outcome.note,
      learns: outcome.learns,
      unlock: outcome.unlock,
      visibility: outcome.visibility,
      copyId,
      flags: [...outcome.flags, ...unlockWarnings],
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

/** The slice of a character row the section gates read. */
function sheetOf(c: Record<string, unknown>): ShareTarget["sheet"] {
  const profs = (c.sheet_proficiencies ?? {}) as Record<string, unknown>
  const tools = Array.isArray(profs.tools)
    ? (profs.tools as unknown[]).map(String)
    : typeof profs.tools === "string"
      ? String(profs.tools).split(/[,;]/).map((t) => t.trim())
      : []
  const casting = (c.sheet_spellcasting ?? {}) as Record<string, unknown>
  const klass = String(c.class ?? "")
  // Divine is not arcane — the alchemy spec's ruling, applied here so a cleric
  // with spell slots does not read as a rune-capable caster.
  const arcaneCaster =
    /\b(wizard|sorcerer|warlock|bard|artificer)\b/i.test(klass) &&
    Boolean(casting && Object.keys(casting).length)
  return { class: klass, skills: (c.skills ?? {}) as Record<string, unknown>, tools, arcaneCaster }
}
