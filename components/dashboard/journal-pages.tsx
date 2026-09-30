"use client"

// Personal journal pages, backed by public.journal_entries.
//
// RLS contract: anon may SELECT anything and INSERT only author='player'.
// There are no UPDATE/DELETE policies — a page, once committed, is permanent
// from the browser. Do not add a delete button here; it would silently no-op.
// Sharing therefore goes through /api/journal/share, which holds the service
// role, because a shared copy is author='import' and the original's visibility
// has to move.
//
// Sam's rulings, 2026-09-29:
//   - Thirteen sections; the tabs below are the ones with pages in them, plus
//     Pages, which is always offered because it is where writing goes.
//   - "When an entry is highlighted clicking it gives the option to share it to
//     some one." So an entry selects on click and the share menu opens from the
//     selection, rather than every row carrying a button nobody uses.
//   - The owner is NOT told when somebody has read their journal — they find
//     out by looking. So a read page is marked quietly, in the margin, with no
//     count anywhere else and no banner.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Feather, Share2, Eye } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import {
  SECTION_LABEL,
  isJournalSection,
  type JournalSection,
} from "@/lib/journal-sections"
import { isShareable, shareWarning, type ShareTarget } from "@/lib/journal-share"

interface JournalEntry {
  id: string
  title: string | null
  in_world_date: string | null
  body: string
  author: "player" | "malachar" | "import" | "forged"
  section: string
  tags: Record<string, unknown> | null
  visibility: string
  created_at: string
}

/** Tab order. Pages first because it is the default; the rest as the book reads. */
const TAB_ORDER: JournalSection[] = [
  "pages", "quests", "recipes", "alchemy", "poisoner", "spirits",
  "arcane", "maps", "clues", "songs", "lore", "witness", "autopsy",
]

export function JournalPages({
  characterId,
  initialSection = "pages",
}: {
  characterId: string | null
  /** Which tab the book opens on. The Quests and Lore pages of the campaign
   *  book are the same journal, opened at a different tab. */
  initialSection?: JournalSection
}) {
  const supabase = useMemo(() => createClient(), [])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [tab, setTab] = useState<JournalSection>(initialSection)
  const [selected, setSelected] = useState<string | null>(null)
  const [targets, setTargets] = useState<{ party: ShareTarget[]; present: ShareTarget[] } | null>(null)
  const [sharing, setSharing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!characterId) return
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, title, in_world_date, body, author, section, tags, visibility, created_at")
      .eq("character_id", characterId)
      .order("created_at", { ascending: true })
    if (!error && data) setEntries(data as JournalEntry[])
  }, [characterId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setTab(initialSection)
    setSelected(null)
  }, [initialSection])

  // Only fetched when a share menu is actually opened — the party list is not
  // needed to read the book.
  const loadTargets = useCallback(async () => {
    if (!characterId || targets) return
    try {
      const res = await fetch(`/api/journal/share?characterId=${encodeURIComponent(characterId)}`)
      const json = await res.json()
      if (res.ok) setTargets({ party: json.party ?? [], present: json.present ?? [] })
    } catch {
      /* the menu simply will not open; the book still reads */
    }
  }, [characterId, targets])

  const commit = useCallback(async () => {
    const body = draft.trim()
    if (!body || !characterId || saving) return
    setSaving(true)
    setStatus(null)
    const { data, error } = await supabase
      .from("journal_entries")
      .insert({ character_id: characterId, body, author: "player", visibility: "private", section: "pages" })
      .select("id")
    // Silent-failure guard: verify a row actually came back before trusting
    // the write — an RLS mismatch can otherwise pass unnoticed.
    if (error || !data || data.length === 0) {
      setStatus("The page would not take. Nothing was written.")
    } else {
      setDraft("")
      setTab("pages")
      await load()
    }
    setSaving(false)
  }, [draft, characterId, saving, supabase, load])

  const share = useCallback(
    async (entryId: string, to: ShareTarget) => {
      setSharing(true)
      setStatus(null)
      try {
        const res = await fetch("/api/journal/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryId, to: { kind: to.kind, id: to.id, name: to.name } }),
        })
        const json = await res.json()
        setStatus(res.ok ? json.note : json.error || json.note || "It would not go.")
        if (res.ok) {
          setSelected(null)
          await load()
        }
      } catch {
        setStatus("It would not go.")
      }
      setSharing(false)
    },
    [load],
  )

  if (!characterId) {
    return <p className="text-center font-serif italic text-[#775435]">No character is seated in this browser.</p>
  }

  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e.section, (counts.get(e.section) ?? 0) + 1)
  // EVERY section, always. The first cut of this showed only sections that
  // held something, reasoning that an empty book should not be a wall of empty
  // drawers. That was wrong, and it made the whole feature invisible: with no
  // entries yet, the strip rendered a single "Pages" tab and the panel looked
  // exactly as it had before any of this was built. The sections ARE the
  // feature — a player should be able to see that the book has a Recipes page
  // before they have a recipe to put in it. Empty ones are dimmed, not hidden.
  const tabs = TAB_ORDER
  const shown = entries.filter((e) => e.section === tab)
  const selectedEntry = shown.find((e) => e.id === selected) ?? null
  const menu = targets ? [...targets.party, ...targets.present] : []

  return (
    <div className="flex h-full flex-col">
      {/* Section tabs. Only sections that hold something, so an empty book is
          not a wall of empty drawers. */}
      <div className="mb-2 flex flex-wrap gap-1 border-b border-[#92704a]/40 pb-2">
        {tabs.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setTab(s)
              setSelected(null)
            }}
            className={`rounded-sm px-2 py-0.5 font-serif text-[10px] uppercase tracking-[.14em] transition ${
              tab === s
                ? "bg-[#73451f]/15 text-[#3d2415]"
                : (counts.get(s) ?? 0) > 0
                  ? "text-[#8a6a45] hover:text-[#5c3e28]"
                  : "text-[#b09a7d]/70 hover:text-[#8a6a45]"
            }`}
          >
            {SECTION_LABEL[s]}
            {counts.get(s) ? <span className="ml-1 text-[#a07b4e]">{counts.get(s)}</span> : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {shown.length === 0 && (
          <p className="text-center font-serif italic text-[#775435]">
            {tab === "pages" ? "This journal has no recorded pages yet." : `Nothing under ${SECTION_LABEL[tab]} yet.`}
          </p>
        )}
        {shown.map((entry) => {
          const isSelected = entry.id === selected
          const wasRead = entry.visibility === "found"
          return (
            <article
              key={entry.id}
              onClick={() => {
                const next = isSelected ? null : entry.id
                setSelected(next)
                if (next) void loadTargets()
              }}
              className={`cursor-pointer rounded-sm border-b border-dotted border-[#8c6844]/55 px-2 py-2 transition ${
                isSelected ? "bg-[#73451f]/10 ring-1 ring-[#8c6844]/60" : "hover:bg-[#73451f]/5"
              }`}
            >
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[.2em] text-[#83582e]">
                {entry.in_world_date ??
                  new Date(entry.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                {entry.author === "malachar" && <span>· in another hand</span>}
                {entry.author === "import" && <span>· transcribed</span>}
                {/* Quiet. The owner finds out by looking, never by being told. */}
                {wasRead && (
                  <span className="ml-auto flex items-center gap-1 text-[#8a5a2e]" title="Someone else has read this page.">
                    <Eye className="h-3 w-3" />
                  </span>
                )}
              </p>
              {entry.title && <h4 className="mt-1 font-serif text-[#3d2415]">{entry.title}</h4>}
              <p className="mt-1 whitespace-pre-wrap font-serif text-sm italic leading-relaxed text-[#4e3422]">{entry.body}</p>

              {isSelected && (
                <div className="mt-3 border-t border-[#92704a]/40 pt-2" onClick={(e) => e.stopPropagation()}>
                  {!isShareable(entry.section as JournalSection) ? (
                    <p className="text-[11px] italic text-[#8a5a2e]">
                      {SECTION_LABEL[entry.section as JournalSection]} pages are not handed around.
                    </p>
                  ) : menu.length === 0 ? (
                    <p className="text-[11px] italic text-[#8a5a2e]">Nobody here to show it to.</p>
                  ) : (
                    <>
                      <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-[.16em] text-[#83582e]">
                        <Share2 className="h-3 w-3" /> Show this page to
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {menu.map((t) => {
                          const warn = isJournalSection(entry.section) ? shareWarning(entry.section, t) : null
                          return (
                            <button
                              key={`${t.kind}:${t.id}`}
                              type="button"
                              disabled={sharing}
                              title={warn ?? undefined}
                              onClick={() => {
                                if (warn && !window.confirm(warn)) return
                                void share(entry.id, t)
                              }}
                              className={`rounded-sm border px-2 py-0.5 font-serif text-[11px] transition disabled:opacity-40 ${
                                t.kind === "npc"
                                  ? "border-[#8a2f22]/60 text-[#8a2f22] hover:bg-[#8a2f22]/10"
                                  : "border-[#73451f]/60 text-[#73451f] hover:bg-[#73451f]/10"
                              }`}
                            >
                              {t.name}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      <div className="mt-3 border-t border-[#92704a]/45 pt-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Take up the quill…"
          rows={3}
          className="w-full resize-none rounded-sm border border-[#8c6844]/50 bg-[#f4ecd9]/70 p-2 font-serif text-sm italic text-[#3d2415] outline-none focus:border-[#73451f]"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={commit}
            disabled={saving || !draft.trim()}
            className="flex items-center gap-2 rounded-sm border border-[#73451f] px-3 py-1 font-serif text-xs uppercase tracking-[.18em] text-[#73451f] transition enabled:hover:bg-[#73451f]/10 disabled:opacity-40"
          >
            <Feather className="h-3.5 w-3.5" /> {saving ? "Committing…" : "Commit to the page"}
          </button>
          <span className="text-[11px] italic text-[#8a5a2e]">Pages are permanent once committed.</span>
        </div>
        {status && <p className="mt-2 text-xs italic text-[#8a2f22]">{status}</p>}
      </div>
    </div>
  )
}

export { TAB_ORDER as JOURNAL_TAB_ORDER }
