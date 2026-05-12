"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Settings } from "lucide-react"
import { LeftColumn } from "@/components/dashboard/left-column"
import { CenterColumn } from "@/components/dashboard/center-column"
import { RightColumn } from "@/components/dashboard/right-column"
import { DiceRollModal, type RollResult, type RollRequest } from "@/components/dashboard/dice-roll-modal"
import { characterData, actionsData, inventoryData, environmentData, getClassActions } from "@/lib/game-data"
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

  // Dice roll modal state
  const [diceModalOpen, setDiceModalOpen] = useState(false)
  const [currentRollRequest, setCurrentRollRequest] = useState<RollRequest | null>(null)

  // Function to request a dice roll (called by actions, spells, dialogue, etc.)
  const requestDiceRoll = (request: RollRequest) => {
    // Add character's ability modifier if relevant
    if (selectedCharacter) {
      const abilityMap: Record<string, number> = {
        'STR': selectedCharacter.str_modifier ?? 0,
        'DEX': selectedCharacter.dex_modifier ?? 0,
        'CON': selectedCharacter.con_modifier ?? 0,
        'INT': selectedCharacter.int_modifier ?? 0,
        'WIS': selectedCharacter.wis_modifier ?? 0,
        'CHA': selectedCharacter.cha_modifier ?? 0,
      }
      // Check if modifier label contains ability abbreviation
      for (const [abbr, mod] of Object.entries(abilityMap)) {
        if (request.label.toUpperCase().includes(abbr)) {
          request.abilityModifier = mod
          break
        }
      }
    }
    setCurrentRollRequest(request)
    setDiceModalOpen(true)
  }

  // Handle dice roll completion with telemetry
  const handleDiceRollComplete = (result: RollResult) => {
    // Push telemetry for the roll
    handleTelemetryPush(
      result.label?.toUpperCase().replace(/ /g, '_') || 'DICE_ROLL',
      `Rolled ${result.dice}: ${result.total}`,
      result.total
    )
    setDiceModalOpen(false)
    setCurrentRollRequest(null)
  }

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

  // Action-to-dice mapping for D&D 5E
  const actionDiceRequirements: Record<string, RollRequest> = {
    'attack': { dice: 'd20', count: 1, modifier: 0, label: 'Attack Roll' },
    'cast-spell': { dice: 'd20', count: 1, modifier: 0, label: 'Spell Attack' },
    'hide': { dice: 'd20', count: 1, modifier: 0, label: 'DEX Stealth Check' },
    'search': { dice: 'd20', count: 1, modifier: 0, label: 'WIS Perception Check' },
    'dodge': { dice: 'd20', count: 1, modifier: 0, label: 'DEX Save (if needed)' },
    'second-wind': { dice: 'd10', count: 1, modifier: selectedCharacter?.level ?? 1, label: 'Second Wind Healing' },
    'opportunity-attack': { dice: 'd20', count: 1, modifier: 0, label: 'Opportunity Attack' },
  }

  const handleActionSelect = (actionId: string) => {
    setSelectedAction(actionId === selectedAction ? null : actionId)
    
    // Check if this action requires a dice roll
    const diceReq = actionDiceRequirements[actionId]
    if (diceReq) {
      requestDiceRoll(diceReq)
    }
  }

  // Handler for populating starting equipment (D&D 5E standard gear)
  const handlePopulateStartingGear = async (equipment: any[], inventory: any[], gold: number) => {
    if (!selectedCharacterId) return

    try {
      // Clear existing inventory and equipment for this character
      await supabase.from('inventory_items').delete().eq('character_id', selectedCharacterId)
      await supabase.from('equipment_items').delete().eq('character_id', selectedCharacterId)

      // Insert new equipment items
      if (equipment.length > 0) {
        const equipmentToInsert = equipment.map(item => ({
          character_id: selectedCharacterId,
          slot: item.slot,
          name: item.name,
          preset_icon: item.icon,
          is_equipped: true,
        }))
        await supabase.from('equipment_items').insert(equipmentToInsert)
      }

      // Insert new inventory items (including gold)
      const inventoryToInsert = [
        ...inventory.map(item => ({
          character_id: selectedCharacterId,
          name: item.name,
          quantity: item.quantity,
          preset_icon: item.icon,
        })),
        {
          character_id: selectedCharacterId,
          name: 'Gold Pieces',
          quantity: gold,
          preset_icon: 'coins',
        }
      ]
      await supabase.from('inventory_items').insert(inventoryToInsert)

      // Refresh inventory and equipment
      const { data: invData } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('character_id', selectedCharacterId)
        .order('name')
      if (invData) setCharacterInventory(invData)

      const { data: equipData } = await supabase
        .from('equipment_items')
        .select('*')
        .eq('character_id', selectedCharacterId)
      if (equipData) setCharacterEquipment(equipData)

    } catch (error) {
      console.error('Error populating starting gear:', error)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0908] text-stone-200 overflow-hidden">
      {/* Navigation links */}
      <div className="fixed top-4 right-4 z-[60] flex gap-2">
        <Link 
          href="/world-ai"
          className="p-2 bg-[#1a1614]/90 border border-[#3d3428]/60 rounded-lg text-stone-500 hover:text-[#e0651a] hover:border-[#e0651a]/30 transition-all group flex items-center gap-1.5"
          title="World AI — Campaign Engine"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e0651a] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e0651a]" />
          </span>
          <span className="text-xs font-serif tracking-wide hidden sm:inline">WORLD AI</span>
        </Link>
        <Link 
          href="/admin"
          className="p-2 bg-[#1a1614]/90 border border-[#3d3428]/60 rounded-lg text-stone-500 hover:text-[#c4a777] hover:border-[#c4a777]/30 transition-all group"
          title="Content Manager"
        >
          <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
        </Link>
      </div>

      {/* Smoke/fog overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
      </div>

      {/* Main dashboard grid */}
      <div className="h-screen p-2 grid grid-cols-1 lg:grid-cols-[320px_1fr_380px] gap-2">
        <LeftColumn
          environment={environmentData}
          characterId={selectedCharacterId ?? undefined}
          campaignId="ashes_of_prometheus"
          characterAvatar={selectedCharacter?.avatar_image_url}
          characterName={selectedCharacter?.name}
          onDialogueSubmit={(message) => {
            // Push player dialogue to telemetry
            handleTelemetryPush('DIALOGUE', message)
          }}
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
          onPopulateStartingGear={handlePopulateStartingGear}
        />
      </div>

      {/* Dice Roll Modal */}
      <DiceRollModal
        isOpen={diceModalOpen}
        onClose={() => {
          setDiceModalOpen(false)
          setCurrentRollRequest(null)
        }}
        rollRequest={currentRollRequest}
        onRollComplete={handleDiceRollComplete}
      />
    </div>
  )
}
