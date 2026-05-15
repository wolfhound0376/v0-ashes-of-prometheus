"use client"

import { useState } from "react"
import { ChevronRight, Languages, Wrench, Sword, Shield, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProficienciesProps {
  languages: string[]
  armorProficiencies: string[]
  weaponProficiencies: string[]
  toolProficiencies: string[]
  features: Array<{
    name: string
    source: string
    description: string
  }>
}

export function ProficienciesPanel({
  languages,
  armorProficiencies,
  weaponProficiencies,
  toolProficiencies,
  features
}: ProficienciesProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  return (
    <div className="space-y-1">
      {/* Languages */}
      <CollapsibleSection
        id="languages"
        title="Languages"
        icon={Languages}
        isExpanded={expandedSection === "languages"}
        onToggle={() => toggleSection("languages")}
        count={languages.length}
      >
        <div className="flex flex-wrap gap-1">
          {languages.map((lang) => (
            <span
              key={lang}
              className="text-xs px-2 py-0.5 bg-[#2a3a4a]/40 border border-[#4a6a8a]/30 rounded text-cyan-300"
            >
              {lang}
            </span>
          ))}
        </div>
      </CollapsibleSection>

      {/* Armor Proficiencies */}
      <CollapsibleSection
        id="armor"
        title="Armor"
        icon={Shield}
        isExpanded={expandedSection === "armor"}
        onToggle={() => toggleSection("armor")}
        count={armorProficiencies.length}
      >
        <div className="flex flex-wrap gap-1">
          {armorProficiencies.map((prof) => (
            <span
              key={prof}
              className="text-xs px-2 py-0.5 bg-[#3a3a2a]/40 border border-[#6a6a3a]/30 rounded text-amber-300"
            >
              {prof}
            </span>
          ))}
        </div>
      </CollapsibleSection>

      {/* Weapon Proficiencies */}
      <CollapsibleSection
        id="weapons"
        title="Weapons"
        icon={Sword}
        isExpanded={expandedSection === "weapons"}
        onToggle={() => toggleSection("weapons")}
        count={weaponProficiencies.length}
      >
        <div className="flex flex-wrap gap-1">
          {weaponProficiencies.map((prof) => (
            <span
              key={prof}
              className="text-xs px-2 py-0.5 bg-[#3a2a2a]/40 border border-[#6a3a3a]/30 rounded text-red-300"
            >
              {prof}
            </span>
          ))}
        </div>
      </CollapsibleSection>

      {/* Tool Proficiencies */}
      <CollapsibleSection
        id="tools"
        title="Tools"
        icon={Wrench}
        isExpanded={expandedSection === "tools"}
        onToggle={() => toggleSection("tools")}
        count={toolProficiencies.length}
      >
        <div className="flex flex-wrap gap-1">
          {toolProficiencies.map((prof) => (
            <span
              key={prof}
              className="text-xs px-2 py-0.5 bg-[#2a2a3a]/40 border border-[#4a4a6a]/30 rounded text-purple-300"
            >
              {prof}
            </span>
          ))}
        </div>
      </CollapsibleSection>

      {/* Features & Traits */}
      <CollapsibleSection
        id="features"
        title="Features & Traits"
        icon={Sparkles}
        isExpanded={expandedSection === "features"}
        onToggle={() => toggleSection("features")}
        count={features.length}
      >
        <div className="space-y-2">
          {features.map((feature, idx) => (
            <div key={idx} className="p-2 bg-[#1a1614]/60 border border-[#3d3428]/40 rounded">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-[#d4b15a]">{feature.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-stone-500">{feature.source}</span>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  )
}

function CollapsibleSection({
  id,
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  count,
  children
}: {
  id: string
  title: string
  icon: any
  isExpanded: boolean
  onToggle: () => void
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="border border-[#3d3428]/40 rounded overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[#2a2420]/40 transition-colors"
      >
        <Icon className="w-3.5 h-3.5 text-stone-500" />
        <span className="flex-1 text-xs uppercase tracking-wider text-[#c9b896] text-left">{title}</span>
        <span className="text-[10px] text-stone-500">{count}</span>
        <ChevronRight className={cn(
          "w-3.5 h-3.5 text-stone-500 transition-transform",
          isExpanded && "rotate-90"
        )} />
      </button>
      {isExpanded && (
        <div className="px-2 pb-2 pt-1 border-t border-[#3d3428]/20">
          {children}
        </div>
      )}
    </div>
  )
}
