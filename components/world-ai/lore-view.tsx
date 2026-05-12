"use client"

import type { LoreCategory } from "@/lib/world-ai/campaigns"

interface LoreViewProps {
  lore: LoreCategory[]
}

export function LoreView({ lore }: LoreViewProps) {
  return (
    <div className="py-3.5">
      {lore.map((category, catIdx) => (
        <section key={catIdx} className="mb-5">
          <h3 className="font-serif text-[#d4b15a] text-sm tracking-[0.12em] pb-1.5 border-b border-[#3a3328] mb-2.5">
            {category.category}
          </h3>
          {category.items.map((item, itemIdx) => (
            <div
              key={itemIdx}
              className="bg-[#1f1c16] border-l-2 border-l-[#d4b15a] py-2.5 px-3.5 mb-2 rounded-r"
            >
              <h4 className="font-serif text-[#ffd97a] text-xs tracking-wide mb-1">
                {item.name}
              </h4>
              <p className="text-xs leading-relaxed text-[#e0d8c8]">
                {item.text}
              </p>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
