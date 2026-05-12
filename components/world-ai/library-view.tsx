"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import type { Campaign } from "@/lib/world-ai/campaigns"

interface LibraryViewProps {
  campaigns: Record<string, Campaign>
  currentCampaignId: string
  onSelectCampaign: (campaign: Campaign) => void
}

export function LibraryView({ campaigns, currentCampaignId, onSelectCampaign }: LibraryViewProps) {
  const [customJson, setCustomJson] = useState("")

  const handleLoadCustom = () => {
    try {
      const parsed = JSON.parse(customJson)
      if (parsed.id && parsed.name && parsed.systemPrompt) {
        onSelectCampaign(parsed as Campaign)
        setCustomJson("")
      } else {
        alert("Invalid campaign JSON. Required fields: id, name, systemPrompt")
      }
    } catch {
      alert("Invalid JSON format")
    }
  }

  return (
    <div className="py-3.5">
      <h2 className="font-serif text-[#d4b15a] text-base tracking-[0.12em] mb-3.5">
        CAMPAIGN LIBRARY
      </h2>

      {/* Campaign cards */}
      <div className="space-y-2.5">
        {Object.values(campaigns).map(campaign => (
          <button
            key={campaign.id}
            onClick={() => onSelectCampaign(campaign)}
            className={cn(
              "w-full text-left bg-[#1f1c16] border rounded p-3.5 transition-all",
              campaign.id === currentCampaignId
                ? "border-[#e0651a] bg-[rgba(224,101,26,0.08)]"
                : "border-[#3a3328] hover:border-[#d4b15a] hover:translate-x-0.5 hover:shadow-[-3px_0_12px_rgba(212,177,90,0.2)]"
            )}
          >
            <h3 className="font-serif text-[#ffd97a] text-sm mb-1">
              {campaign.name}
            </h3>
            <div className="text-[11px] text-[#8a8070] mb-2 tracking-wide">
              {campaign.subtitle}
            </div>
            <p className="text-xs leading-relaxed text-[#e0d8c8]">
              {campaign.description}
            </p>
          </button>
        ))}
      </div>

      {/* Load custom campaign */}
      <div className="mt-6 p-3.5 bg-[#15130f] border border-dashed border-[#3a3328] rounded">
        <h3 className="font-serif text-[#d4b15a] text-[13px] mb-2">
          LOAD CUSTOM CAMPAIGN (paste JSON)
        </h3>
        <textarea
          value={customJson}
          onChange={e => setCustomJson(e.target.value)}
          placeholder={'{ "id": "...", "name": "...", "systemPrompt": "...", ... }'}
          className="w-full h-[120px] bg-[#0a0908] border border-[#3a3328] rounded p-2 text-[#e0d8c8] font-mono text-[11px] resize-y outline-none focus:border-[#d4b15a]"
        />
        <button
          onClick={handleLoadCustom}
          disabled={!customJson.trim()}
          className="mt-2 bg-transparent border border-[#e0651a] text-[#e0651a] font-serif text-[11px] px-3.5 py-1.5 rounded tracking-[0.1em] hover:bg-[#e0651a] hover:text-[#0a0908] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          LOAD
        </button>
      </div>
    </div>
  )
}
