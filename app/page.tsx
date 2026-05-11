"use client"

import { useState } from "react"
import Link from "next/link"
import { Settings } from "lucide-react"
import { LeftColumn } from "@/components/dashboard/left-column"
import { CenterColumn } from "@/components/dashboard/center-column"
import { RightColumn } from "@/components/dashboard/right-column"
import { characterData, dialogueData, actionsData, inventoryData, environmentData } from "@/lib/game-data"

export default function DashboardPage() {
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [dialogueInput, setDialogueInput] = useState("")
  const [dialogue, setDialogue] = useState(dialogueData)
  const [resources, setResources] = useState({
    action: 1,
    bonusAction: 1,
    reaction: 1,
    spellSlots: 3,
    maxSpellSlots: 3,
    sorceryPoints: 4,
    maxSorceryPoints: 4,
    arcaneCharges: 2,
    maxArcaneCharges: 3,
  })

  const handleActionSelect = (actionId: string) => {
    setSelectedAction(actionId === selectedAction ? null : actionId)
  }

  const handleDialogueSubmit = () => {
    if (dialogueInput.trim()) {
      setDialogue([...dialogue, { speaker: "You", text: dialogueInput.trim() }])
      setDialogueInput("")
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0908] text-stone-200 overflow-hidden">
      {/* Admin link */}
      <Link 
        href="/admin"
        className="fixed top-4 right-4 z-[60] p-2 bg-[#1a1614]/90 border border-[#3d3428]/60 rounded-lg text-stone-500 hover:text-[#c4a777] hover:border-[#c4a777]/30 transition-all group"
        title="Content Manager"
      >
        <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
      </Link>

      {/* Smoke/fog overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
      </div>

      {/* Main dashboard grid */}
      <div className="h-screen p-2 grid grid-cols-1 lg:grid-cols-[320px_1fr_380px] gap-2">
        <LeftColumn
          environment={environmentData}
          dialogue={dialogue}
          dialogueInput={dialogueInput}
          setDialogueInput={setDialogueInput}
          onDialogueSubmit={handleDialogueSubmit}
        />
        <CenterColumn
          selectedAction={selectedAction}
          onActionSelect={handleActionSelect}
          actions={actionsData}
          resources={resources}
        />
        <RightColumn character={characterData} inventory={inventoryData} />
      </div>
    </div>
  )
}
