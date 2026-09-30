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
import { ChevronLeft, Eye, Feather, Share2 } from "lucide-react"
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
  // Sam, 2026-09-29: the categories were too hard to see, and should read like
  // a table of contents at the front of the book. So the book OPENS on its
  // contents rather than on a strip of small tabs — a tab bar asks you to
  // notice thirteen tiny words at the top of a parchment page, which is
  // exactly what failed. `openAt` is null while the contents are showing.
  const [openSection, setOpenSection] = useState<JournalSection | null>(
    initialSection === "pages" ? null : initialSection,
  )
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
    setOpenSection(initialSection === "pages" ? null : initialSection)
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
      setOpenSection("pages")
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
  const shown = openSection ? entries.filter((e) => e.section === openSection) : []
  const menu = targets ? [...targets.party, ...targets.present] : []

  // THE CONTENTS PAGE. Every section, always, whether or not it holds
  // anything — the sections are the book's shape, and a player should be able
  // to see there is a Recipes page before they have a recipe for it. A count
  // sits on the right where a page number would, and an empty section says so
  // in words rather than being dimmed into invisibility, which was the first
  // mistake here.
  if (!openSection) {
    return (
      <div className="flex h-full flex-col">
        <h3 className="text-center font-serif text-[11px] uppercase tracking-[.3em] text-[#83582e]">Contents</h3>
        <div className="mx-auto mt-1 h-px w-2/3 bg-gradient-to-r from-transparent via-[#8d6238] to-transparent" />
        <ul className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          {TAB_ORDER.map((s) => {
            const n = counts.get(s) ?? 0
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenSection(s)
                    setTab(s)
                    setSelected(null)
                  }}
                  className="group flex w-full items-baseline gap-2 py-[5px] text-left transition"
                >
                  <span className="font-serif text-[15px] text-[#3d2415] group-hover:text-[#73451f] group-hover:underline">
                    {SECTION_LABEL[s]}
                  </span>
                  {/* the leader dots of a real table of contents */}
                  <span className="min-w-6 flex-1 translate-y-[-3px] border-b border-dotted border-[#8c6844]/60" />
                  <span className={`font-serif text-[13px] ${n > 0 ? "text-[#73451f]" : "text-[#a3835c] italic"}`}>
                    {n > 0 ? n : "empty"}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <Compose
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          onCommit={commit}
          status={status}
          hint="New writing goes to Pages."
        />
      </div>
    )
  }

  // ONE SECTION, opened from the contents.
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-baseline gap-2 border-b border-[#92704a]/40 pb-2">
        <button
          type="button"
          onClick={() => {
            setOpenSection(null)
            setSelected(null)
          }}
          className="flex items-center gap-1 font-serif text-[11px] uppercase tracking-[.16em] text-[#8a6a45] transition hover:text-[#3d2415]"
        >
          <ChevronLeft className="h-3 w-3" /> Contents
        </button>
        <h3 className="ml-auto font-serif text-[15px] text-[#3d2415]">{SECTION_LABEL[openSection]}</h3>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {shown.length === 0 && (
          <p className="text-center font-serif italic text-[#775435]">
            {openSection === "pages" ? "This journal has no recorded pages yet." : `Nothing under ${SECTION_LABEL[openSection]} yet.`}
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

      <Compose draft={draft} setDraft={setDraft} saving={saving} onCommit={commit} status={status} />
    </div>
  )
}

/**
 * The quill, shared by the contents page and each section so writing is always
 * one click away rather than only reachable from one view.
 *
 * Whatever is written goes to `pages` — the plain, untyped section. The typed
 * sections are filled by the system from tagged discoveries, not by hand, which
 * is what keeps "the AI invents no game data" true from this side too.
 */
function Compose({
  draft,
  setDraft,
  saving,
  onCommit,
  status,
  hint,
}: {
  draft: string
  setDraft: (v: string) => void
  saving: boolean
  onCommit: () => void
  status: string | null
  hint?: string
}) {
  return (
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
          onClick={onCommit}
          disabled={saving || !draft.trim()}
          className="flex items-center gap-2 rounded-sm border border-[#73451f] px-3 py-1 font-serif text-xs uppercase tracking-[.18em] text-[#73451f] transition enabled:hover:bg-[#73451f]/10 disabled:opacity-40"
        >
          <Feather className="h-3.5 w-3.5" /> {saving ? "Committing…" : "Commit to the page"}
        </button>
        <span className="text-[11px] italic text-[#8a5a2e]">{hint ?? "Pages are permanent once committed."}</span>
      </div>
      {status && <p className="mt-2 text-xs italic text-[#8a2f22]">{status}</p>}
    </div>
  )
}

export { TAB_ORDER as JOURNAL_TAB_ORDER }
