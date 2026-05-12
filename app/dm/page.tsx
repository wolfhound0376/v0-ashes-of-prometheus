"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { LichCharacter } from "@/components/dm/lich-character"
import { CastleBackground } from "@/components/dm/castle-background"
import { DialogueDisplay } from "@/components/dm/dialogue-display"
import { DMControls } from "@/components/dm/dm-controls"
import { ConnectionStatus } from "@/components/dm/connection-status"
import { useRunwayAnimation, type AnimationState } from "@/lib/hooks/use-runway-animation"
import { useVecnaSpeech } from "@/lib/hooks/use-vecna-speech"
import { useEnvironmentVideo, type EnvironmentType } from "@/lib/hooks/use-environment-video"
import Link from "next/link"
import { ArrowLeft, Settings, Volume2, VolumeX, Video, Loader2, CheckCircle, XCircle, Sparkles, Mic, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"

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
  const [lichState, setLichState] = useState<AnimationState>('idle')
  const [currentDialogue, setCurrentDialogue] = useState<string>("")
  const [dialogueHistory, setDialogueHistory] = useState<DialogueEntry[]>([])
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryData | null>(null)
  const [activeCharacter, setActiveCharacter] = useState<CharacterData | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showRunwayPanel, setShowRunwayPanel] = useState(false)
  
  // Runway animation hook
  const {
    currentVideoUrl,
    currentTask,
    isGenerating,
    cachedAnimations,
    generateAnimation,
    playAnimation,
  } = useRunwayAnimation()
  
  // Speech hook for Vecna's voice
  const {
    speak,
    stop: stopSpeech,
    isSpeaking,
    isLoading: isSpeechLoading,
  } = useVecnaSpeech()
  
  // Environment video hook
  const {
    currentEnvironment,
    currentVideoUrl: envVideoUrl,
    cachedEnvironments,
    currentTask: envTask,
    isGenerating: isGeneratingEnv,
    generateEnvironment,
    switchEnvironment,
    environments,
  } = useEnvironmentVideo()
  
  const [showEnvironmentPanel, setShowEnvironmentPanel] = useState(false)
  
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
            handleStateChange('thinking')
            setTimeout(() => handleStateChange('idle'), 2000)
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
              handleStateChange('speaking')
              setCurrentDialogue(newDialogue.message)
              setTimeout(() => handleStateChange('idle'), 5000)
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

  // Handle state change and play cached animation if available
  const handleStateChange = (newState: AnimationState) => {
    console.log('[v0] handleStateChange called:', newState, 'current cachedAnimations:', cachedAnimations)
    setLichState(newState)
    const played = playAnimation(newState) // Will use cached video if available
    console.log('[v0] playAnimation returned:', played, 'currentVideoUrl should update')
  }

  // Send DM message with speech
  const sendLichMessage = async (message: string, emotion: string = 'threatening') => {
    handleStateChange('speaking')
    setCurrentDialogue(message)
    
    // Insert message to database
    await supabase.from('story_dialogue').insert({
      campaign_id: 'ashes_of_prometheus',
      speaker: 'Vecna',
      speaker_type: 'dm',
      message,
      emotion,
      requires_response: true,
      response_type: 'dialogue'
    })
    
    // Speak the message if not muted
    if (!isMuted) {
      try {
        await speak(message)
      } catch (error) {
        console.error('Speech failed:', error)
      }
    }
    
    // Return to idle after speech completes or timeout
    setTimeout(() => {
      if (!isSpeaking) {
        handleStateChange('idle')
      }
    }, 5000)
  }
  
  // Watch for speech completion to return to idle
  useEffect(() => {
    if (!isSpeaking && lichState === 'speaking') {
      handleStateChange('idle')
    }
  }, [isSpeaking, lichState])

  // Handle Runway generation
  const handleGenerateAnimation = async (state: AnimationState) => {
    try {
      await generateAnimation(state)
    } catch (error) {
      console.error('Failed to generate animation:', error)
    }
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Castle Background */}
      <CastleBackground 
        videoUrl={envVideoUrl}
        environmentName={environments.find(e => e.id === currentEnvironment)?.name}
      />
      
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
          {/* Layer Navigation */}
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-xl p-1 border border-purple-900/30">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400" title="Layer 1: The Lich DM (Current)">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider">L1</span>
            </div>
            <Link 
              href="/world-ai"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-stone-500 hover:text-[#e0651a] hover:bg-[#e0651a]/10 transition-all"
              title="Layer 2: World AI"
            >
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e0651a]" />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider">L2</span>
            </Link>
            <Link 
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-stone-500 hover:text-[#c4a777] hover:bg-[#c4a777]/10 transition-all"
              title="Layer 3: Player Dashboard"
            >
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#c4a777]" />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider">L3</span>
            </Link>
          </div>
          
          <div className="flex flex-col">
            <h1 className="text-lg font-serif text-purple-200 tracking-wider">VECNA</h1>
            <span className="text-[10px] text-stone-500 tracking-widest uppercase">Dungeon Master</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ConnectionStatus isConnected={isConnected} />
          
          {/* Environment Control */}
          <button 
            onClick={() => setShowEnvironmentPanel(!showEnvironmentPanel)}
            className={cn(
              "p-2 bg-black/40 backdrop-blur border rounded-lg transition-all flex items-center gap-1.5",
              showEnvironmentPanel 
                ? "border-green-500/50 text-green-400" 
                : "border-purple-900/30 text-stone-400 hover:text-green-400"
            )}
            title="Change Environment"
          >
            <MapPin className="w-5 h-5" />
            {isGeneratingEnv && <Loader2 className="w-3 h-3 animate-spin" />}
          </button>
          
          {/* Runway Video Control */}
          <button 
            onClick={() => setShowRunwayPanel(!showRunwayPanel)}
            className={cn(
              "p-2 bg-black/40 backdrop-blur border rounded-lg transition-all flex items-center gap-1.5",
              showRunwayPanel 
                ? "border-purple-500/50 text-purple-400" 
                : "border-purple-900/30 text-stone-400 hover:text-purple-400"
            )}
            title="Vecna Animations"
          >
            <Video className="w-5 h-5" />
            {isGenerating && <Loader2 className="w-3 h-3 animate-spin" />}
          </button>
          
<button
  onClick={() => {
    if (!isMuted) {
      stopSpeech() // Stop current speech when muting
    }
    setIsMuted(!isMuted)
  }}
  className={cn(
    "p-2 bg-black/40 backdrop-blur border rounded-lg transition-all relative",
    isMuted 
      ? "border-red-900/50 text-red-400" 
      : isSpeaking 
        ? "border-green-500/50 text-green-400" 
        : "border-purple-900/30 text-stone-400 hover:text-purple-400"
  )}
  title={isMuted ? "Unmute Vecna" : isSpeaking ? "Speaking..." : "Mute Vecna"}
>
  {isSpeaking && !isMuted && (
    <span className="absolute -top-1 -right-1 flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
    </span>
  )}
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

      {/* Runway Animation Panel */}
      {showRunwayPanel && (
        <div className="absolute top-20 right-4 z-50 w-72 bg-black/80 backdrop-blur-md border border-purple-900/40 rounded-lg p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-serif text-purple-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Runway Animations
            </h3>
            {isGenerating && (
              <span className="text-[10px] text-purple-400 animate-pulse">Generating...</span>
            )}
          </div>
          
          {/* Generation Progress */}
          {currentTask && currentTask.status !== 'SUCCEEDED' && (
            <div className="mb-4 p-3 bg-purple-900/20 rounded border border-purple-800/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-stone-400">Status:</span>
                <span className={cn(
                  "text-xs font-medium",
                  currentTask.status === 'PENDING' && "text-yellow-400",
                  currentTask.status === 'RUNNING' && "text-blue-400",
                  currentTask.status === 'FAILED' && "text-red-400"
                )}>
                  {currentTask.status}
                </span>
              </div>
              {currentTask.progress !== undefined && (
                <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 transition-all"
                    style={{ width: `${currentTask.progress}%` }}
                  />
                </div>
              )}
              {currentTask.error && (
                <p className="text-xs text-red-400 mt-2">{currentTask.error}</p>
              )}
            </div>
          )}

          {/* Animation States */}
          <div className="space-y-2">
            {(['idle', 'speaking', 'thinking', 'casting', 'laughing'] as AnimationState[]).map((state) => (
              <div 
                key={state}
                className="flex items-center justify-between p-2 bg-stone-900/50 rounded border border-stone-800/50"
              >
                <div className="flex items-center gap-2">
                  {cachedAnimations[state] ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-stone-600" />
                  )}
                  <span className="text-sm text-stone-300 capitalize">{state}</span>
                </div>
                
                <div className="flex items-center gap-1">
                  {cachedAnimations[state] && (
                    <button
                      onClick={() => {
                        handleStateChange(state)
                      }}
                      className="px-2 py-1 text-[10px] bg-purple-900/40 text-purple-300 rounded hover:bg-purple-800/50 transition-colors"
                    >
                      Play
                    </button>
                  )}
                  <button
                    onClick={() => handleGenerateAnimation(state)}
                    disabled={isGenerating}
                    className={cn(
                      "px-2 py-1 text-[10px] rounded transition-colors",
                      isGenerating 
                        ? "bg-stone-800 text-stone-600 cursor-not-allowed"
                        : "bg-purple-600/60 text-purple-100 hover:bg-purple-500/60"
                    )}
                  >
                    {isGenerating ? 'Wait...' : 'Generate'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-stone-500 mt-4">
            Generate Runway video animations for each Lich state. Videos are cached for instant playback.
          </p>
        </div>
      )}

      {/* Environment Panel */}
      {showEnvironmentPanel && (
        <div className="absolute top-20 right-4 z-50 w-80 bg-black/80 backdrop-blur-md border border-green-900/40 rounded-lg p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-serif text-green-200 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Environment Backgrounds
            </h3>
            {isGeneratingEnv && (
              <span className="text-[10px] text-green-400 animate-pulse">Generating...</span>
            )}
          </div>
          
          {/* Generation Progress */}
          {envTask && envTask.status === 'processing' && (
            <div className="mb-4 p-3 bg-green-900/20 rounded border border-green-800/30">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400">Generating {envTask.environment}...</span>
                <Loader2 className="w-4 h-4 text-green-400 animate-spin" />
              </div>
            </div>
          )}
          
          {/* Environment Grid */}
          <div className="grid grid-cols-1 gap-2">
            {environments.map((env) => {
              const isCached = cachedEnvironments.has(env.id)
              const isActive = currentEnvironment === env.id
              const isGeneratingThis = envTask?.environment === env.id && envTask.status === 'processing'
              
              return (
                <div
                  key={env.id}
                  className={cn(
                    "flex items-center justify-between p-2.5 rounded border transition-all",
                    isActive 
                      ? "bg-green-900/30 border-green-500/50" 
                      : "bg-stone-900/50 border-stone-800/50 hover:border-green-800/50"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{env.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm",
                          isActive ? "text-green-300" : "text-stone-300"
                        )}>
                          {env.name}
                        </span>
                        {isCached ? (
                          <CheckCircle className="w-3 h-3 text-green-500" />
                        ) : (
                          <XCircle className="w-3 h-3 text-stone-600" />
                        )}
                      </div>
                      <p className="text-[10px] text-stone-500">{env.description}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {isCached && !isActive && (
                      <button
                        onClick={() => switchEnvironment(env.id)}
                        className="px-2 py-1 text-[10px] bg-green-600/40 text-green-200 rounded hover:bg-green-500/50 transition-colors"
                      >
                        Use
                      </button>
                    )}
                    {isActive && (
                      <span className="px-2 py-1 text-[10px] bg-green-500/20 text-green-400 rounded">
                        Active
                      </span>
                    )}
                    <button
                      onClick={() => generateEnvironment(env.id)}
                      disabled={isGeneratingEnv}
                      className={cn(
                        "px-2 py-1 text-[10px] rounded transition-colors",
                        isGeneratingEnv
                          ? "bg-stone-800 text-stone-600 cursor-not-allowed"
                          : "bg-green-600/60 text-green-100 hover:bg-green-500/60"
                      )}
                    >
                      {isGeneratingThis ? <Loader2 className="w-3 h-3 animate-spin" /> : isCached ? 'Regen' : 'Generate'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[10px] text-stone-500 mt-4">
            Generate looping background videos for Vecna&apos;s lair. Switch environments to change the scene.
          </p>
        </div>
      )}

      {/* Main Content */}
      <main className="relative h-full flex flex-col items-center justify-center pt-20 pb-32">
        {/* Lich Character */}
        <div className="relative flex-1 flex items-center justify-center w-full max-w-2xl">
          {console.log('[v0] DM page render - currentVideoUrl:', currentVideoUrl)}
<LichCharacter
  state={lichState}
  currentDialogue={currentDialogue}
  videoUrl={currentVideoUrl}
  isSpeaking={isSpeaking}
  isSpeechLoading={isSpeechLoading}
  onVideoEnd={() => {
    // Return to idle after non-looping animations
    if (lichState !== 'idle') {
      handleStateChange('idle')
    }
  }}
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
        setLichState={handleStateChange}
      />
    </div>
  )
}
