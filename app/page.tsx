"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Settings } from "lucide-react"
import { LeftColumn } from "@/components/dashboard/left-column"
import { CenterColumn } from "@/components/dashboard/center-column"
import { RightColumn } from "@/components/dashboard/right-column"
import { characterData, dialogueData, actionsData, inventoryData, environmentData, getClassActions } from "@/lib/game-data"
import { useTelemetry } from "@/lib/hooks/use-telemetry"
import { createClient } from "@/lib/supabase/client"
import type { Character, InventoryItem, EquipmentItem } from "@/lib/types/database"

export default function DashboardPage() {
  const supabase = createClient()
  
  // Character selection state
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [characterInventory, setCharacterInventory] = useState<InventoryItem[]>([])
  const [characterEquipment, setCharacterEquipment] = useState<EquipmentItem[]>([])
  const [loadingCharacters, setLoadingCharacters] = useState(true)

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

  // Fetch characters from Supabase on mount
  useEffect(() => {
    async function fetchCharacters() {
      setLoadingCharacters(true)
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .order('is_player', { ascending: false })
        .order('name')
      
      if (error) {
        console.error('Error fetching characters:', error)
      } else if (data && data.length > 0) {
        setCharacters(data)
        // Auto-select first character (usually the player)
        setSelectedCharacterId(data[0].id)
      }
      setLoadingCharacters(false)
    }
    fetchCharacters()
  }, [])

  // Fetch inventory and equipment when character changes
  useEffect(() => {
    async function fetchCharacterData() {
      if (!selectedCharacterId) return

      // Fetch inventory
      const { data: invData } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('character_id', selectedCharacterId)
        .order('name')
      
      if (invData) setCharacterInventory(invData)

      // Fetch equipment
      const { data: equipData } = await supabase
        .from('equipment_items')
        .select('*')
        .eq('character_id', selectedCharacterId)
      
      if (equipData) setCharacterEquipment(equipData)
    }
    fetchCharacterData()
  }, [selectedCharacterId])

  // Get the currently selected character
  const selectedCharacter = characters.find(c => c.id === selectedCharacterId)

  // Get available actions based on character class
  const availableActionIds = selectedCharacter 
    ? getClassActions(selectedCharacter.class) 
    : getClassActions('Fighter')

  // Telemetry hook for AI-assisted game state tracking
  const { buildPayload, pushTelemetry, isPushing } = useTelemetry({
    campaignId: 'ashes_of_prometheus',
    encounterId: 'exploration',
  })

  // Handle telemetry push on action/intent
  const handleTelemetryPush = async (actionType: string, intent: string, roll?: number) => {
    if (!selectedCharacter) return
    
    const payload = buildPayload(
      selectedCharacter,
      { type: actionType, intent, roll },
      { name: environmentData.location, description: environmentData.description },
      { action: resources.action > 0, bonusAction: resources.bonusAction > 0, reaction: resources.reaction > 0 }
    )
    
    try {
      await pushTelemetry(payload)
      console.log('[Telemetry] Pushed game state:', actionType)
    } catch (err) {
      console.error('[Telemetry] Failed to push:', err)
    }
  }

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
          characterAvatar={selectedCharacter?.avatar_image_url}
          characterName={selectedCharacter?.name}
        />
        <CenterColumn
          selectedAction={selectedAction}
          onActionSelect={handleActionSelect}
          actions={actionsData}
          resources={resources}
          availableActionIds={availableActionIds}
          onTelemetryPush={handleTelemetryPush}
        />
        <RightColumn 
          characters={characters}
          selectedCharacterId={selectedCharacterId}
          onCharacterSelect={setSelectedCharacterId}
          selectedCharacter={selectedCharacter}
          characterInventory={characterInventory}
          characterEquipment={characterEquipment}
          fallbackCharacter={characterData}
          fallbackInventory={inventoryData}
          loading={loadingCharacters}
        />
      </div>
    </div>
  )
}
