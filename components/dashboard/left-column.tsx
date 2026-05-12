"use client"

import { useEffect, useRef, useState } from "react"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { Sun, MessageSquare, Scroll, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

// Dialogue entry from Supabase
interface StoryDialogue {
  id: string
  speaker: string
  speaker_type: 'dm' | 'player' | 'npc' | 'system'
  message: string
  emotion?: string
  requires_response?: boolean
  response_type?: string
  created_at: string
  sequence_number: number
}

interface LeftColumnProps {
  environment: {
    location: string
    timeOfDay: string
    description?: string
  }
  characterId?: string
  campaignId?: string
  characterAvatar?: string | null
  characterName?: string
  onDialogueSubmit?: (message: string) => void
}

export function LeftColumn({
  environment,
  characterId,
  campaignId = 'ashes_of_prometheus',
  characterAvatar,
  characterName,
  onDialogueSubmit,
}: LeftColumnProps) {
  const [dialogue, setDialogue] = useState<StoryDialogue[]>([])
  const [dialogueInput, setDialogueInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const dialogueEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Fetch initial dialogue and subscribe to real-time updates
  useEffect(() => {
    const fetchDialogue = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('story_dialogue')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('sequence_number', { ascending: true })
        .limit(100)

      if (error) {
        console.error('Error fetching dialogue:', error)
      } else {
        setDialogue(data || [])
      }
      setLoading(false)
    }

    fetchDialogue()

    // Subscribe to real-time updates for new DM messages
    const channel = supabase
      .channel('story_dialogue_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'story_dialogue',
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          const newMessage = payload.new as StoryDialogue
          setDialogue((prev) => [...prev, newMessage])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [campaignId])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [dialogue])

  // Submit player response
  const handleSubmit = async () => {
    if (!dialogueInput.trim()) return

    setSending(true)
    const message = dialogueInput.trim()
    setDialogueInput("")

    // Insert player message into Supabase
    const { error } = await supabase.from('story_dialogue').insert({
      character_id: characterId || null,
      campaign_id: campaignId,
      speaker: characterName || 'Player',
      speaker_type: 'player',
      message: message,
    })

    if (error) {
      console.error('Error sending message:', error)
      setDialogueInput(message) // Restore on error
    }

    // Callback for parent component
    if (onDialogueSubmit) {
      onDialogueSubmit(message)
    }

    setSending(false)
  }

  // Get speaker styling based on type
  const getSpeakerStyle = (entry: StoryDialogue) => {
    switch (entry.speaker_type) {
      case 'dm':
        return 'text-[#c9a868]' // Gold for DM/Lich
      case 'player':
        return 'text-[#7aa8c8]' // Blue for player
      case 'npc':
        return 'text-[#a8c878]' // Green for NPCs
      case 'system':
        return 'text-[#888888] italic' // Gray for system messages
      default:
        return 'text-[#c9a868]'
    }
  }

  // Get message styling based on emotion
  const getMessageStyle = (entry: StoryDialogue) => {
    if (entry.speaker_type === 'system') return 'text-stone-500 italic text-xs'
    
    switch (entry.emotion) {
      case 'threatening':
        return 'text-red-300'
      case 'mysterious':
        return 'text-purple-300'
      case 'helpful':
        return 'text-green-300'
      default:
        return 'text-stone-300'
    }
  }

  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      <FantasyPanel title="Avatar / Environment" className="flex-shrink-0">
        {/* Environment/Avatar Scene */}
        <div className="relative h-[280px] overflow-hidden">
          {/* Gradient placeholder for village scene */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#2a4a5a] via-[#1a3040] to-[#0f1a20]">
            {/* Sky gradient */}
            <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#4a6a7a]/60 to-transparent" />
            
            {/* Mountains silhouette */}
            <div className="absolute bottom-1/3 left-0 right-0 h-20">
              <svg viewBox="0 0 400 80" className="w-full h-full opacity-40">
                <path d="M0,80 L50,30 L100,60 L150,20 L200,50 L250,25 L300,55 L350,15 L400,45 L400,80 Z" fill="#1a2a30" />
              </svg>
            </div>
            
            {/* Trees/Village silhouette */}
            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#0a1015] via-[#152025] to-transparent" />
            
            {/* Character avatar or silhouette placeholder */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-64 flex items-end justify-center">
              {characterAvatar ? (
                <>
                  <img 
                    src={characterAvatar} 
                    alt={characterName || "Character"} 
                    className="max-w-full max-h-full object-contain drop-shadow-[0_0_25px_rgba(100,150,200,0.5)]"
                  />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-28 h-16 bg-[#6aa0c0]/25 rounded-full blur-xl" />
                </>
              ) : (
                <>
                  <div className="w-32 h-56 bg-gradient-to-b from-[#3a5060] to-[#1a2a35] rounded-t-full opacity-80 shadow-[0_0_30px_rgba(100,150,200,0.3)]" />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-16 bg-[#6aa0c0]/20 rounded-full blur-xl" />
                </>
              )}
            </div>
          </div>

          {/* Location overlay card */}
          <div className="absolute top-3 left-3 bg-[#0d0b0a]/90 border border-[#3d3428]/80 rounded-sm px-3 py-1.5 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm font-serif text-[#e8dcc8] font-medium">{environment.location}</p>
                <div className="flex items-center gap-1 text-xs text-[#a89878]">
                  <Sun className="w-3 h-3" />
                  <span>{environment.timeOfDay}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </FantasyPanel>

      {/* Story Dialogue Log - DM Prompts from the Lich */}
      <FantasyPanel 
        title={
          <span className="flex items-center gap-2">
            <Scroll className="w-4 h-4 text-[#c9a868]" />
            Story Dialogue
          </span>
        } 
        className="flex-1 min-h-0 flex flex-col"
      >
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-[#3d3428] scrollbar-track-transparent">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-[#8b7355] animate-spin" />
            </div>
          ) : dialogue.length === 0 ? (
            <div className="text-center py-8 text-stone-500 text-sm italic">
              The ancient tome lies open, awaiting the Lich&apos;s words...
            </div>
          ) : (
            dialogue.map((entry) => (
              <div 
                key={entry.id} 
                className={`text-sm ${entry.speaker_type === 'dm' ? 'pl-0' : 'pl-4'}`}
              >
                {entry.speaker_type === 'system' ? (
                  <p className={getMessageStyle(entry)}>{entry.message}</p>
                ) : (
                  <>
                    <span className={`font-serif font-semibold ${getSpeakerStyle(entry)}`}>
                      {entry.speaker}:
                    </span>
                    <span className={`ml-2 ${getMessageStyle(entry)}`}>
                      {entry.message}
                    </span>
                  </>
                )}
                
                {/* Response prompt indicator */}
                {entry.requires_response && entry.speaker_type === 'dm' && (
                  <div className="mt-1 text-xs text-[#c9a868]/60 italic">
                    {entry.response_type === 'roll' 
                      ? '(A dice roll is required)' 
                      : entry.response_type === 'action'
                        ? '(Select an action)'
                        : '(Awaiting your response...)'}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={dialogueEndRef} />
        </div>

        {/* Input area for player responses */}
        <div className="p-2 border-t border-[#3d3428]/60">
          <div className="flex items-center gap-2 bg-[#0a0908] border border-[#3d3428]/60 rounded-sm p-1">
            <input
              type="text"
              value={dialogueInput}
              onChange={(e) => setDialogueInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !sending && handleSubmit()}
              placeholder="Speak to the Lich..."
              disabled={sending}
              className="flex-1 bg-transparent text-sm text-stone-200 placeholder:text-stone-500 focus:outline-none px-2 py-1 disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={sending || !dialogueInput.trim()}
              className="p-1.5 rounded-sm bg-[#3d3428]/40 hover:bg-[#4d4438]/60 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 text-[#8b7355] animate-spin" />
              ) : (
                <MessageSquare className="w-4 h-4 text-[#8b7355] group-hover:text-[#c9b896] transition-colors" />
              )}
            </button>
          </div>
        </div>
      </FantasyPanel>
    </div>
  )
}
