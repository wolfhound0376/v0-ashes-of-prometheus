"use client"

import { useMemo, useState } from "react"
import { X, Sparkles, ShieldAlert, Check } from "lucide-react"
import {
  type BestiaryEntry,
  type StatFieldDiff,
  buildStatDiff,
  buildPatch,
  matchBestiary,
} from "@/lib/bestiary-match"

/**
 * Modal that matches a character to a bestiary entry and shows a field-by-field
 * diff before applying. Canon rule: fields whose current value is manually set
 * (non-default) are protected — their checkbox defaults OFF and is highlighted,
 * so a manual stat is never silently overwritten. Nothing is written to the DB
 * here; the approved patch is merged into the edit form via `onApply`.
 */
export function BestiaryAutopopulate({
  characterName,
  currentStats,
  entries,
  onApply,
  onClose,
}: {
  characterName: string
  currentStats: Record<string, unknown>
  entries: BestiaryEntry[]
  onApply: (patch: Record<string, string | number>) => void
  onClose: () => void
}) {
  const { best, ranked } = useMemo(() => matchBestiary(characterName, entries), [characterName, entries])
  const [selectedId, setSelectedId] = useState<string | null>(best?.entry.id ?? null)

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  )

  const { writable, info } = useMemo(
    () => (selectedEntry ? buildStatDiff(currentStats, selectedEntry) : { writable: [], info: [] }),
    [selectedEntry, currentStats],
  )

  // Only fields that would actually change and have a proposed value.
  const changeable = useMemo(
    () => writable.filter((f) => f.proposed !== null && f.proposed !== f.current),
    [writable],
  )

  // Approval state keyed by field key. Default: ON when unset, OFF when manual.
  const [approved, setApproved] = useState<Record<string, boolean>>({})
  const isApproved = (f: StatFieldDiff) => approved[f.key] ?? !f.isManuallySet

  const toggle = (key: string, next: boolean) => setApproved((prev) => ({ ...prev, [key]: next }))

  const apply = () => {
    const chosen = changeable.filter((f) => isApproved(f))
    onApply(buildPatch(chosen))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Autopopulate from bestiary">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#c4a777]/30 rounded-lg">
        <div className="flex items-center justify-between p-5 border-b border-[#3d3428]/60 sticky top-0 bg-[#12100e]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#c4a777]" />
            <h3 className="font-serif text-lg text-[#c4a777]">Autopopulate: {characterName || "Character"}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-stone-500 hover:text-[#c4a777]" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Match / picker */}
          <div>
            <label className="block text-sm text-stone-400 mb-2">Bestiary entry</label>
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none focus:border-[#c4a777]/50"
            >
              <option value="">— Select a bestiary entry —</option>
              {ranked.map(({ entry, confidence, reason }) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                  {confidence > 0 ? ` — ${Math.round(confidence * 100)}% (${reason})` : ""}
                </option>
              ))}
            </select>
            {best ? (
              <p className="mt-2 text-xs text-green-400/80">
                Suggested match: <span className="font-semibold">{best.entry.name}</span> — {best.reason}
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber-400/80">
                No confident match for &quot;{characterName}&quot; — pick an entry above.
              </p>
            )}
          </div>

          {selectedEntry && (
            <>
              {/* Writable diff */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-stone-400">Stats to apply</label>
                  <span className="text-[11px] text-stone-600">
                    {changeable.length} change{changeable.length === 1 ? "" : "s"}
                  </span>
                </div>
                {changeable.length === 0 ? (
                  <p className="text-sm text-stone-500 py-3 text-center border border-[#3d3428]/40 rounded-lg">
                    No differences — this character already matches the block.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {changeable.map((f) => {
                      const on = isApproved(f)
                      return (
                        <label
                          key={f.key}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                            f.isManuallySet
                              ? "border-amber-600/40 bg-amber-950/20"
                              : "border-[#3d3428]/50 bg-[#0f0d0b]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => toggle(f.key, e.target.checked)}
                            className="accent-[#c4a777] w-4 h-4"
                          />
                          <span className="w-24 flex-shrink-0 text-sm text-[#e8dcc4]">{f.label}</span>
                          <span className="flex-1 flex items-baseline gap-2 text-sm min-w-0">
                            <span className={`text-stone-500 ${f.kind === "number" ? "tabular-nums" : "break-words"}`}>
                              {f.current ?? "—"}
                            </span>
                            <span className="text-stone-600 flex-shrink-0">→</span>
                            <span className={`text-[#c4a777] font-semibold ${f.kind === "number" ? "tabular-nums" : "break-words"}`}>
                              {f.proposed}
                            </span>
                          </span>
                          {f.isManuallySet && (
                            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-400/90">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              manual
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                )}
                {changeable.some((f) => f.isManuallySet) && (
                  <p className="mt-2 text-[11px] text-amber-400/70">
                    Amber rows already have a manually-set value and are unchecked by default. Tick them only to overwrite.
                  </p>
                )}
              </div>

              {/* Informational reference fields not stored in the characters schema */}
              {info.length > 0 && (
                <div>
                  <label className="block text-sm text-stone-400 mb-2">Reference (not stored on characters)</label>
                  <div className="flex flex-wrap gap-2">
                    {info.map((i) => (
                      <span key={i.label} className="text-[11px] px-2 py-1 rounded bg-[#2a2520] text-stone-400">
                        <span className="text-stone-500">{i.label}:</span> {i.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-[#3d3428]/60 sticky bottom-0 bg-[#12100e]">
          <button onClick={onClose} className="flex items-center gap-2 px-4 py-2 border border-[#3d3428]/60 rounded-lg text-stone-400 text-sm">
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={!selectedEntry || changeable.filter(isApproved).length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            Apply {changeable.filter(isApproved).length || ""} to form
          </button>
        </div>
      </div>
    </div>
  )
}
