"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { 
  ArrowLeft, 
  Send, 
  Book, 
  Map, 
  Users, 
  Scroll, 
  Settings,
  ChevronRight,
  Zap,
  Radio,
  CheckCircle,
  AlertCircle,
  Loader2,
  Plus,
  Skull,
  Globe,
  Swords
} from "lucide-react"
import { CAMPAIGNS, type Campaign } from "@/lib/world-ai/campaigns"

type TabType = "context" | "lore" | "npcs" | "locations"

interface ContextPayload {
  episode: string
  location: string
  mood: string
  activeNPCs: string[]
  playerObjective: string
  dmNotes: string
}

export default function WorldAIPage() {
  const [activeTab, setActiveTab] = useState<TabType>("context")
  const [currentCampaign, setCurrentCampaign] = useState<Campaign>(CAMPAIGNS.tyranny)
  const [isConnectedToDM, setIsConnectedToDM] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  
  // Context state that gets pushed to DM
  const [contextPayload, setContextPayload] = useState<ContextPayload>({
    episode: "Episode 1: Greenest in Flames",
    location: "Town of Greenest",
    mood: "tense",
    activeNPCs: ["Governor Nighthill", "Castellan Escobert"],
    playerObjective: "Defend the town from the Cult of the Dragon",
    dmNotes: ""
  })
  
  // Quick prompts to inject into DM
  const [customPrompt, setCustomPrompt] = useState("")
  
  const supabase = createClient()

  // Check DM connection status
  useEffect(() => {
    const checkConnection = async () => {
      const { data } = await supabase
        .from('story_dialogue')
        .select('created_at')
        .eq('campaign_id', 'ashes_of_prometheus')
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (data && data.length > 0) {
        const lastMessage = new Date(data[0].created_at)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
        setIsConnectedToDM(lastMessage > fiveMinutesAgo)
      }
    }
    
    checkConnection()
    const interval = setInterval(checkConnection, 30000)
    return () => clearInterval(interval)
  }, [supabase])

  // Sync context to DM layer
  const syncToDM = useCallback(async () => {
    setIsSyncing(true)
    
    try {
      // Push context as a system message to the DM
      await supabase.from('story_dialogue').insert({
        campaign_id: 'ashes_of_prometheus',
        speaker: 'WorldAI',
        speaker_type: 'system',
        message: `[CONTEXT UPDATE]\nEpisode: ${contextPayload.episode}\nLocation: ${contextPayload.location}\nMood: ${contextPayload.mood}\nActive NPCs: ${contextPayload.activeNPCs.join(', ')}\nObjective: ${contextPayload.playerObjective}${contextPayload.dmNotes ? `\nDM Notes: ${contextPayload.dmNotes}` : ''}`,
        emotion: null,
        requires_response: false
      })
      
      setLastSyncTime(new Date())
    } catch (error) {
      console.error('Failed to sync to DM:', error)
    }
    
    setIsSyncing(false)
  }, [contextPayload, supabase])

  // Send prompt injection to DM
  const sendPromptToDM = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return
    
    await supabase.from('story_dialogue').insert({
      campaign_id: 'ashes_of_prometheus',
      speaker: 'WorldAI',
      speaker_type: 'system',
      message: `[DM DIRECTIVE]\n${prompt}`,
      emotion: null,
      requires_response: false
    })
    
    setCustomPrompt("")
  }, [supabase])

  const tabs = [
    { id: "context" as TabType, label: "Context", icon: Globe },
    { id: "lore" as TabType, label: "Lore", icon: Book },
    { id: "npcs" as TabType, label: "NPCs", icon: Users },
    { id: "locations" as TabType, label: "Locations", icon: Map },
  ]

  const quickPrompts = [
    { label: "Begin Combat", prompt: "Initiate combat encounter. Describe the enemies and roll for initiative.", icon: Swords },
    { label: "Describe Scene", prompt: "Provide a vivid description of the current surroundings, including sensory details.", icon: Globe },
    { label: "Introduce NPC", prompt: "Introduce a relevant NPC from the active list with dialogue and mannerisms.", icon: Users },
    { label: "Plot Hook", prompt: "Present a plot hook or mysterious clue related to the current objective.", icon: Scroll },
  ]

  return (
    <div className="min-h-screen bg-[#0a0908] text-stone-200">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0a0908]/95 backdrop-blur border-b border-stone-800/50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Layer Navigation */}
            <div className="flex items-center gap-1 bg-stone-900/80 rounded-xl p-1 border border-stone-800">
              <Link 
                href="/dm"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-stone-500 hover:text-purple-400 hover:bg-purple-500/10 transition-all"
                title="Layer 1: The Lich DM"
              >
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider">L1</span>
              </Link>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#e0651a]/20 text-[#e0651a]" title="Layer 2: World AI (Current)">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e0651a]" />
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider">L2</span>
              </div>
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
            
            <div>
              <h1 className="text-lg font-serif text-[#e0651a] tracking-wide">WORLD AI</h1>
              <p className="text-xs text-stone-500">Campaign Context Engine</p>
            </div>
          </div>
          
          {/* DM Connection Status */}
          <div className="flex items-center gap-4">
            <Link
              href="/dm"
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all",
                isConnectedToDM 
                  ? "border-green-600/50 bg-green-900/20 text-green-400"
                  : "border-stone-700 bg-stone-900/50 text-stone-500"
              )}
            >
              <div className="relative">
                <Skull className="w-4 h-4" />
                {isConnectedToDM && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                )}
              </div>
              <span className="text-xs font-mono">
                {isConnectedToDM ? "DM ONLINE" : "DM OFFLINE"}
              </span>
            </Link>
            
            <button
              onClick={syncToDM}
              disabled={isSyncing}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all",
                isSyncing 
                  ? "bg-stone-800 text-stone-500 cursor-wait"
                  : "bg-[#e0651a] text-white hover:bg-[#c85a18]"
              )}
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Radio className="w-4 h-4" />
              )}
              Sync to DM
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4">
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px",
                  activeTab === tab.id
                    ? "border-[#e0651a] text-[#e0651a]"
                    : "border-transparent text-stone-500 hover:text-stone-300"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left: Main Editor */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Context Tab */}
            {activeTab === "context" && (
              <div className="space-y-4">
                {/* Episode & Location */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-stone-500 uppercase tracking-wider">Episode</label>
                    <select
                      value={contextPayload.episode}
                      onChange={(e) => setContextPayload(prev => ({ ...prev, episode: e.target.value }))}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2.5 text-sm focus:border-[#e0651a] focus:outline-none"
                    >
                      <option>Episode 1: Greenest in Flames</option>
                      <option>Episode 2: Raiders Camp</option>
                      <option>Episode 3: Dragon Hatchery</option>
                      <option>Episode 4: On the Road</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-stone-500 uppercase tracking-wider">Current Location</label>
                    <select
                      value={contextPayload.location}
                      onChange={(e) => setContextPayload(prev => ({ ...prev, location: e.target.value }))}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2.5 text-sm focus:border-[#e0651a] focus:outline-none"
                    >
                      {currentCampaign.contexts.locations.map((loc) => (
                        <option key={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Mood */}
                <div className="space-y-2">
                  <label className="text-xs text-stone-500 uppercase tracking-wider">Scene Mood</label>
                  <div className="flex flex-wrap gap-2">
                    {["tense", "mysterious", "peaceful", "dangerous", "celebratory", "somber"].map((mood) => (
                      <button
                        key={mood}
                        onClick={() => setContextPayload(prev => ({ ...prev, mood }))}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all",
                          contextPayload.mood === mood
                            ? "bg-[#e0651a] text-white"
                            : "bg-stone-800 text-stone-400 hover:bg-stone-700"
                        )}
                      >
                        {mood}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Player Objective */}
                <div className="space-y-2">
                  <label className="text-xs text-stone-500 uppercase tracking-wider">Player Objective</label>
                  <input
                    type="text"
                    value={contextPayload.playerObjective}
                    onChange={(e) => setContextPayload(prev => ({ ...prev, playerObjective: e.target.value }))}
                    className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2.5 text-sm focus:border-[#e0651a] focus:outline-none"
                    placeholder="What should players be working toward?"
                  />
                </div>

                {/* DM Notes */}
                <div className="space-y-2">
                  <label className="text-xs text-stone-500 uppercase tracking-wider">DM Notes</label>
                  <textarea
                    value={contextPayload.dmNotes}
                    onChange={(e) => setContextPayload(prev => ({ ...prev, dmNotes: e.target.value }))}
                    className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2.5 text-sm focus:border-[#e0651a] focus:outline-none resize-none h-24"
                    placeholder="Private notes for the AI DM (secrets, upcoming events, etc.)"
                  />
                </div>
              </div>
            )}

            {/* Lore Tab */}
            {activeTab === "lore" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-stone-400">Campaign Lore</h2>
                  <button className="flex items-center gap-1 text-xs text-[#e0651a] hover:text-[#c85a18]">
                    <Plus className="w-3 h-3" />
                    Add Entry
                  </button>
                </div>
                <div className="grid gap-3">
                  {currentCampaign.lore.map((entry, i) => (
                    <div key={i} className="bg-stone-900/50 border border-stone-800 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-[#e0651a] font-medium">{entry.category}</span>
                          <h3 className="text-sm font-medium text-stone-200 mt-1">{entry.title}</h3>
                        </div>
                        <button className="text-stone-600 hover:text-stone-400">
                          <Settings className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-stone-500 mt-2 line-clamp-2">{entry.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* NPCs Tab */}
            {activeTab === "npcs" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-stone-400">Active NPCs</h2>
                  <button className="flex items-center gap-1 text-xs text-[#e0651a] hover:text-[#c85a18]">
                    <Plus className="w-3 h-3" />
                    Add NPC
                  </button>
                </div>
                <div className="grid gap-3">
                  {["Governor Nighthill", "Castellan Escobert", "Leosin Erlanthar", "Frulam Mondath"].map((npc) => (
                    <div 
                      key={npc} 
                      className={cn(
                        "flex items-center justify-between bg-stone-900/50 border rounded-lg p-3 cursor-pointer transition-all",
                        contextPayload.activeNPCs.includes(npc)
                          ? "border-green-600/50"
                          : "border-stone-800 hover:border-stone-700"
                      )}
                      onClick={() => {
                        setContextPayload(prev => ({
                          ...prev,
                          activeNPCs: prev.activeNPCs.includes(npc)
                            ? prev.activeNPCs.filter(n => n !== npc)
                            : [...prev.activeNPCs, npc]
                        }))
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-stone-800 flex items-center justify-center">
                          <Users className="w-4 h-4 text-stone-500" />
                        </div>
                        <span className="text-sm">{npc}</span>
                      </div>
                      {contextPayload.activeNPCs.includes(npc) && (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Locations Tab */}
            {activeTab === "locations" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-stone-400">Campaign Locations</h2>
                </div>
                <div className="grid gap-3">
                  {currentCampaign.contexts.locations.map((loc) => (
                    <div 
                      key={loc} 
                      className={cn(
                        "flex items-center justify-between bg-stone-900/50 border rounded-lg p-3 cursor-pointer transition-all",
                        contextPayload.location === loc
                          ? "border-[#e0651a]/50 bg-[#e0651a]/5"
                          : "border-stone-800 hover:border-stone-700"
                      )}
                      onClick={() => setContextPayload(prev => ({ ...prev, location: loc }))}
                    >
                      <div className="flex items-center gap-3">
                        <Map className="w-4 h-4 text-stone-500" />
                        <span className="text-sm">{loc}</span>
                      </div>
                      {contextPayload.location === loc && (
                        <span className="text-[10px] uppercase text-[#e0651a] font-medium">Active</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Quick Actions & Status */}
          <div className="space-y-6">
            
            {/* Sync Status */}
            <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-wider text-stone-500 mb-3">Sync Status</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-400">Last Sync</span>
                  <span className="text-stone-300">
                    {lastSyncTime ? lastSyncTime.toLocaleTimeString() : "Never"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-400">DM Layer</span>
                  <span className={isConnectedToDM ? "text-green-400" : "text-stone-500"}>
                    {isConnectedToDM ? "Connected" : "Disconnected"}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Prompts */}
            <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-wider text-stone-500 mb-3">Quick Prompts</h3>
              <div className="space-y-2">
                {quickPrompts.map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => sendPromptToDM(qp.prompt)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-stone-800/50 hover:bg-stone-800 border border-stone-700/50 hover:border-stone-600 transition-all text-left group"
                  >
                    <qp.icon className="w-4 h-4 text-stone-500 group-hover:text-[#e0651a]" />
                    <span className="text-sm text-stone-300">{qp.label}</span>
                    <ChevronRight className="w-4 h-4 text-stone-600 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Prompt */}
            <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-wider text-stone-500 mb-3">Custom Directive</h3>
              <div className="space-y-3">
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm focus:border-[#e0651a] focus:outline-none resize-none h-20"
                  placeholder="Send a custom directive to the DM..."
                />
                <button
                  onClick={() => sendPromptToDM(customPrompt)}
                  disabled={!customPrompt.trim()}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all",
                    customPrompt.trim()
                      ? "bg-[#e0651a] text-white hover:bg-[#c85a18]"
                      : "bg-stone-800 text-stone-500 cursor-not-allowed"
                  )}
                >
                  <Send className="w-4 h-4" />
                  Send to DM
                </button>
              </div>
            </div>

            {/* Current Context Preview */}
            <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-wider text-stone-500 mb-3">Context Preview</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-stone-600 w-16 shrink-0">Episode:</span>
                  <span className="text-stone-300">{contextPayload.episode}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-stone-600 w-16 shrink-0">Location:</span>
                  <span className="text-stone-300">{contextPayload.location}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-stone-600 w-16 shrink-0">Mood:</span>
                  <span className="text-stone-300 capitalize">{contextPayload.mood}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-stone-600 w-16 shrink-0">NPCs:</span>
                  <span className="text-stone-300">{contextPayload.activeNPCs.join(", ") || "None"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
