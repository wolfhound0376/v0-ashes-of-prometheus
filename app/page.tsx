"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Settings, Sparkles, X, Save, RotateCcw } from "lucide-react"
import { LeftColumn } from "@/components/dashboard/left-column"
import { CenterColumn } from "@/components/dashboard/center-column"
import { RightColumn } from "@/components/dashboard/right-column"
import { WorldAIPanel } from "@/components/world-ai"
import { MusicPlayer } from "@/components/dashboard/music-player"
import { DynamicMusic } from "@/components/dashboard/dynamic-music"
import { characterData, dialogueData, actionsData, inventoryData, environmentData, getClassActions } from "@/lib/game-data"
import { useTelemetry } from "@/lib/hooks/use-telemetry"
import { createClient } from "@/lib/supabase/client"
import { useLich } from "@/lib/hooks/use-lich"
import { usePanelAssets } from "@/lib/hooks/use-panel-assets"
import { CAMPAIGNS } from "@/lib/world-ai/campaigns"
import type { Character, InventoryItem, EquipmentItem, Environment } from "@/lib/types/database"
import type { Campaign } from "@/lib/world-ai/campaigns"

export default function DashboardPage() {
  const supabase = createClient()

  // Admin-managed per-panel background/overlay overrides (dashboard_assets).
  // Environments remain the primary source; these only apply when a row matches.
  const { resolvePanelAsset } = usePanelAssets()

  // Character selection state
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [characterInventory, setCharacterInventory] = useState<InventoryItem[]>([])
  const [characterEquipment, setCharacterEquipment] = useState<EquipmentItem[]>([])
  const [npcEncounters, setNpcEncounters] = useState<{ id: string; name: string; description: string | null; portrait_url: string | null; face_url: string | null; voice_id: string | null; voice_description: string | null; is_active: boolean; hp_current: number | null; hp_max: number | null; challenge_rating: number | null }[]>([])
  const [loadingCharacters, setLoadingCharacters] = useState(true)

  // Current environment from database
  const [currentEnvironment, setCurrentEnvironment] = useState<Environment | null>(null)

  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [dialogueInput, setDialogueInput] = useState("")
  const [dialogue, setDialogue] = useState<{ speaker: string; text: string }[]>([])
  const [npcImageUrl, setNpcImageUrl] = useState<string | null>(null)
  const [sceneImageUrl, setSceneImageUrl] = useState<string | null>(null)
  // TTS mute state - persisted in localStorage, loaded after mount to avoid hydration mismatch
  const [isTTSMuted, setIsTTSMuted] = useState(false)
  useEffect(() => {
    setIsTTSMuted(localStorage.getItem("tts-muted") === "true")
  }, [])
  const toggleTTSMute = useCallback(() => {
    setIsTTSMuted(prev => {
      const next = !prev
      localStorage.setItem("tts-muted", String(next))
      return next
    })
  }, [])

  // World AI panel state
  const [worldAIPanelOpen, setWorldAIPanelOpen] = useState(false)
  const [showCampaignChangeDialog, setShowCampaignChangeDialog] = useState(false)
  const [pendingCampaignChange, setPendingCampaignChange] = useState<Campaign | null>(null)

  // Save/Restart campaign state
  const [showRestartDialog, setShowRestartDialog] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Default campaign is Out of the Abyss
  const [activeCampaign, setActiveCampaign] = useState<Campaign>(CAMPAIGNS["abyss"])

  // Simple lich connection - uses Vercel AI Gateway, stores dialogue in Supabase
  const { sendMessage: sendToLich, isLoading: lichLoading } = useLich(activeCampaign.id)


  // Handle campaign change with confirmation
  const handleCampaignChange = (newCampaign: Campaign) => {
    if (newCampaign.id === activeCampaign.id) return
    setPendingCampaignChange(newCampaign)
    setShowCampaignChangeDialog(true)
  }

  // Confirm campaign change - clears dialogue and restarts
  const confirmCampaignChange = async () => {
    if (!pendingCampaignChange) return

    // Clear all dialogue from the database
    const { error } = await supabase
      .from('dialogue')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (error) {
      console.error('Error clearing dialogue:', error)
    }

    // Clear local dialogue state
    setDialogue([])

    // Set the new campaign
    setActiveCampaign(pendingCampaignChange)

    // Close dialog
    setShowCampaignChangeDialog(false)
    setPendingCampaignChange(null)
  }

  const cancelCampaignChange = () => {
    setShowCampaignChangeDialog(false)
    setPendingCampaignChange(null)
  }

  // Save campaign - stores dialogue, inventory, and character state
  const handleSaveCampaign = async () => {
    if (!selectedCharacter) return

    setIsSaving(true)
    setSaveMessage(null)

    try {
      // Get current inventory
      const { data: inventoryData } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('character_id', selectedCharacter.id)

      // Create save
      const { error } = await supabase
        .from('campaign_saves')
        .insert({
          campaign_id: activeCampaign.id,
          save_name: `${activeCampaign.name} - ${new Date().toLocaleString()}`,
          dialogue_snapshot: dialogue,
          inventory_snapshot: inventoryData || [],
          character_snapshot: {
            id: selectedCharacter.id,
            name: selectedCharacter.name,
            class: selectedCharacter.class,
            level: selectedCharacter.level,
            hp_current: selectedCharacter.hp_current,
            hp_max: selectedCharacter.hp_max,
          },
          campaign_metadata: {
            savedAt: new Date().toISOString(),
          }
        })

      if (error) throw error

      setSaveMessage("Campaign saved!")
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (err) {
      console.error('Error saving campaign:', err)
      setSaveMessage("Failed to save")
      setTimeout(() => setSaveMessage(null), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  // Restart campaign - confirms then clears dialogue and inventory
  const handleRestartCampaign = () => {
    setShowRestartDialog(true)
  }

  const confirmRestartCampaign = async () => {
    if (!selectedCharacter) return

    try {
      // Clear all dialogue
      await supabase
        .from('dialogue')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      // Clear character inventory
      await supabase
        .from('inventory_items')
        .delete()
        .eq('character_id', selectedCharacter.id)

      // Reset local state
      setDialogue([])
      setCharacterInventory([])

      // Close dialog
      setShowRestartDialog(false)
    } catch (err) {
      console.error('Error restarting campaign:', err)
    }
  }

  const cancelRestartCampaign = () => {
    setShowRestartDialog(false)
  }

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

  // Fetch characters and environment from Supabase on mount
  useEffect(() => {
    async function fetchCharacters() {
      setLoadingCharacters(true)
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .order('character_type', { ascending: false })
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

    async function fetchEnvironment() {
      // Fetch the current/active environment
      const { data, error } = await supabase
        .from('environments')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        console.error('Error fetching environment:', error)
      } else if (data) {
        setCurrentEnvironment(data)
      }
    }

    fetchCharacters()
    fetchEnvironment()
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

    // Subscribe to real-time updates for dialogue and environment
    const dialogueChannel = supabase
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

    // Subscribe to environment changes (when Malachar or admin changes location)
    const environmentChannel = supabase
      .channel('environment-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'environments' },
        async () => {
          // Refetch the current environment on any change
          const { data } = await supabase
            .from('environments')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .single()

          if (data) {
            setCurrentEnvironment(data)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(dialogueChannel)
      supabase.removeChannel(environmentChannel)
    }
  }, [])

  // Fetch character data function - callable from multiple places
  const fetchCharacterData = useCallback(async () => {
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

    // Refresh character to get updated XP
    const { data: charData } = await supabase
      .from('characters')
      .select('*')
      .eq('id', selectedCharacterId)
      .single()

    if (charData) {
      setCharacters(prev => prev.map(c => c.id === selectedCharacterId ? charData : c))
    }

    // Fetch active NPC encounters
    const { data: npcData } = await supabase
      .from('npc_encounters')
      .select('id, name, description, portrait_url, face_url, voice_id, voice_description, is_active, hp_current, hp_max, challenge_rating')
      .eq('character_id', selectedCharacterId)
      .eq('is_active', true)

    if (npcData) setNpcEncounters(npcData)
  }, [selectedCharacterId])

  // Fetch inventory and equipment when character changes
  useEffect(() => {
    fetchCharacterData()
  }, [fetchCharacterData])

  // Subscribe to inventory + equipment changes for the active character so
  // admin edits and Lich-awarded items push live without a page refresh.
  useEffect(() => {
    if (!selectedCharacterId) return

    const inventoryChannel = supabase
      .channel(`inventory-${selectedCharacterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items', filter: `character_id=eq.${selectedCharacterId}` },
        () => { fetchCharacterData() }
      )
      .subscribe()

    const equipmentChannel = supabase
      .channel(`equipment-${selectedCharacterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'equipment_items', filter: `character_id=eq.${selectedCharacterId}` },
        () => { fetchCharacterData() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(inventoryChannel)
      supabase.removeChannel(equipmentChannel)
    }
  }, [selectedCharacterId, fetchCharacterData])

  // Get the currently selected character
  const selectedCharacter = characters.find(c => c.id === selectedCharacterId)

  // In combat when any active NPC has a Challenge Rating above 0 (monsters, not friendly prisoners).
  const inCombat = npcEncounters.some(n => n.is_active && (n.challenge_rating ?? 0) > 0)

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

      // Optimistically add player message to dialogue immediately
      const playerName = selectedCharacter?.name || "Player"
      setDialogue(prev => [...prev, { speaker: playerName, text }])

      // Send to the Lich
      const response = await sendToLich(text)
      if (response?.text) {
        // Optimistically add Malachar's response
        setDialogue(prev => [...prev, { speaker: "Malachar", text: response.text }])

        // Update images if returned
        if (response.npcImageUrl) {
          setNpcImageUrl(response.npcImageUrl)
        }
        if (response.locationImageUrl) {
          setSceneImageUrl(response.locationImageUrl)
        }
        // Refresh NPC encounters so the center column shows newly encountered NPCs
        await fetchCharacterData()
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
          equipped: true,
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
      {/* Campaign Controls */}
      <div className="fixed top-4 right-4 z-[60] flex items-center gap-2">
        {/* Save message toast */}
        {saveMessage && (
          <div className="px-3 py-1.5 bg-[#1a1614]/95 border border-[#3d3428] rounded-lg text-sm text-[#d4b15a] animate-in fade-in slide-in-from-right-2">
            {saveMessage}
          </div>
        )}

        {/* Save Campaign */}
        <button
          onClick={handleSaveCampaign}
          disabled={isSaving}
          className="p-2 bg-[#1a1614]/90 border border-[#3d3428]/60 rounded-lg text-stone-500 hover:text-emerald-400 hover:border-emerald-400/30 transition-all group disabled:opacity-50"
          title="Save Campaign"
        >
          <Save className={`w-5 h-5 transition-transform duration-300 ${isSaving ? 'animate-pulse' : 'group-hover:scale-110'}`} />
        </button>

        {/* Restart Campaign */}
        <button
          onClick={handleRestartCampaign}
          className="p-2 bg-[#1a1614]/90 border border-[#3d3428]/60 rounded-lg text-stone-500 hover:text-red-400 hover:border-red-400/30 transition-all group"
          title="Restart Campaign"
        >
          <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
        </button>

        {/* World AI Toggle */}
        <button
          onClick={() => setWorldAIPanelOpen(!worldAIPanelOpen)}
          className={`p-2 bg-[#1a1614]/90 border rounded-lg transition-all group ${
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
            campaign={activeCampaign}
            onCampaignChange={handleCampaignChange}
            onLocationChange={(location) => {
              // Update environment data when location changes in World AI
              // Malachar manages location progression
            }}
            className="h-full"
          />
        </div>
      </div>

      {/* Main dashboard grid */}
      <div className="h-screen p-2 grid grid-cols-1 lg:grid-cols-[320px_1fr_380px] gap-2">
<LeftColumn
  environment={(() => {
    // dashboard_assets override for the environment scene (panel_type "left_column").
    // Precedence: live in-play scene image > admin dashboard override > environment
    // table > static fallback. Overlay/animation override the environment's fog.
    const bgOverride = resolvePanelAsset("left_column", "background")
    const overlayOverride = resolvePanelAsset("left_column", "overlay")
    return {
      location: currentEnvironment?.name || environmentData.location,
      timeOfDay: currentEnvironment?.time_of_day || environmentData.timeOfDay,
      backgroundImageUrl:
        sceneImageUrl ||
        bgOverride?.fileUrl ||
        currentEnvironment?.background_image_url ||
        "/images/scenes/velkynvelve-slave-pen.jpg",
      fogOverlayUrl: overlayOverride?.fileUrl || currentEnvironment?.fog_overlay_url,
      ambientAnimation:
        overlayOverride?.animationCss || currentEnvironment?.ambient_animation,
      description: currentEnvironment?.description,
    }
  })()}
  dialogue={dialogue}
  dialogueInput={dialogueInput}
  setDialogueInput={setDialogueInput}
  onDialogueSubmit={handleDialogueSubmit}
  characterAvatar={selectedCharacter?.avatar_image_url}
  characterName={selectedCharacter?.name}
  isWorldAIThinking={lichLoading}
  isTTSMuted={isTTSMuted}
/>
          <CenterColumn
            selectedAction={selectedAction}
            onActionSelect={handleActionSelect}
            actions={actionsData}
            resources={resources}
            availableActionIds={availableActionIds}
            onTelemetryPush={handleTelemetryPush}
            characterClass={selectedCharacter?.class}
            characterLevel={selectedCharacter?.level}
            characterName={selectedCharacter?.name}
            sceneImageUrl={npcImageUrl || undefined}
            npcEncounters={npcEncounters}
            dialogue={dialogue}
          onSendToLich={async (message) => {
            // Optimistically add player message to dialogue immediately
            const playerName = selectedCharacter?.name || "Player"
            setDialogue(prev => [...prev, { speaker: playerName, text: message }])

            // Send to Lich
            const response = await sendToLich(message)
            if (response) {
              // Optimistically add Malachar's response to dialogue
              if (response.text) {
                setDialogue(prev => [...prev, { speaker: "Malachar", text: response.text }])
              }
              // Update NPC image if the response includes one
              if (response.npcImageUrl) {
                setNpcImageUrl(response.npcImageUrl)
              }
              // Update scene image if the location changed
              if (response.locationImageUrl) {
                setSceneImageUrl(response.locationImageUrl)
              }
              // Optimistically update environment if location changed
              if (response.updatedLocation) {
                setCurrentEnvironment(prev => ({
                  ...prev,
                  name: response.updatedLocation,
                  background_image_url: response.locationImageUrl || prev?.background_image_url,
                } as any))
              }
              // Refresh character data to pick up any XP or items from the Lich
              await fetchCharacterData()
            }
          }}
        />
<RightColumn
  characters={characters}
  selectedCharacterId={selectedCharacterId}
  onCharacterSelect={setSelectedCharacterId}
  selectedCharacter={selectedCharacter}
  characterInventory={characterInventory}
  characterEquipment={characterEquipment}
  loading={loadingCharacters}
  onEquipItem={async (itemId, slot) => {
    if (!selectedCharacterId) return
    const item = characterInventory.find(i => i.id === itemId)
    if (!item) return
    // Replace anything already in this slot (one item per slot)
    await supabase
      .from('equipment_items')
      .delete()
      .eq('character_id', selectedCharacterId)
      .eq('slot', slot)
    const { error } = await supabase.from('equipment_items').insert({
      character_id: selectedCharacterId,
      slot,
      name: item.name,
      icon_url: item.icon_url,
      equipped: true,
      description: item.description,
      stats_bonus: {},
    })
    if (error) console.error('[equip] insert failed:', error)
    fetchCharacterData()
  }}
  onUnequipItem={async (slot) => {
    if (!selectedCharacterId) return
    const { error } = await supabase
      .from('equipment_items')
      .delete()
      .eq('character_id', selectedCharacterId)
      .eq('slot', slot)
    if (error) console.error('[unequip] delete failed:', error)
    fetchCharacterData()
  }}
  onAddXP={async (characterId, amount, reason) => {
    // Add XP to character and record in history
    const { error } = await supabase.rpc('add_character_xp', {
      p_character_id: characterId,
      p_amount: amount,
      p_reason: reason
    })
    if (!error) {
      // Refresh character data
      fetchCharacterData()
    }
  }}
  onLevelUp={async (characterId) => {
    // Level up the character
    const character = characters.find(c => c.id === characterId)
    if (character && character.level < 20) {
      const { error } = await supabase
        .from('characters')
        .update({ level: character.level + 1 })
        .eq('id', characterId)
      if (!error) {
        fetchCharacterData()
        // Notify the Lich
        setDialogue(prev => [...prev, {
          speaker: "System",
          text: `${character.name} has reached Level ${character.level + 1}!`
        }])
      }
    }
  }}
/>
      </div>

      {/* Campaign Change Confirmation Dialog */}
      {showCampaignChangeDialog && pendingCampaignChange && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1614] border border-[#3d3428] rounded-lg p-6 max-w-md mx-4 shadow-2xl">
            <h2 className="text-xl font-serif text-[#d4b15a] mb-3">Change Campaign?</h2>
            <p className="text-stone-300 mb-4">
              Switching to <span className="text-[#e0651a] font-semibold">{pendingCampaignChange.name}</span> will clear all dialogue history and restart your session with Malachar.
            </p>
            <p className="text-stone-400 text-sm mb-6">
              Your character data will be preserved. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelCampaignChange}
                className="px-4 py-2 rounded bg-[#2a2520] border border-[#3d3428] text-stone-400 hover:text-stone-200 hover:border-stone-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmCampaignChange}
                className="px-4 py-2 rounded bg-[#e0651a]/20 border border-[#e0651a]/50 text-[#e0651a] hover:bg-[#e0651a]/30 transition-colors"
              >
                Change Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restart Campaign Confirmation Dialog */}
      {showRestartDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1614] border border-[#3d3428] rounded-lg p-6 max-w-md mx-4 shadow-2xl">
            <h2 className="text-xl font-serif text-red-400 mb-3">Restart Campaign?</h2>
            <p className="text-stone-300 mb-4">
              This will <span className="text-red-400 font-semibold">permanently delete</span> all dialogue history and remove all items from your inventory.
            </p>
            <p className="text-stone-400 text-sm mb-6">
              Your character stats will be preserved, but you will start fresh in <span className="text-[#d4b15a]">{activeCampaign.name}</span>. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelRestartCampaign}
                className="px-4 py-2 rounded bg-[#2a2520] border border-[#3d3428] text-stone-400 hover:text-stone-200 hover:border-stone-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRestartCampaign}
                className="px-4 py-2 rounded bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                Restart Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TTS Mute Toggle */}
      <MusicPlayer
        isTTSMuted={isTTSMuted}
        onToggleTTSMute={toggleTTSMute}
      />

      {/* Scene-driven background music */}
      <DynamicMusic
        location={currentEnvironment?.name || environmentData.location}
        inCombat={inCombat}
      />
    </div>
  )
}
