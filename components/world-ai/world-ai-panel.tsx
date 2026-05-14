"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { 
  MessageSquare, 
  Map, 
  BookOpen, 
  Library, 
  Send, 
  Sparkles,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Home,
  Flame,
  MapPin,
  Wifi,
  WifiOff
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Campaign, CAMPAIGNS, getAllCampaigns } from "@/lib/world-ai/campaigns"
import { rollDice, formatDiceResult, DiceRollResult } from "@/lib/world-ai/dice"
import { DiceModal } from "./dice-modal"
import { useMalachar, type MalacharMessage } from "@/lib/world-ai/use-malachar"

type ViewTab = "chat" | "maps" | "lore" | "library"

interface WorldAIPanelProps {
  onCampaignChange?: (campaign: Campaign) => void
  onLocationChange?: (location: string) => void
  className?: string
}

export function WorldAIPanel({ 
  onCampaignChange, 
  onLocationChange, 
  className 
}: WorldAIPanelProps) {
  // Campaign state
  const [currentCampaign, setCurrentCampaign] = useState<Campaign>(CAMPAIGNS.tyranny)
  const [currentEpisode, setCurrentEpisode] = useState(currentCampaign.contexts.defaults.episode)
  const [currentLocation, setCurrentLocation] = useState(currentCampaign.contexts.locations[0])
  const [currentHeat, setCurrentHeat] = useState(currentCampaign.contexts.defaults.heat)

  // View state
  const [activeView, setActiveView] = useState<ViewTab>("chat")
  const [activeMapId, setActiveMapId] = useState(currentCampaign.maps[0]?.id || "")
  const [mapZoom, setMapZoom] = useState(1)
  const [hoveredHotspot, setHoveredHotspot] = useState<{ name: string; text: string } | null>(null)
  
  // Chat input state
  const [inputValue, setInputValue] = useState("")
  const chatLogRef = useRef<HTMLDivElement>(null)

  // Build campaign context for Malachar
  const campaignContext = useMemo(() => ({
    name: currentCampaign.name,
    systemPrompt: currentCampaign.systemPrompt,
    currentEpisode: currentEpisode,
    currentLocation: currentLocation,
    currentHeat: currentHeat,
  }), [currentCampaign, currentEpisode, currentLocation, currentHeat])

  // Malachar session hook - connects to the lich personality (falls back to Claude if not configured)
  const { 
    messages, 
    isLoading: isThinking, 
    isConnecting,
    error: malacharError,
    sendMessage, 
    clearMessages,
    reconnect,
    sessionId,
    backendMode
  } = useMalachar(campaignContext)

  // Dice state
  const [diceModalOpen, setDiceModalOpen] = useState(false)
  const [currentDiceRoll, setCurrentDiceRoll] = useState<{
    notation: string
    name?: string
    callback?: (result: number) => void
  } | null>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight
    }
  }, [messages])

  // Handle campaign change
  const handleCampaignSelect = (campaign: Campaign) => {
    setCurrentCampaign(campaign)
    setCurrentEpisode(campaign.contexts.defaults.episode)
    setCurrentLocation(campaign.contexts.locations[0])
    setCurrentHeat(campaign.contexts.defaults.heat)
    setActiveMapId(campaign.maps[0]?.id || "")
    // Reconnect Malachar with new campaign context
    reconnect()
    onCampaignChange?.(campaign)
    setActiveView("chat")
  }

  // Handle location change
  const handleLocationChange = (location: string) => {
    setCurrentLocation(location)
    onLocationChange?.(location)
  }

  // Dice roll handler
  const handleDiceRoll = (notation: string, name?: string, callback?: (result: number) => void) => {
    setCurrentDiceRoll({ notation, name, callback })
    setDiceModalOpen(true)
  }

  const handleDiceResult = (result: DiceRollResult) => {
    setDiceModalOpen(false)
    if (currentDiceRoll?.callback) {
      currentDiceRoll.callback(result.total)
    }
    setCurrentDiceRoll(null)
  }

  // Quick action handler
  const handleQuickAction = (action: typeof currentCampaign.quickActions[0]) => {
    if (action.roll) {
      // Roll dice first, then send prompt with result
      handleDiceRoll(action.roll.notation, action.roll.name, (rollResult) => {
        const prompt = action.prompt.replace(/#{roll}/g, rollResult.toString())
        handleSendMessage(prompt)
      })
    } else {
      handleSendMessage(action.prompt)
    }
  }

  // Send message handler - uses Malachar session
  const handleSendMessage = (content?: string, context?: Record<string, unknown>) => {
    const text = content || inputValue.trim()
    if (!text || isThinking) return

    setInputValue("")
    sendMessage(text, context)
  }

  const activeMap = currentCampaign.maps.find(m => m.id === activeMapId)

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-[#3d3428]/60 bg-gradient-to-r from-transparent via-[#1f1b17] to-transparent">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#e0651a] animate-pulse" />
            <span 
              className="text-sm font-serif text-[#d4b15a] tracking-wider cursor-pointer hover:text-[#ffd97a] transition-colors"
              onClick={() => setActiveView("library")}
            >
              {currentCampaign.name}
            </span>
          </div>
          
          {/* View tabs */}
          <div className="flex gap-1">
            {[
              { id: "chat" as ViewTab, icon: MessageSquare, label: "Chat" },
              { id: "maps" as ViewTab, icon: Map, label: "Maps" },
              { id: "lore" as ViewTab, icon: BookOpen, label: "Lore" },
              { id: "library" as ViewTab, icon: Library, label: "Library" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={cn(
                  "px-2 py-1 text-[10px] uppercase tracking-wider font-medium rounded-sm transition-all",
                  activeView === tab.id
                    ? "text-[#d4b15a] border-b-2 border-[#e0651a]"
                    : "text-stone-500 hover:text-stone-300"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Context Bar */}
      {activeView === "chat" && (
        <div className="flex-shrink-0 px-3 py-2 border-b border-[#3d3428]/40 flex flex-wrap items-center gap-3 text-xs">
          <ContextSelector 
            label="Episode" 
            options={currentCampaign.contexts.episodes}
            value={currentEpisode}
            onChange={setCurrentEpisode}
          />
          <ContextSelector 
            label="Location" 
            options={currentCampaign.contexts.locations.map(l => [l, l])}
            value={currentLocation}
            onChange={handleLocationChange}
          />
          <ContextSelector 
            label="Heat" 
            options={currentCampaign.contexts.heat}
            value={currentHeat}
            onChange={setCurrentHeat}
          />
          
          {/* Dice Bench */}
          <div className="flex gap-1 ml-auto">
            {["d4", "d6", "d8", "d10", "d12", "d20", "d%"].map((die) => (
              <button
                key={die}
                onClick={() => handleDiceRoll(`1${die === "d%" ? "d100" : die}`, die.toUpperCase())}
                className="px-2 py-1 bg-[#1f1c16] border border-[#3d3428]/60 rounded text-[10px] font-serif text-stone-400 hover:text-[#ffd97a] hover:border-[#e0651a] transition-all"
              >
                {die}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* Chat View */}
        {activeView === "chat" && (
          <div className="flex flex-col h-full">
            {/* Chat Log */}
            <div 
              ref={chatLogRef}
              className="flex-1 overflow-y-auto p-3 space-y-3"
            >
{/* Connection status */}
  {isConnecting && (
  <div className="flex items-center justify-center gap-2 text-stone-500 text-sm py-4">
    <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
    <span>Summoning Malachar...</span>
  </div>
  )}
  {malacharError && (
  <div className="flex flex-col items-center justify-center gap-3 text-sm py-4 px-3">
    <div className="flex items-center gap-2 text-red-400">
      <WifiOff className="w-4 h-4 flex-shrink-0" />
      <span className="text-center">{malacharError}</span>
    </div>
    <button
      onClick={() => reconnect()}
      className="px-3 py-1.5 bg-[#3d3428] hover:bg-[#4d4438] border border-[#5d5448] rounded text-stone-300 text-xs transition-colors"
    >
      Retry Connection
    </button>
  </div>
  )}
  {!isConnecting && !malacharError && messages.length === 0 && (
  <div className="text-center py-8">
    <div className={`text-sm mb-2 flex items-center justify-center gap-2 ${backendMode === "malachar" ? "text-[#8b5cf6]" : "text-[#d4b15a]"}`}>
      <Wifi className="w-4 h-4" />
      <span>{backendMode === "malachar" ? "Connected to Malachar" : "Connected to World AI"}</span>
    </div>
    <div className="text-stone-500 text-sm italic">
      {backendMode === "malachar" ? "The lich awaits your query..." : "Ask about your campaign..."}
    </div>
  </div>
  )}
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} isMalachar={backendMode === "malachar"} />
              ))}
{isThinking && (
  <div className="flex gap-2 items-start">
  <Sparkles className={`w-4 h-4 animate-pulse flex-shrink-0 mt-1 ${backendMode === "malachar" ? "text-[#8b5cf6]" : "text-[#d4b15a]"}`} />
  <div className="text-sm text-stone-500 italic">
  {backendMode === "malachar" ? "Malachar is weaving dark knowledge..." : "The World AI is thinking..."}
  </div>
  </div>
  )}
            </div>

            {/* Quick Actions */}
            <div className="flex-shrink-0 px-3 py-2 border-t border-[#3d3428]/40">
              <div className="flex flex-wrap gap-1">
                {currentCampaign.quickActions.slice(0, 6).map((action, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickAction(action)}
                    className="px-2 py-1 text-[10px] bg-[#1f1c16] border border-[#3d3428]/60 rounded text-stone-400 hover:text-[#d4b15a] hover:border-[#d4b15a]/40 transition-all whitespace-nowrap"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Bar */}
            <div className="flex-shrink-0 px-3 py-2 border-t border-[#3d3428]/40">
              <div className="flex gap-2">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder="Ask the world anything..."
                  className="flex-1 bg-[#1f1c16] border border-[#3d3428]/60 rounded px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-[#d4b15a]/60 resize-none min-h-[40px] max-h-[100px]"
                  rows={1}
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputValue.trim() || isThinking}
                  className={cn(
                    "px-4 py-2 border rounded font-serif text-xs uppercase tracking-wider transition-all",
                    inputValue.trim() && !isThinking
                      ? "border-[#e0651a] text-[#e0651a] hover:bg-[#e0651a] hover:text-[#0a0908]"
                      : "border-[#3d3428]/40 text-stone-600 cursor-not-allowed"
                  )}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Maps View */}
        {activeView === "maps" && (
          <div className="flex flex-col h-full p-3">
            {/* Map Tabs */}
            <div className="flex gap-2 mb-3 flex-wrap">
              {currentCampaign.maps.map((map) => (
                <button
                  key={map.id}
                  onClick={() => setActiveMapId(map.id)}
                  className={cn(
                    "px-3 py-1 text-xs font-serif rounded border transition-all",
                    activeMapId === map.id
                      ? "bg-[#d4b15a]/15 border-[#d4b15a] text-[#ffd97a]"
                      : "bg-[#1f1c16] border-[#3d3428]/60 text-stone-500 hover:text-[#d4b15a] hover:border-[#d4b15a]"
                  )}
                >
                  {map.name}
                </button>
              ))}
            </div>

            {/* Map Stage */}
            <div className="flex-1 relative bg-[#15130f] border border-[#3d3428]/60 rounded overflow-hidden">
              {activeMap && (
                <>
                  <div 
                    className="w-full h-full transition-transform duration-300"
                    style={{ transform: `scale(${mapZoom})`, transformOrigin: 'center' }}
                    dangerouslySetInnerHTML={{ __html: activeMap.svg }}
                  />
                  
                  {/* Hotspots */}
                  {activeMap.hotspots.map((hotspot, i) => (
                    <div
                      key={i}
                      className="absolute cursor-pointer group"
                      style={{ 
                        left: `${(hotspot.x / 700) * 100}%`, 
                        top: `${(hotspot.y / 500) * 100}%`,
                        transform: `scale(${1/mapZoom})`
                      }}
                      onMouseEnter={() => setHoveredHotspot(hotspot)}
                      onMouseLeave={() => setHoveredHotspot(null)}
                    >
                      <div className="w-5 h-5 rounded-full bg-[#e0651a] border-2 border-[#ffd97a] shadow-[0_0_10px_rgba(224,101,26,0.5)] group-hover:scale-125 transition-transform flex items-center justify-center">
                        <MapPin className="w-3 h-3 text-[#0a0908]" />
                      </div>
                    </div>
                  ))}

                  {/* Hotspot Info */}
                  {hoveredHotspot && (
                    <div className="absolute bottom-3 left-3 bg-[#0a0908]/95 border border-[#d4b15a] rounded p-3 max-w-[280px] backdrop-blur-sm">
                      <h4 className="font-serif text-[#d4b15a] text-sm mb-1">{hoveredHotspot.name}</h4>
                      <p className="text-xs text-stone-300">{hoveredHotspot.text}</p>
                    </div>
                  )}

                  {/* Map Controls */}
                  <div className="absolute top-3 right-3 flex flex-col gap-1">
                    <button 
                      onClick={() => setMapZoom(z => Math.min(z * 1.3, 3))}
                      className="w-8 h-8 bg-[#0a0908]/85 border border-[#3d3428] rounded text-[#d4b15a] hover:border-[#d4b15a] transition-all flex items-center justify-center"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setMapZoom(z => Math.max(z * 0.77, 0.5))}
                      className="w-8 h-8 bg-[#0a0908]/85 border border-[#3d3428] rounded text-[#d4b15a] hover:border-[#d4b15a] transition-all flex items-center justify-center"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setMapZoom(1)}
                      className="w-8 h-8 bg-[#0a0908]/85 border border-[#3d3428] rounded text-[#d4b15a] hover:border-[#d4b15a] transition-all flex items-center justify-center"
                    >
                      <Home className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Lore View */}
        {activeView === "lore" && (
          <div className="overflow-y-auto p-3 space-y-4">
            {currentCampaign.lore.map((category, i) => (
              <div key={i}>
                <h3 className="font-serif text-[#d4b15a] text-sm tracking-wider uppercase pb-2 border-b border-[#3d3428]/60 mb-3">
                  {category.category}
                </h3>
                <div className="space-y-2">
                  {category.items.map((item, j) => (
                    <div 
                      key={j}
                      className="bg-[#1f1c16] border-l-2 border-[#d4b15a] p-3 rounded-r"
                    >
                      <h4 className="font-serif text-[#ffd97a] text-xs mb-1">{item.name}</h4>
                      <p className="text-xs text-stone-300 leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Library View */}
        {activeView === "library" && (
          <div className="overflow-y-auto p-3">
            <h2 className="font-serif text-[#d4b15a] text-base tracking-wider uppercase mb-4">
              Campaign Library
            </h2>
            <div className="space-y-3">
              {getAllCampaigns().map((campaign) => (
                <button
                  key={campaign.id}
                  onClick={() => handleCampaignSelect(campaign)}
                  className={cn(
                    "w-full text-left p-4 rounded border transition-all",
                    campaign.id === currentCampaign.id
                      ? "bg-[#e0651a]/10 border-[#e0651a]"
                      : "bg-[#1f1c16] border-[#3d3428]/60 hover:border-[#d4b15a] hover:translate-x-1"
                  )}
                >
                  <h3 className="font-serif text-[#ffd97a] text-sm mb-1">{campaign.name}</h3>
                  <p className="text-[10px] text-stone-500 tracking-wider mb-2">{campaign.subtitle}</p>
                  <p className="text-xs text-stone-400 line-clamp-2">{campaign.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dice Modal */}
      <DiceModal
        open={diceModalOpen}
        onClose={() => {
          setDiceModalOpen(false)
          setCurrentDiceRoll(null)
        }}
        notation={currentDiceRoll?.notation || "1d20"}
        name={currentDiceRoll?.name}
        onResult={handleDiceResult}
      />
    </div>
  )
}

// Context selector dropdown
function ContextSelector({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: [string, string][] | string[]
  value: string
  onChange: (value: string) => void
}) {
  const normalizedOptions = options.map(opt => 
    Array.isArray(opt) ? opt : [opt, opt]
  ) as [string, string][]

  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] uppercase tracking-wider text-stone-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#1f1c16] border border-[#3d3428]/60 rounded px-2 py-1 text-[11px] text-stone-300 focus:outline-none focus:border-[#d4b15a]/60 cursor-pointer"
      >
        {normalizedOptions.map(([val, display]) => (
          <option key={val} value={val}>{display}</option>
        ))}
      </select>
    </div>
  )
}

// Chat message component - adapts to backend mode
function ChatMessage({ message, isMalachar }: { message: MalacharMessage; isMalachar?: boolean }) {
  const isUser = message.role === "user"
  const isAssistant = message.role === "assistant"
  const accentColor = isMalachar ? "text-[#8b5cf6]" : "text-[#d4b15a]"
  const borderColor = isMalachar ? "border-[#8b5cf6]" : "border-[#d4b15a]"

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className={cn(
        "text-[9px] uppercase tracking-wider mb-1",
        isUser && "text-stone-500",
        isAssistant && accentColor
      )}>
        {isUser ? "You" : (isMalachar ? "Malachar" : "World AI")}
      </div>
      <div className={cn(
        "bg-[#1f1c16]/70 backdrop-blur-sm rounded p-3 text-sm leading-relaxed border-l-2 whitespace-pre-wrap",
        isUser && "border-[#3d3428]",
        isAssistant && borderColor
      )}>
        {message.content}
      </div>
    </div>
  )
}
