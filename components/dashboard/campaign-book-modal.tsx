"use client"

import { BookOpen, LockKeyhole, Map, ScrollText, X } from "lucide-react"
import type { InventoryItem } from "@/lib/types/database"
import { JournalPages } from "@/components/dashboard/journal-pages"
import MapPanel from "@/components/map/map-panel"

export type CampaignBookSection = "journal" | "quests" | "maps" | "lore"

const sectionCopy: Record<CampaignBookSection, { title: string; subtitle: string; empty: string }> = {
  journal: {
    title: "Personal Journal",
    subtitle: "A physical campaign possession",
    empty: "This journal has no recorded pages yet.",
  },
  quests: {
    title: "Quest Ledger",
    subtitle: "Accepted and completed missions",
    empty: "No accepted or completed quests are recorded for this character.",
  },
  maps: {
    title: "Explored Maps",
    subtitle: "Places personally charted and retained",
    empty: "No explored map records have been unlocked for this character.",
  },
  lore: {
    title: "Recovered Lore",
    subtitle: "Knowledge earned through successful checks",
    empty: "No lore has been unlocked by a successful Arcana or History check.",
  },
}

export function CampaignBookModal({ section, inventory, characterId = null, onClose }: { section: CampaignBookSection; inventory: InventoryItem[]; characterId?: string | null; onClose: () => void }) {
  const copy = sectionCopy[section]
  const journals = inventory.filter((item) => /journal|diary|notebook/i.test(item.name))
  const journalLocked = section === "journal" && journals.length === 0
  const Icon = section === "maps" ? Map : section === "lore" || section === "quests" ? ScrollText : BookOpen

  // Maps is the one section with something real to show, and a parchment book
  // page is the wrong frame for it: this opens the map window itself, with the
  // region and location layers a toggle apart.
  if (section === "maps") {
    return (
      <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={copy.title} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <section className="relative h-[min(760px,90vh)] w-full max-w-[1180px] overflow-hidden rounded border-2 border-[#7a5f33] bg-[#0b0714] shadow-[0_0_40px_#000]">
          <button type="button" onClick={onClose} aria-label={`Close ${copy.title}`} className="absolute right-2 top-1.5 z-40 rounded border border-[#6b5123] bg-[#080705]/90 p-1 text-[#e1d0a8] transition hover:border-[#c99a49]"><X className="h-4 w-4" /></button>
          <MapPanel initial="region" />
        </section>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={copy.title} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="aop-campaign-book relative h-[min(680px,88vh)] w-full max-w-[920px] overflow-hidden">
        <button type="button" onClick={onClose} aria-label={`Close ${copy.title}`} className="absolute right-5 top-4 z-20 text-[#6d3d1f] transition hover:text-[#32170e]"><X className="h-5 w-5" /></button>
        <div className="aop-book-page aop-book-page-left">
          <div className="aop-book-corner" />
          <Icon className="mx-auto mt-7 h-8 w-8 text-[#73451f]" />
          <p className="mt-4 text-center font-serif text-[10px] uppercase tracking-[.24em] text-[#83582e]">Ashes of Prometheus</p>
          <h2 className="mt-3 text-center font-serif text-3xl text-[#3d2415]">{copy.title}</h2>
          <p className="mt-2 text-center font-serif italic text-[#775435]">{copy.subtitle}</p>
          <div className="mx-auto my-7 h-px w-4/5 bg-gradient-to-r from-transparent via-[#8d6238] to-transparent" />
          {journalLocked ? (
            <div className="mx-auto max-w-sm text-center text-[#4e3422]">
              <LockKeyhole className="mx-auto h-9 w-9" />
              <h3 className="mt-3 font-serif text-xl">Journal not in inventory</h3>
              <p className="mt-3 text-sm leading-relaxed">Personal pages can only be opened by the character carrying their physical journal. A character may possess no more than two journals.</p>
            </div>
          ) : section === "journal" ? (
            <div className="mx-auto flex h-[calc(100%-220px)] max-w-md flex-col px-2">
              <JournalPages characterId={characterId} />
              <p className="mt-2 text-center text-[10px] uppercase tracking-wider text-[#83582e]">Carried: {journals.map((journal) => journal.name).join(", ")}</p>
            </div>
          ) : (
            <div className="mx-auto max-w-sm text-center text-[#5c3e28]">
              <p className="font-serif text-lg">{copy.empty}</p>
            </div>
          )}
        </div>
        <div className="aop-book-page aop-book-page-right">
          <h3 className="mt-8 border-b border-[#92704a]/45 pb-3 text-center font-serif text-xl text-[#4b2d19]">Campaign Record</h3>
          <div className="mt-7 space-y-5 font-serif text-[#583a25]">
            {section === "quests" && <><BookLine label="Active missions" value="None recorded" /><BookLine label="Completed missions" value="None recorded" /></>}
            {section === "lore" && <><BookLine label="Arcana discoveries" value="None recorded" /><BookLine label="Historical discoveries" value="None recorded" /></>}
            {section === "journal" && <><BookLine label="Owned journals" value={String(journals.length)} /><BookLine label="Maximum allowed" value="2" /></>}
          </div>
          <p className="absolute bottom-10 left-10 right-10 border-t border-[#92704a]/35 pt-4 text-center text-xs italic leading-relaxed text-[#795a3c]">
            Only campaign state actually recorded for this character appears here. Unknown entries remain hidden.
          </p>
        </div>
      </section>
    </div>
  )
}

function BookLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-end gap-3 border-b border-dotted border-[#8c6844]/55 pb-1"><span>{label}</span><strong className="ml-auto text-[#3f2819]">{value}</strong></div>
}
