"use client"

import { useState } from "react"
import { X, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  CONDITION_PRESETS,
  conditionColor,
  normalizeConditions,
  addCondition,
  removeCondition,
} from "@/lib/conditions"

// Tag-style add/remove editor with presets plus free text. Fully controlled:
// emits the new normalized string[] via onChange for the parent to persist.
export function ConditionsEditor({
  value,
  onChange,
  label = "Conditions",
}: {
  value: unknown
  onChange: (next: string[]) => void
  label?: string | null
}) {
  const list = normalizeConditions(value)
  const [draft, setDraft] = useState("")

  const commitAdd = (c: string) => {
    const v = c.trim()
    if (!v) return
    onChange(addCondition(list, v))
    setDraft("")
  }

  const activeKeys = new Set(list.map((c) => c.toLowerCase()))
  const availablePresets = CONDITION_PRESETS.filter((p) => !activeKeys.has(p.toLowerCase()))

  return (
    <div>
      {label && <label className="block text-xs text-stone-500 mb-1">{label}</label>}

      {/* Current conditions */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {list.length === 0 && <span className="text-xs text-stone-600">None</span>}
        {list.map((c) => (
          <span
            key={c}
            className={cn(
              "flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-current/30 bg-current/10",
              conditionColor(c),
            )}
          >
            {c}
            <button
              type="button"
              onClick={() => onChange(removeCondition(list, c))}
              aria-label={`Remove ${c}`}
              className="hover:text-red-400"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Preset quick-add */}
      {availablePresets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {availablePresets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => commitAdd(p)}
              className="text-[10px] px-2 py-0.5 rounded border border-[#3d3428]/60 text-stone-400 hover:border-[#c4a777]/50 hover:text-[#c4a777] transition-colors"
            >
              + {p}
            </button>
          ))}
        </div>
      )}

      {/* Free-text add */}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Avoid submitting mid-IME composition.
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault()
              commitAdd(draft)
            }
          }}
          placeholder="Add custom condition…"
          className="flex-1 px-3 py-1.5 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] text-sm focus:outline-none focus:border-[#c4a777]/50"
        />
        <button
          type="button"
          onClick={() => commitAdd(draft)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] hover:border-[#c4a777]/50"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  )
}
