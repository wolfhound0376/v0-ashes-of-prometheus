"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Settings, Sparkles, X } from "lucide-react"
import { LeftColumn } from "@/components/dashboard/left-column"
import { CenterColumn } from "@/components/dashboard/center-column"
import { RightColumn } from "@/components/dashboard/right-column"
import { WorldAIPanel } from "@/components/world-ai"
import { characterData, dialogueData, actionsData, inventoryData, environmentData, getClassActions } from "@/lib/game-data"
import { useTelemetry } from "@/lib/hooks/use-telemetry"
import { createClient } from "@/lib/supabase/client"
import type { Character, InventoryItem, EquipmentItem } from "@/lib/types/database"
import type { Campaign } from "@/lib/world-ai/campaigns"

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
  const [dialogue, setDialogue] = useState<{ speaker: string; text: string }[]>([])
  
  // World AI panel state
  const [worldAIPanelOpen, setWorldAIPanelOpen] = useState(false)
  const [currentCampaign, setCurrentCampaign] = useState<Campaign | null>(null)
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

  // Fetch dialogue from Supabase and subscribe to real-time updates
  useEffect(() => {
    // Initial fetch
    async function fetchDialogue() {
      const { data, error } = await supabase
        .from('dialogue')
        .select('speaker, text')
        .order('created_at', { ascending: true })
        .limit(50)
      
      if (error) {
        console.error('Error fetching dialogue:', error)
      } else if (data) {
        setDialogue(data)
      }
    }
    fetchDialogue()

    // Subscribe to real-time updates
    const channel = supabase
      .channel('dialogue-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dialogue' },
        (payload) => {
          const newEntry = payload.new as { speaker: string; text: string }
          setDialogue(prev => [...prev, { speaker: newEntry.speaker, text: newEntry.text }])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
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

  const handleDialogueSubmit = async () => {
    if (dialogueInput.trim()) {
      const text = dialogueInput.trim()
      setDialogueInput("")
      
      // Save to Supabase - real-time subscription will update the UI
      const { error } = await supabase
        .from('dialogue')
        .insert({
          speaker: "You",
          text,
          source: "player",
        })
      
      if (error) {
        console.error('Error saving dialogue:', error)
        // Fallback: add locally if save fails
        setDialogue(prev => [...prev, { speaker: "You", text }])
      }
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
      {/* World AI Toggle Button */}
      <button
        onClick={() => setWorldAIPanelOpen(!worldAIPanelOpen)}
        className={`fixed top-4 right-16 z-[60] p-2 bg-[#1a1614]/90 border rounded-lg transition-all group ${
          worldAIPanelOpen 
            ? "border-[#e0651a] text-[#e0651a] shadow-[0_0_15px_rgba(224,101,26,0.3)]" 
            : "border-[#3d3428]/60 text-stone-500 hover:text-[#d4b15a] hover:border-[#d4b15a]/30"
        }`}
        title="World AI - Campaign Engine"
      >
        <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
      </button>
      
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

      {/* World AI Slide-out Panel */}
      <div 
        className={`fixed top-0 right-0 h-full w-[420px] max-w-[90vw] z-[55] transition-transform duration-300 ease-in-out ${
          worldAIPanelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full bg-gradient-to-b from-[#1a1614] to-[#0d0b0a] border-l border-[#3d3428]/60 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          {/* Close button */}
          <button
            onClick={() => setWorldAIPanelOpen(false)}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-sm bg-[#1a1614] border border-[#3d3428]/60 text-stone-500 hover:text-[#e0651a] hover:border-[#e0651a]/40 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
          
          <WorldAIPanel 
            onCampaignChange={(campaign) => setCurrentCampaign(campaign)}
            onLocationChange={(location) => {
              // Update environment data when location changes in World AI
              console.log("[v0] World AI location changed:", location)
            }}
            className="h-full"
          />
        </div>
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
          onPopulateStartingGear={handlePopulateStartingGear}
        />
      </div>
    </div>
  )
}
