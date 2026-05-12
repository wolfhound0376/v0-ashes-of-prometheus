"use client"

import type { Campaign } from "@/lib/world-ai/campaigns"

interface ContextBarProps {
  campaign: Campaign
  contextState: {
    episode: string
    location: string
    heat: string
  }
  onContextChange: (state: { episode: string; location: string; heat: string }) => void
  onDiceRoll: (notation: string, name: string) => void
}

const diceTypes = [
  { notation: "1d4", label: "d4" },
  { notation: "1d6", label: "d6" },
  { notation: "1d8", label: "d8" },
  { notation: "1d10", label: "d10" },
  { notation: "1d12", label: "d12" },
  { notation: "1d20", label: "d20" },
  { notation: "1d100", label: "d%" }
]

export function ContextBar({ campaign, contextState, onContextChange, onDiceRoll }: ContextBarProps) {
  return (
    <div className="flex gap-3 py-2 border-b border-[#3a3328] flex-shrink-0 flex-wrap items-center">
      {/* Episode selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-[#8a8070] tracking-[0.1em] uppercase">Episode</span>
        <select
          value={contextState.episode}
          onChange={e => onContextChange({ ...contextState, episode: e.target.value })}
          className="bg-[#1f1c16] border border-[#3a3328] rounded px-2 py-0.5 text-[11px] text-[#e0d8c8] font-mono outline-none cursor-pointer focus:border-[#d4b15a]"
        >
          {campaign.contexts.episodes.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Location selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-[#8a8070] tracking-[0.1em] uppercase">Location</span>
        <select
          value={contextState.location}
          onChange={e => onContextChange({ ...contextState, location: e.target.value })}
          className="bg-[#1f1c16] border border-[#3a3328] rounded px-2 py-0.5 text-[11px] text-[#e0d8c8] font-mono outline-none cursor-pointer focus:border-[#d4b15a]"
        >
          {campaign.contexts.locations.map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
      </div>

      {/* Heat selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-[#8a8070] tracking-[0.1em] uppercase">Heat</span>
        <select
          value={contextState.heat}
          onChange={e => onContextChange({ ...contextState, heat: e.target.value })}
          className="bg-[#1f1c16] border border-[#3a3328] rounded px-2 py-0.5 text-[11px] text-[#e0d8c8] font-mono outline-none cursor-pointer focus:border-[#d4b15a]"
        >
          {campaign.contexts.heat.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Dice bench */}
      <div className="flex gap-1 ml-auto">
        {diceTypes.map(dice => (
          <button
            key={dice.notation}
            onClick={() => onDiceRoll(dice.notation, dice.label.toUpperCase())}
            className="bg-[#1f1c16] border border-[#3a3328] rounded px-2 py-1 text-[10px] text-[#e0d8c8] font-serif tracking-wide hover:border-[#e0651a] hover:text-[#ffd97a] hover:-translate-y-0.5 transition-all"
          >
            {dice.label}
          </button>
        ))}
      </div>
    </div>
  )
}
