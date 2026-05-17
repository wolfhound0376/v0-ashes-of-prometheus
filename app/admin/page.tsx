"use client"

export const dynamic = "force-dynamic"

import { useState } from "react"
import { 
  Map, 
  User, 
  Sword, 
  Backpack, 
  Zap, 
  Sparkles, 
  MessageSquare, 
  Image,
  ChevronRight,
  Plus
} from "lucide-react"
import { EnvironmentsPanel } from "@/components/admin/environments-panel"
import { CharactersPanel } from "@/components/admin/characters-panel"
import { ActionsPanel } from "@/components/admin/actions-panel"
import { InventoryPanel } from "@/components/admin/inventory-panel"
import { EquipmentPanel } from "@/components/admin/equipment-panel"
import { AbilitiesPanel } from "@/components/admin/abilities-panel"
import { DialoguePanel } from "@/components/admin/dialogue-panel"
import { AssetsPanel } from "@/components/admin/assets-panel"

type PanelType = 'environments' | 'characters' | 'actions' | 'inventory' | 'equipment' | 'abilities' | 'dialogue' | 'assets'

const PANELS = [
  { id: 'environments' as const, name: 'Environments', icon: Map, description: 'Manage locations and backgrounds' },
  { id: 'characters' as const, name: 'Characters', icon: User, description: 'Player and NPC data' },
  { id: 'actions' as const, name: 'Actions', icon: Zap, description: 'Available actions and icons' },
  { id: 'inventory' as const, name: 'Inventory', icon: Backpack, description: 'Items and quantities' },
  { id: 'equipment' as const, name: 'Equipment', icon: Sword, description: 'Equipment slots and gear' },
  { id: 'abilities' as const, name: 'Abilities', icon: Sparkles, description: 'Spells and quick abilities' },
  { id: 'dialogue' as const, name: 'Dialogue', icon: MessageSquare, description: 'NPC conversations' },
  { id: 'assets' as const, name: 'Assets', icon: Image, description: 'Images, overlays, animations' },
]

export default function AdminDashboard() {
  const [activePanel, setActivePanel] = useState<PanelType>('environments')

  const renderPanel = () => {
    switch (activePanel) {
      case 'environments':
        return <EnvironmentsPanel />
      case 'characters':
        return <CharactersPanel />
      case 'actions':
        return <ActionsPanel />
      case 'inventory':
        return <InventoryPanel />
      case 'equipment':
        return <EquipmentPanel />
      case 'abilities':
        return <AbilitiesPanel />
      case 'dialogue':
        return <DialoguePanel />
      case 'assets':
        return <AssetsPanel />
      default:
        return null
    }
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-72 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] border-r border-[#3d3428]/60 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[#3d3428]/60">
          <h1 className="font-serif text-xl text-[#c4a777] tracking-wide">
            Dashboard Admin
          </h1>
          <p className="text-xs text-stone-500 mt-1">Content Management System</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {PANELS.map((panel) => {
            const Icon = panel.icon
            const isActive = activePanel === panel.id
            return (
              <button
                key={panel.id}
                onClick={() => setActivePanel(panel.id)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all
                  ${isActive 
                    ? 'bg-gradient-to-r from-[#2a2520] to-[#1a1815] border border-[#c4a777]/30 shadow-lg shadow-[#c4a777]/5' 
                    : 'hover:bg-[#1a1815]/50 border border-transparent'
                  }
                `}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#c4a777]' : 'text-stone-500'}`} />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${isActive ? 'text-[#e8dcc4]' : 'text-stone-400'}`}>
                    {panel.name}
                  </p>
                  <p className="text-[10px] text-stone-600">{panel.description}</p>
                </div>
                {isActive && <ChevronRight className="w-4 h-4 text-[#c4a777]" />}
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[#3d3428]/60">
          <a 
            href="/"
            className="flex items-center gap-2 text-sm text-stone-500 hover:text-[#c4a777] transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back to Dashboard
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Top Bar */}
        <header className="h-16 border-b border-[#3d3428]/60 bg-[#1a1614]/80 backdrop-blur-sm flex items-center justify-between px-6">
          <div>
            <h2 className="font-serif text-lg text-[#e8dcc4]">
              {PANELS.find(p => p.id === activePanel)?.name}
            </h2>
            <p className="text-xs text-stone-500">
              {PANELS.find(p => p.id === activePanel)?.description}
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] text-sm hover:border-[#c4a777]/50 transition-colors">
            <Plus className="w-4 h-4" />
            Add New
          </button>
        </header>

        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {renderPanel()}
        </div>
      </main>
    </div>
  )
}
