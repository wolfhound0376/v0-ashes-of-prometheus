"use client"

// Personal journal pages, backed by public.journal_entries.
// RLS contract: anon may SELECT anything and INSERT only author='player'.
// There are no UPDATE/DELETE policies — a page, once committed, is permanent
// from the browser. Do not add a delete button here; it would silently no-op.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Feather } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface JournalEntry {
  id: string
  title: string | null
  in_world_date: string | null
  body: string
  author: "player" | "malachar" | "import"
  created_at: string
}

export function JournalPages({ characterId }: { characterId: string | null }) {
  const supabase = useMemo(() => createClient(), [])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!characterId) return
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, title, in_world_date, body, author, created_at")
      .eq("character_id", characterId)
      .order("created_at", { ascending: true })
    if (!error && data) setEntries(data as JournalEntry[])
  }, [characterId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const commit = useCallback(async () => {
    const body = draft.trim()
    if (!body || !characterId || saving) return
    setSaving(true)
    setStatus(null)
    const { data, error } = await supabase
      .from("journal_entries")
      .insert({ character_id: characterId, body, author: "player", visibility: "private" })
      .select("id")
    // Silent-failure guard: verify a row actually came back before trusting
    // the write — an RLS mismatch can otherwise pass unnoticed.
    if (error || !data || data.length === 0) {
      setStatus("The page would not take. Nothing was written.")
    } else {
      setDraft("")
      await load()
    }
    setSaving(false)
  }, [draft, characterId, saving, supabase, load])

  if (!characterId) {
    return <p className="text-center font-serif italic text-[#775435]">No character is seated in this browser.</p>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {entries.length === 0 && (
          <p className="text-center font-serif italic text-[#775435]">This journal has no recorded pages yet.</p>
        )}
        {entries.map((entry) => (
          <article key={entry.id} className="border-b border-dotted border-[#8c6844]/55 pb-3">
            <p className="text-[10px] uppercase tracking-[.2em] text-[#83582e]">
              {entry.in_world_date ??
                new Date(entry.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
              {entry.author === "malachar" && " · in another hand"}
              {entry.author === "import" && " · transcribed"}
            </p>
            {entry.title && <h4 className="mt-1 font-serif text-[#3d2415]">{entry.title}</h4>}
            <p className="mt-1 whitespace-pre-wrap font-serif text-sm italic leading-relaxed text-[#4e3422]">{entry.body}</p>
          </article>
        ))}
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
