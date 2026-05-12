"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { WorldHeader } from "@/components/world-ai/world-header"
import { ContextBar } from "@/components/world-ai/context-bar"
import { ChatView } from "@/components/world-ai/chat-view"
import { MapsView } from "@/components/world-ai/maps-view"
import { LoreView } from "@/components/world-ai/lore-view"
import { LibraryView } from "@/components/world-ai/library-view"
import { EmberBackground } from "@/components/world-ai/ember-background"
import { WorldDiceModal } from "@/components/world-ai/world-dice-modal"
import { CAMPAIGNS, type Campaign } from "@/lib/world-ai/campaigns"

export type ViewType = "chat" | "maps" | "lore" | "library"

export default function WorldAIPage() {
  const [currentCampaign, setCurrentCampaign] = useState<Campaign>(CAMPAIGNS.tyranny)
  const [activeView, setActiveView] = useState<ViewType>("chat")
  const [contextState, setContextState] = useState({
    episode: "1",
    location: currentCampaign.contexts.locations[0],
    heat: "1"
  })
  
  // Dice modal state
  const [diceModalOpen, setDiceModalOpen] = useState(false)
  const [diceRequest, setDiceRequest] = useState<{ notation: string; name: string } | null>(null)
  const [lastRollResult, setLastRollResult] = useState<number | null>(null)
  
  // Chat state
  const [messages, setMessages] = useState<Array<{
    type: "user" | "world" | "error" | "thinking"
    text: string
    timestamp: Date
  }>>([])
  const [isThinking, setIsThinking] = useState(false)
  
  const supabase = createClient()

  // Load campaign
  const loadCampaign = useCallback((campaign: Campaign) => {
    setCurrentCampaign(campaign)
    setMessages([])
    setContextState({
      episode: campaign.contexts.defaults?.episode || "1",
      location: campaign.contexts.locations[0],
      heat: campaign.contexts.defaults?.heat || "1"
    })
    setActiveView("chat")
  }, [])

  // Handle dice roll request
  const requestDiceRoll = useCallback((notation: string, name: string) => {
    setDiceRequest({ notation, name })
    setDiceModalOpen(true)
  }, [])

  // Handle dice roll complete
  const handleDiceRollComplete = useCallback((result: number) => {
    setLastRollResult(result)
    setDiceModalOpen(false)
    setDiceRequest(null)
  }, [])

  // Handle quick action with optional dice roll
  const handleQuickAction = useCallback(async (action: { 
    label: string
    prompt: string
    roll?: { notation: string; name: string }
  }) => {
    if (action.roll) {
      // First roll dice, then send prompt with result
      setDiceRequest(action.roll)
      setDiceModalOpen(true)
      // Store the pending action to execute after roll
      // This will be handled by a useEffect watching lastRollResult
    } else {
      // Just send the prompt
      addMessage("user", action.prompt)
      // Simulate AI thinking - in production, this would call your AI
      setIsThinking(true)
      setTimeout(() => {
        addMessage("world", `[WorldAI would respond to: "${action.label}"]`)
        setIsThinking(false)
      }, 1500)
    }
  }, [])

  const addMessage = (type: "user" | "world" | "error", text: string) => {
    setMessages(prev => [...prev, { type, text, timestamp: new Date() }])
  }

  // Handle user sending a message
  const handleSendMessage = useCallback((text: string) => {
    addMessage("user", text)
    setIsThinking(true)
    
    // Simulate AI response - in production, connect to your AI backend
    setTimeout(() => {
      addMessage("world", `[WorldAI response to: "${text}"]`)
      setIsThinking(false)
    }, 1500)
  }, [])

  return (
    <div className="relative min-h-screen bg-[#0a0908] text-[#e0d8c8] font-mono text-sm overflow-hidden">
      {/* Ember particle background */}
      <EmberBackground />
      
      {/* Vignette overlay */}
      <div className="fixed inset-0 pointer-events-none z-[1] bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%)]" />
      
      {/* Main app container */}
      <div className="relative z-[2] flex flex-col h-screen max-w-[1100px] mx-auto px-4">
        {/* Header with brand and tabs */}
        <WorldHeader
          campaignName={currentCampaign.name}
          campaignSubtitle={currentCampaign.subtitle}
          activeView={activeView}
          onViewChange={setActiveView}
        />
        
        {/* Context bar with episode/location/heat selectors */}
        <ContextBar
          campaign={currentCampaign}
          contextState={contextState}
          onContextChange={setContextState}
          onDiceRoll={requestDiceRoll}
        />
        
        {/* Main content area */}
        <main className="flex-1 overflow-hidden relative">
          {/* Chat View */}
          <div className={cn(
            "absolute inset-0 flex flex-col transition-opacity duration-250",
            activeView === "chat" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}>
            <ChatView
              messages={messages}
              isThinking={isThinking}
              quickActions={currentCampaign.quickActions}
              onSendMessage={handleSendMessage}
              onQuickAction={handleQuickAction}
            />
          </div>
          
          {/* Maps View */}
          <div className={cn(
            "absolute inset-0 flex flex-col transition-opacity duration-250",
            activeView === "maps" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}>
            <MapsView maps={currentCampaign.maps} />
          </div>
          
          {/* Lore View */}
          <div className={cn(
            "absolute inset-0 flex flex-col transition-opacity duration-250 overflow-y-auto",
            activeView === "lore" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}>
            <LoreView lore={currentCampaign.lore} />
          </div>
          
          {/* Library View */}
          <div className={cn(
            "absolute inset-0 flex flex-col transition-opacity duration-250 overflow-y-auto",
            activeView === "library" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}>
            <LibraryView
              campaigns={CAMPAIGNS}
              currentCampaignId={currentCampaign.id}
              onSelectCampaign={loadCampaign}
            />
          </div>
        </main>
      </div>
      
      {/* Dice Modal */}
      <WorldDiceModal
        isOpen={diceModalOpen}
        onClose={() => {
          setDiceModalOpen(false)
          setDiceRequest(null)
        }}
        notation={diceRequest?.notation || "1d20"}
        rollName={diceRequest?.name || "Dice Roll"}
        onRollComplete={handleDiceRollComplete}
      />
    </div>
  )
}
