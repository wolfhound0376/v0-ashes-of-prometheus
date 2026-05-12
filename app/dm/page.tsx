"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { LichCharacter } from "@/components/dm/lich-character"
import { CastleBackground } from "@/components/dm/castle-background"
import { DialogueDisplay } from "@/components/dm/dialogue-display"
import { DMControls } from "@/components/dm/dm-controls"
import { ConnectionStatus } from "@/components/dm/connection-status"
import Link from "next/link"
import { ArrowLeft, Settings, Volume2, VolumeX } from "lucide-react"

// Types for telemetry and dialogue
interface TelemetryData {
  id: string
  character_id: string
  campaign_id: string
  action_type: string | null
  intent_vector: string | null
  last_roll: number | null
  hp: number | null
  max_hp: number | null
  position: { x: number; y: number } | null
  environment: string | null
  created_at: string
}

interface DialogueEntry {
  id: string
  speaker: string
  speaker_type: string
  message: string
  emotion: string | null
  created_at: string
}

interface CharacterData {
  id: string
  name: string
  class: string
  level: number
  current_hp: number
  max_hp: number
}

export default function DMLayerPage() {
  const supabase = createClient()
  
  // State
  const [isConnected, setIsConnected] = useState(false)
  const [lichState, setLichState] = useState<'idle' | 'speaking' | 'thinking' | 'casting'>('idle')
  const [currentDialogue, setCurrentDialogue] = useState<string>("")
  const [dialogueHistory, setDialogueHistory] = useState<DialogueEntry[]>([])
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryData | null>(null)
  const [activeCharacter, setActiveCharacter] = useState<CharacterData | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  
  // Refs
  const dialogueEndRef = useRef<HTMLDivElement>(null)

  // Fetch initial data and set up real-time subscriptions
  useEffect(() => {
    const init = async () => {
      // Fetch latest telemetry
      const { data: telemetry } = await supabase
        .from('session_telemetry')
        .select('*')
        .eq('campaign_id', 'ashes_of_prometheus')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (telemetry) {
        setLatestTelemetry(telemetry)
        
        // Fetch character data
        if (telemetry.character_id) {
          const { data: character } = await supabase
            .from('characters')
            .select('*')
            .eq('id', telemetry.character_id)
            .single()
          
          if (character) setActiveCharacter(character)
        }
      }

      // Fetch dialogue history
      const { data: dialogue } = await supabase
        .from('story_dialogue')
        .select('*')
        .eq('campaign_id', 'ashes_of_prometheus')
        .order('sequence_number', { ascending: true })
        .limit(50)
      
      if (dialogue) setDialogueHistory(dialogue)
      
      setIsConnected(true)
    }

    init()

    // Real-time subscription for telemetry updates
    const telemetryChannel = supabase
      .channel('dm-telemetry')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_telemetry' },
        (payload) => {
          const newTelemetry = payload.new as TelemetryData
          if (newTelemetry.campaign_id === 'ashes_of_prometheus') {
            setLatestTelemetry(newTelemetry)
            // Trigger Lich thinking animation when new action received
            setLichState('thinking')
            setTimeout(() => setLichState('idle'), 2000)
          }
        }
      )
      .subscribe()

    // Real-time subscription for dialogue updates
    const dialogueChannel = supabase
      .channel('dm-dialogue')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'story_dialogue' },
        (payload) => {
          const newDialogue = payload.new as DialogueEntry
          if (newDialogue.campaign_id === 'ashes_of_prometheus') {
            setDialogueHistory(prev => [...prev, newDialogue])
            
            // If it's a DM message, show the Lich speaking
            if (newDialogue.speaker_type === 'dm') {
              setLichState('speaking')
              setCurrentDialogue(newDialogue.message)
              setTimeout(() => setLichState('idle'), 5000)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(telemetryChannel)
      supabase.removeChannel(dialogueChannel)
    }
  }, [])

  // Auto-scroll dialogue
  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [dialogueHistory])

  // Send DM message
  const sendLichMessage = async (message: string, emotion: string = 'threatening') => {
    setLichState('speaking')
    setCurrentDialogue(message)
    
    await supabase.from('story_dialogue').insert({
      campaign_id: 'ashes_of_prometheus',
      speaker: 'The Lich',
      speaker_type: 'dm',
      message,
      emotion,
      requires_response: true,
      response_type: 'dialogue'
    })
    
    setTimeout(() => setLichState('idle'), 5000)
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Castle Background */}
      <CastleBackground />
      
      {/* Atmospheric Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />
      
      {/* Fog/Mist Effect */}
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[#1a1520]/80 to-transparent animate-pulse" 
             style={{ animationDuration: '8s' }} />
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/"
            className="p-2 bg-black/40 backdrop-blur border border-purple-900/30 rounded-lg text-stone-400 hover:text-purple-400 hover:border-purple-500/50 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          
          <div className="flex flex-col">
            <h1 className="text-lg font-serif text-purple-200 tracking-wider">THE LICH</h1>
            <span className="text-[10px] text-stone-500 tracking-widest uppercase">Dungeon Master • Layer 1</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ConnectionStatus isConnected={isConnected} />
          
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 bg-black/40 backdrop-blur border border-purple-900/30 rounded-lg text-stone-400 hover:text-purple-400 transition-all"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 bg-black/40 backdrop-blur border border-purple-900/30 rounded-lg text-stone-400 hover:text-purple-400 transition-all"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative h-full flex flex-col items-center justify-center pt-20 pb-32">
        {/* Lich Character */}
        <div className="relative flex-1 flex items-center justify-center w-full max-w-2xl">
          <LichCharacter 
            state={lichState} 
            currentDialogue={currentDialogue}
          />
        </div>

        {/* Current Character Info */}
        {activeCharacter && (
          <div className="absolute top-24 left-4 p-3 bg-black/60 backdrop-blur border border-purple-900/30 rounded-lg">
            <p className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Active Mortal</p>
            <p className="text-sm text-purple-200 font-serif">{activeCharacter.name}</p>
            <p className="text-xs text-stone-400">
              Level {activeCharacter.level} {activeCharacter.class}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 bg-stone-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all"
                  style={{ width: `${(activeCharacter.current_hp / activeCharacter.max_hp) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-red-400">
                {activeCharacter.current_hp}/{activeCharacter.max_hp}
              </span>
            </div>
          </div>
        )}

        {/* Latest Action Feed */}
        {latestTelemetry && (
          <div className="absolute top-24 right-4 p-3 bg-black/60 backdrop-blur border border-purple-900/30 rounded-lg max-w-xs">
            <p className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Latest Action</p>
            <p className="text-sm text-purple-200 font-serif">
              {latestTelemetry.action_type?.replace(/_/g, ' ') || 'Awaiting...'}
            </p>
            {latestTelemetry.last_roll && (
              <p className="text-xs text-amber-400 mt-1">
                Rolled: {latestTelemetry.last_roll}
              </p>
            )}
            {latestTelemetry.intent_vector && (
              <p className="text-xs text-stone-400 mt-1 italic line-clamp-2">
                &quot;{latestTelemetry.intent_vector}&quot;
              </p>
            )}
          </div>
        )}
      </main>

      {/* Dialogue Display */}
      <DialogueDisplay 
        dialogueHistory={dialogueHistory}
        dialogueEndRef={dialogueEndRef}
      />

      {/* DM Controls (for testing/manual control) */}
      <DMControls 
        onSendMessage={sendLichMessage}
        lichState={lichState}
        setLichState={setLichState}
      />
    </div>
  )
}
