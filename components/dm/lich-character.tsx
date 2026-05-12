"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface LichCharacterProps {
  state: 'idle' | 'speaking' | 'thinking' | 'casting' | 'laughing'
  currentDialogue: string
  videoUrl?: string | null
  isSpeaking?: boolean
  isSpeechLoading?: boolean
  onVideoEnd?: () => void
}

export function LichCharacter({ state, currentDialogue, videoUrl, isSpeaking, isSpeechLoading, onVideoEnd }: LichCharacterProps) {
  const [eyeGlow, setEyeGlow] = useState(0.6)
  const [breathPhase, setBreathPhase] = useState(0)

  // Eye glow animation (for SVG fallback)
  useEffect(() => {
    const interval = setInterval(() => {
      setEyeGlow(() => {
        const base = state === 'speaking' ? 1 : state === 'thinking' ? 0.8 : 0.6
        const flicker = Math.random() * 0.2
        return base + flicker
      })
    }, 100)
    return () => clearInterval(interval)
  }, [state])

  // Breathing animation (for SVG fallback)
  useEffect(() => {
    const interval = setInterval(() => {
      setBreathPhase(prev => (prev + 0.05) % (Math.PI * 2))
    }, 50)
    return () => clearInterval(interval)
  }, [])

  const breathOffset = Math.sin(breathPhase) * 3

  return (
    <div className="relative flex flex-col items-center">
      {/* Video Feed - simple implementation */}
      {videoUrl ? (
        <div className="relative">
          <video
            key={videoUrl}
            src={videoUrl}
            className={cn(
              "w-[500px] h-auto object-contain",
              "mix-blend-lighten",
              "drop-shadow-[0_0_40px_rgba(138,43,226,0.6)]",
              "transition-all duration-300",
              state === 'speaking' && "scale-105 drop-shadow-[0_0_60px_rgba(138,43,226,0.8)]",
              state === 'casting' && "scale-110 drop-shadow-[0_0_80px_rgba(180,80,255,0.9)]"
            )}
            loop
            muted
            autoPlay
            playsInline
            onEnded={onVideoEnd}
          />
        </div>
      ) : (
        /* SVG Fallback when no video */
        <div 
          className={cn(
            "relative transition-all duration-500",
            state === 'speaking' && "scale-105",
            state === 'casting' && "scale-110"
          )}
          style={{ transform: `translateY(${breathOffset}px)` }}
        >
          {/* Dark Aura */}
          <div className={cn(
            "absolute inset-0 -inset-x-20 -inset-y-10 rounded-full blur-3xl transition-opacity duration-1000",
            state === 'idle' && "opacity-30",
            state === 'speaking' && "opacity-60",
            state === 'thinking' && "opacity-50 animate-pulse",
            state === 'casting' && "opacity-80"
          )} style={{ background: 'radial-gradient(ellipse, #4a1080 0%, transparent 70%)' }} />

          {/* Lich SVG */}
          <svg 
            viewBox="0 0 300 450" 
            className="w-64 h-96 relative z-10"
            style={{ filter: `drop-shadow(0 0 ${20 + eyeGlow * 10}px rgba(138, 43, 226, ${eyeGlow * 0.5}))` }}
          >
            {/* Hood/Cloak */}
            <path 
              d="M150 50 Q80 80 60 180 Q50 280 70 400 L230 400 Q250 280 240 180 Q220 80 150 50 Z" 
              fill="url(#cloak-gradient)"
              className={cn(
                "transition-all duration-300",
                state === 'casting' && "animate-pulse"
              )}
            />
            
            {/* Inner hood darkness */}
            <ellipse cx="150" cy="140" rx="55" ry="70" fill="#0a0510" />
            
            {/* Skull Face */}
            <g className="skull">
              <ellipse cx="150" cy="145" rx="45" ry="55" fill="#e8e0d0" opacity="0.9" />
              <ellipse cx="150" cy="135" rx="42" ry="48" fill="#d8d0c0" />
              
              {/* Eye Sockets */}
              <ellipse cx="130" cy="130" rx="15" ry="18" fill="#1a0a20" />
              <ellipse cx="170" cy="130" rx="15" ry="18" fill="#1a0a20" />
              
              {/* Glowing Eyes */}
              <ellipse 
                cx="130" cy="130" rx="8" ry="10" 
                fill={`rgba(180, 80, 255, ${eyeGlow})`}
                style={{ filter: `blur(2px) drop-shadow(0 0 8px rgba(180, 80, 255, ${eyeGlow}))` }}
              />
              <ellipse 
                cx="170" cy="130" rx="8" ry="10" 
                fill={`rgba(180, 80, 255, ${eyeGlow})`}
                style={{ filter: `blur(2px) drop-shadow(0 0 8px rgba(180, 80, 255, ${eyeGlow}))` }}
              />
              
              {/* Nasal cavity */}
              <path d="M145 145 L150 165 L155 145 Z" fill="#2a1a30" />
              
              {/* Teeth/Jaw */}
              <path d="M120 175 Q150 185 180 175 Q175 200 150 200 Q125 200 120 175 Z" fill="#d0c8b8" stroke="#8a7a6a" strokeWidth="1" />
            </g>

            {/* Gradients */}
            <defs>
              <linearGradient id="cloak-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1a1020" />
                <stop offset="50%" stopColor="#0a0510" />
                <stop offset="100%" stopColor="#050208" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      )}

      {/* Speech Bubble */}
      {state === 'speaking' && currentDialogue && (
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 max-w-md animate-fade-in z-20">
          <div className="relative bg-black/80 backdrop-blur-sm border border-purple-500/30 rounded-lg p-4 shadow-[0_0_30px_rgba(138,43,226,0.3)]">
            {(isSpeaking || isSpeechLoading) && (
              <div className="absolute -top-3 right-2 flex items-center gap-1.5 bg-black/90 px-2 py-0.5 rounded-full border border-green-500/30">
                {isSpeechLoading ? (
                  <>
                    <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                    <span className="text-[10px] text-yellow-400 font-mono">GENERATING...</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    <span className="text-[10px] text-green-400 font-mono">SPEAKING</span>
                  </>
                )}
              </div>
            )}
            <p className="text-purple-100 font-serif text-sm leading-relaxed text-center">
              {currentDialogue}
            </p>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-black/80 border-r border-b border-purple-500/30 rotate-45" />
          </div>
        </div>
      )}
    </div>
  )
}
