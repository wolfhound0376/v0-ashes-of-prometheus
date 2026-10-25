// lib/npc-languages.ts — which language an NPC line is spoken in, decided ONCE
// on the server when the line is written, so every seat agrees on what was
// said and only the hearing differs (lib/languages.ts renders it per viewer).
//
// Decision order for one NPC line:
//   1. Malachar tagged it — [NPC_SPEECH: Liana | Elvish] — and the NPC speaks
//      that tongue (or we have no language data for the NPC, so we trust him).
//   2. Otherwise the NPC wants to be understood by whoever it is answering:
//      the first tongue it SPEAKS that the addressee UNDERSTANDS, preferring
//      Common. A drow guard answering Fifi uses Undercommon; answering Kenta
//      it uses Elvish.
//   3. Nothing shared: the NPC falls back to its own first language. This is
//      Liana the surgeon "who speaks only Elvish" to a party with none.
//   4. No language data for the NPC at all: null — the line is never
//      scrambled. The system only hides what it has been told to hide.
//
// Pure functions first, then the Supabase loaders the chat route calls.

import { canonicalLanguage, parseLanguages, understoodLanguages } from "./languages"

export type LangSource = string | readonly string[] | null | undefined

export function chooseLineLanguage(opts: {
  speaker: LangSource
  tagged?: string | null
  addressee?: LangSource
}): string | null {
  const speaks = parseLanguages(opts.speaker).speaks
  const tagged = opts.tagged ? canonicalLanguage(opts.tagged) : null
  if (tagged && (speaks.length === 0 || speaks.includes(tagged))) return tagged
  if (speaks.length === 0) return null
  const hears = understoodLanguages(parseLanguages(opts.addressee))
  const shared = speaks.filter((l) => hears.includes(l))
  if (shared.includes("Common")) return "Common"
  if (shared.length) return shared[0]
  return speaks[0]
}

export type NamedLanguages = { name: string; languages: LangSource }

/**
 * The block Malachar reads: who speaks what, and the tag syntax. Kept short —
 * it rides on every turn.
 */
export function languagePromptBlock(npcs: NamedLanguages[], party: NamedLanguages[]): string {
  const fmt = (r: NamedLanguages) => {
    const p = parseLanguages(r.languages)
    const all = [...p.speaks, ...p.understandsOnly.map((l) => `${l} (understands only)`)]
    return `${r.name}: ${all.length ? all.join(", ") : "unknown"}`
  }
  const known = npcs.filter((n) => parseLanguages(n.languages).speaks.length || parseLanguages(n.languages).understandsOnly.length)
  if (!known.length && !party.length) return ""
  return `LANGUAGES — 5E, ENFORCED BY THE GAME:
- Every NPC line is spoken in ONE language. To choose it, write [NPC_SPEECH: Exact Canonical Name | Language]"words"[/NPC_SPEECH]. Leave the language out and the game picks the tongue the NPC shares with whoever it is answering, or its own first language if they share none.
- A listener who does not know that language sees and hears gibberish. So in your narration NEVER translate, summarise or hint at what was said in a tongue the listener lacks — say only that it was said, how it sounded, and in what language ("she hisses something in Elvish, low and sharp"). Do not have the NPC repeat itself in Common unless it actually speaks Common and would bother.
- Drow speak Elvish among themselves to keep slaves in the dark; they give orders in Undercommon. Use that.
PARTY: ${party.map(fmt).join("; ") || "unknown"}
NPCS IN PLAY: ${known.map(fmt).join("; ") || "none recorded"}`
}

// ---------------------------------------------------------------------------
// Loaders. `supabase` is the route's client (anon or admin — reads only).

/**
 * npc_encounters id → the tongues that NPC speaks: its own `languages` column
 * (the canon override — OotA ch.1, or Sam's ruling), else its bestiary row's.
 *
 * NOT `character_id`: on npc_encounters that points at the PLAYER who met the
 * NPC (Jorlan's points at Gandalf), not at a sheet for the NPC itself.
 *
 * DORMANT until migration npc_encounters_languages adds the column: the
 * bestiary links are wrong for some named NPCs (Eldeth → deep-gnome,
 * Topsy/Turvy → quaggoth), so without the per-NPC override this returns
 * nothing and no line is scrambled, rather than have Eldeth answer in Gnomish.
 */
export async function loadNpcLanguages(supabase: any, npcIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const ids = [...new Set(npcIds.filter(Boolean))]
  if (!ids.length) return out
  const { data: npcs, error } = await supabase.from("npc_encounters").select("*").in("id", ids)
  const rows: any[] = error ? [] : npcs ?? []
  if (!rows.length || !rows.some((r) => "languages" in r)) return out
  const beastIds = rows.map((r) => r.bestiary_id).filter(Boolean)
  const beasts = beastIds.length ? await supabase.from("bestiary").select("id, languages").in("id", beastIds) : { data: [] }
  const beastLang = new Map<string, string | null>((beasts.data ?? []).map((b: any) => [b.id, b.languages ?? null]))
  for (const r of rows) {
    const own = typeof r.languages === "string" && r.languages.trim() ? r.languages.trim() : null
    const fromBeast = r.bestiary_id ? beastLang.get(r.bestiary_id) : null
    out.set(r.id, own || (fromBeast && fromBeast.trim()) || null)
  }
  return out
}

/** Languages of the active NPCs (for the prompt block). */
export async function loadActiveNpcLanguages(supabase: any): Promise<NamedLanguages[]> {
  const { data } = await supabase.from("npc_encounters").select("id, name").eq("is_active", true)
  const rows: any[] = data ?? []
  const langs = await loadNpcLanguages(supabase, rows.map((r) => r.id))
  return rows.map((r) => ({ name: r.name, languages: langs.get(r.id) ?? null }))
}

/** The players' characters and their languages. */
export async function loadPartyLanguages(supabase: any): Promise<(NamedLanguages & { id: string })[]> {
  const { data } = await supabase
    .from("characters")
    .select("id, name, languages, is_player, archived_at")
    .eq("is_player", true)
    .is("archived_at", null)
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name, languages: r.languages ?? null }))
}

/**
 * Stamp `lang` onto each speech segment in place. A segment that arrives
 * already carrying `lang` is Malachar's tag; `tagged` can override by index.
 */
export async function stampSegmentLanguages<T extends { npc_id: string | null; lang?: string | null }>(
  supabase: any,
  segments: T[],
  opts: { addressee?: LangSource; tagged?: (string | null)[] },
): Promise<T[]> {
  if (!segments.length) return segments
  const langs = await loadNpcLanguages(
    supabase,
    segments.map((s) => s.npc_id).filter((x): x is string => !!x),
  )
  segments.forEach((s, i) => {
    if (!s.npc_id) return
    s.lang = chooseLineLanguage({
      speaker: langs.get(s.npc_id) ?? null,
      tagged: opts.tagged?.[i] ?? s.lang ?? null,
      addressee: opts.addressee,
    })
  })
  return segments
}
