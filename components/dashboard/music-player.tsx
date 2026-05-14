"use client"

import { useState, useRef, useEffect } from "react"
import { Volume2, VolumeX, Play, Pause, SkipForward, Music } from "lucide-react"
import { cn } from "@/lib/utils"
import { MusicTrack, MUSIC_LIBRARY, getTrackById } from "@/lib/music-library"

interface MusicPlayerProps {
  currentTrackId?: string | null
  onTrackChange?: (trackId: string | null) => void
  className?: string
}

export function MusicPlayer({ currentTrackId, onTrackChange, className }: MusicPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.3)
  const [isMuted, setIsMuted] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  const currentTrack = currentTrackId ? getTrackById(currentTrackId) : null

  // Handle track changes
  useEffect(() => {
    if (audioRef.current && currentTrack) {
      audioRef.current.src = currentTrack.url
      audioRef.current.volume = isMuted ? 0 : volume
      audioRef.current.play().catch(() => {
        // Autoplay might be blocked, user needs to interact
        setIsPlaying(false)
      })
      setIsPlaying(true)
    } else if (audioRef.current && !currentTrack) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }, [currentTrackId, currentTrack])

  // Handle volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return
    
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
  }

  const playNextTrack = () => {
    const currentIndex = MUSIC_LIBRARY.findIndex(t => t.id === currentTrackId)
    const nextIndex = (currentIndex + 1) % MUSIC_LIBRARY.length
    onTrackChange?.(MUSIC_LIBRARY[nextIndex].id)
  }

  const stopMusic = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setIsPlaying(false)
    onTrackChange?.(null)
  }

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50",
      className
    )}>
      <audio 
        ref={audioRef} 
        loop 
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      
      {/* Collapsed View - Just an icon */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-all",
            "bg-[#1a1614] border-2 border-[#3d3428] hover:border-[#d4b15a]/50",
            "shadow-lg shadow-black/50",
            currentTrack && isPlaying && "animate-pulse border-[#d4b15a]/70"
          )}
        >
          <Music className={cn(
            "w-5 h-5",
            currentTrack && isPlaying ? "text-[#d4b15a]" : "text-stone-400"
          )} />
        </button>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <div className="bg-[#1a1614] border-2 border-[#3d3428] rounded-lg p-3 shadow-xl shadow-black/50 w-72">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-[#d4b15a]" />
              <span className="text-xs font-semibold tracking-wider uppercase text-[#c9b896]">
                Ambient Music
              </span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-stone-500 hover:text-stone-300 text-xs"
            >
              Minimize
            </button>
          </div>

          {/* Current Track */}
          <div className="mb-3 p-2 bg-[#0f0d0c] rounded border border-[#3d3428]/50">
            {currentTrack ? (
              <div>
                <div className="text-sm text-stone-200 font-medium truncate">
                  {currentTrack.name}
                </div>
                <div className="text-xs text-stone-500 capitalize">
                  {currentTrack.category} - {currentTrack.mood.join(", ")}
                </div>
              </div>
            ) : (
              <div className="text-sm text-stone-500 italic">
                No music playing
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                disabled={!currentTrack}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                  currentTrack 
                    ? "bg-[#d4b15a] hover:bg-[#e5c76b] text-[#1a1614]" 
                    : "bg-stone-700 text-stone-500 cursor-not-allowed"
                )}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" />
                )}
              </button>

              {/* Skip */}
              <button
                onClick={playNextTrack}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#2a2420] hover:bg-[#3d3428] text-stone-400 transition-all"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Stop */}
              {currentTrack && (
                <button
                  onClick={stopMusic}
                  className="text-xs text-stone-500 hover:text-red-400 transition-colors px-2"
                >
                  Stop
                </button>
              )}
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="text-stone-400 hover:text-stone-200">
                {isMuted ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-16 h-1 accent-[#d4b15a] bg-[#3d3428] rounded-full"
              />
            </div>
          </div>

          {/* Quick Track Selection */}
          <div className="mt-3 pt-3 border-t border-[#3d3428]/50">
            <div className="text-xs text-stone-500 mb-2">Quick Select:</div>
            <div className="flex flex-wrap gap-1">
              {MUSIC_LIBRARY.slice(0, 6).map(track => (
                <button
                  key={track.id}
                  onClick={() => onTrackChange?.(track.id)}
                  className={cn(
                    "px-2 py-1 text-xs rounded border transition-all",
                    track.id === currentTrackId
                      ? "bg-[#d4b15a]/20 border-[#d4b15a]/50 text-[#d4b15a]"
                      : "bg-[#2a2420] border-[#3d3428]/50 text-stone-400 hover:border-[#d4b15a]/30"
                  )}
                >
                  {track.name.length > 12 ? track.name.slice(0, 12) + "..." : track.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
