"use client"

import { useEffect, useState, useRef } from "react"
import { cn } from "@/lib/utils"

interface LichCharacterProps {
  state: 'idle' | 'speaking' | 'thinking' | 'casting' | 'laughing'
  currentDialogue: string
  videoUrl?: string | null
  onVideoEnd?: () => void
}

export function LichCharacter({ state, currentDialogue, videoUrl, onVideoEnd }: LichCharacterProps) {
  const [eyeGlow, setEyeGlow] = useState(0.6)
  const [breathPhase, setBreathPhase] = useState(0)
  const [videoError, setVideoError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Eye glow animation (for SVG fallback)
  useEffect(() => {
    const interval = setInterval(() => {
      setEyeGlow(prev => {
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

  // Handle video changes
  useEffect(() => {
    if (videoUrl && videoRef.current) {
      setVideoError(false)
      videoRef.current.load()
      videoRef.current.play().catch(() => {
        // Autoplay may be blocked, that's ok
      })
    }
  }, [videoUrl])

  const breathOffset = Math.sin(breathPhase) * 3
  const showVideo = videoUrl && !videoError

  return (
    <div className="relative flex flex-col items-center">
      {/* Runway Video Feed */}
      {showVideo && (
        <div className="relative">
          {/* Video with dark frame */}
          <div className="relative rounded-lg overflow-hidden border-2 border-purple-900/50 shadow-[0_0_60px_rgba(138,43,226,0.4)]">
            <video
              ref={videoRef}
              className="w-80 h-auto object-cover"
              loop={state === 'idle'}
              muted
              playsInline
              onError={() => setVideoError(true)}
              onEnded={onVideoEnd}
            >
              <source src={videoUrl} type="video/mp4" />
            </video>
            
            {/* Overlay effects */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />
              
              {/* Purple glow overlay when speaking */}
              {state === 'speaking' && (
                <div className="absolute inset-0 bg-purple-600/10 animate-pulse" />
              )}
              
              {/* Magic overlay when casting */}
              {state === 'casting' && (
                <div className="absolute inset-0 bg-gradient-to-t from-purple-900/40 to-transparent animate-pulse" />
              )}
            </div>
          </div>
          
          {/* Soul flame above video */}
          <div className={cn(
            "absolute -top-6 left-1/2 -translate-x-1/2 w-10 h-14",
            "transition-all duration-300",
            state === 'speaking' && "scale-125",
            state === 'casting' && "scale-150"
          )}>
            <div 
              className="w-full h-full rounded-full blur-sm animate-pulse"
              style={{ 
                background: 'radial-gradient(ellipse at bottom, #b050ff 0%, #6020a0 50%, transparent 80%)',
                animationDuration: '1.5s'
              }} 
            />
          </div>
        </div>
      )}

      {/* SVG Fallback when no video */}
      {!showVideo && (
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
              {/* Skull base */}
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
              
              {/* Eye pupils/cores */}
              <ellipse cx="130" cy="130" rx="3" ry="4" fill="#fff" opacity={eyeGlow} />
              <ellipse cx="170" cy="130" rx="3" ry="4" fill="#fff" opacity={eyeGlow} />
              
              {/* Nasal cavity */}
              <path d="M145 145 L150 165 L155 145 Z" fill="#2a1a30" />
              
              {/* Teeth/Jaw */}
              <path 
                d="M120 175 Q150 185 180 175 Q175 200 150 200 Q125 200 120 175 Z" 
                fill="#d0c8b8" 
                stroke="#8a7a6a" 
                strokeWidth="1"
              />
              {/* Teeth lines */}
              <path d="M130 180 L130 190" stroke="#6a5a4a" strokeWidth="1" />
              <path d="M140 182 L140 193" stroke="#6a5a4a" strokeWidth="1" />
              <path d="M150 183 L150 195" stroke="#6a5a4a" strokeWidth="1" />
              <path d="M160 182 L160 193" stroke="#6a5a4a" strokeWidth="1" />
              <path d="M170 180 L170 190" stroke="#6a5a4a" strokeWidth="1" />
            </g>

            {/* Skeletal Hands */}
            <g className={cn(
              "transition-transform duration-500",
              state === 'casting' && "animate-pulse"
            )}>
              {/* Left hand */}
              <path 
                d="M80 320 Q60 300 55 280 M55 280 Q50 270 45 260 M55 280 Q52 268 48 258 M55 280 Q55 265 52 255 M55 280 Q58 265 58 252" 
                stroke="#d8d0c0" 
                strokeWidth="3" 
                fill="none"
                strokeLinecap="round"
              />
              {/* Right hand */}
              <path 
                d="M220 320 Q240 300 245 280 M245 280 Q250 270 255 260 M245 280 Q248 268 252 258 M245 280 Q245 265 248 255 M245 280 Q242 265 242 252" 
                stroke="#d8d0c0" 
                strokeWidth="3" 
                fill="none"
                strokeLinecap="round"
              />
            </g>

            {/* Magic effects when casting */}
            {state === 'casting' && (
              <g className="animate-pulse">
                <circle cx="55" cy="260" r="15" fill="url(#magic-gradient)" opacity="0.8" />
                <circle cx="245" cy="260" r="15" fill="url(#magic-gradient)" opacity="0.8" />
              </g>
            )}

            {/* Gradients */}
            <defs>
              <linearGradient id="cloak-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1a1020" />
                <stop offset="50%" stopColor="#0a0510" />
                <stop offset="100%" stopColor="#050208" />
              </linearGradient>
              <radialGradient id="magic-gradient">
                <stop offset="0%" stopColor="#b050ff" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
            </defs>
          </svg>

          {/* Soul flame above head */}
          <div className={cn(
            "absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-12",
            "transition-all duration-300",
            state === 'speaking' && "scale-125",
            state === 'casting' && "scale-150"
          )}>
            <div 
              className="w-full h-full rounded-full blur-sm animate-pulse"
              style={{ 
                background: 'radial-gradient(ellipse at bottom, #b050ff 0%, #6020a0 50%, transparent 80%)',
                animationDuration: '1.5s'
              }} 
            />
          </div>
        </div>
      )}

      {/* Speech Bubble */}
      {state === 'speaking' && currentDialogue && (
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 max-w-md animate-fade-in z-20">
          <div className="relative bg-black/80 backdrop-blur-sm border border-purple-500/30 rounded-lg p-4 shadow-[0_0_30px_rgba(138,43,226,0.3)]">
            <p className="text-purple-100 font-serif text-sm leading-relaxed text-center">
              {currentDialogue}
            </p>
            {/* Speech bubble tail */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-black/80 border-r border-b border-purple-500/30 rotate-45" />
          </div>
        </div>
      )}

      {/* State indicators */}
      <div className="mt-4 flex items-center gap-2">
        {state === 'thinking' && (
          <div className="flex items-center gap-1 text-purple-400 text-xs animate-pulse">
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            <span className="ml-2 font-serif tracking-wide">Contemplating...</span>
          </div>
        )}
        {state === 'casting' && (
          <div className="text-purple-300 text-xs font-serif tracking-wide animate-pulse">
            Weaving dark magic...
          </div>
        )}
      </div>
    </div>
  )
}
