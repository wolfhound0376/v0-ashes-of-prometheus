"use client"

import { useEffect, useState } from "react"

export function CastleBackground() {
  const [candles, setCandles] = useState<{ id: number; x: number; delay: number }[]>([])
  
  useEffect(() => {
    // Generate random candle positions
    const newCandles = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 2
    }))
    setCandles(newCandles)
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base dark gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0510] via-[#120818] to-[#0a0510]" />
      
      {/* Stone texture overlay */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `repeating-linear-gradient(
            90deg,
            transparent,
            transparent 50px,
            rgba(100, 80, 120, 0.1) 50px,
            rgba(100, 80, 120, 0.1) 51px
          ),
          repeating-linear-gradient(
            0deg,
            transparent,
            transparent 30px,
            rgba(80, 60, 100, 0.1) 30px,
            rgba(80, 60, 100, 0.1) 31px
          )`
        }}
      />

      {/* Gothic arches */}
      <svg className="absolute inset-0 w-full h-full opacity-20" preserveAspectRatio="none">
        <defs>
          <linearGradient id="arch-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3a2050" />
            <stop offset="100%" stopColor="#0a0510" />
          </linearGradient>
        </defs>
        
        {/* Left arch */}
        <path 
          d="M0 100% Q15% 40% 15% 20% Q15% 0% 30% 0% L0 0% Z" 
          fill="url(#arch-gradient)"
        />
        
        {/* Right arch */}
        <path 
          d="M100% 100% Q85% 40% 85% 20% Q85% 0% 70% 0% L100% 0% Z" 
          fill="url(#arch-gradient)"
        />
        
        {/* Center arch frame */}
        <path 
          d="M30% 100% L30% 30% Q50% 0% 70% 30% L70% 100%" 
          fill="none"
          stroke="#2a1540"
          strokeWidth="3"
        />
      </svg>

      {/* Throne silhouette */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-64 opacity-30">
        <svg viewBox="0 0 200 150" className="w-full h-full">
          <path 
            d="M40 150 L40 80 L20 60 L20 20 L40 30 L50 10 L60 30 L80 20 L100 35 L120 20 L140 30 L150 10 L160 30 L180 20 L180 60 L160 80 L160 150 Z" 
            fill="#1a1020"
          />
        </svg>
      </div>

      {/* Floating candles */}
      {candles.map(candle => (
        <div
          key={candle.id}
          className="absolute bottom-20 opacity-60"
          style={{ 
            left: `${candle.x}%`,
            animation: `float 4s ease-in-out infinite`,
            animationDelay: `${candle.delay}s`
          }}
        >
          {/* Candle body */}
          <div className="w-1 h-8 bg-gradient-to-t from-stone-700 to-stone-500 rounded-sm" />
          {/* Flame */}
          <div 
            className="absolute -top-4 left-1/2 -translate-x-1/2 w-3 h-5 rounded-full animate-pulse"
            style={{ 
              background: 'radial-gradient(ellipse at bottom, #ffa500 0%, #ff6600 40%, transparent 70%)',
              filter: 'blur(1px)',
              animationDuration: `${0.5 + Math.random() * 0.5}s`
            }}
          />
          {/* Glow */}
          <div 
            className="absolute -top-6 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full opacity-40"
            style={{ 
              background: 'radial-gradient(circle, #ffa500 0%, transparent 70%)'
            }}
          />
        </div>
      ))}

      {/* Dust particles */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-purple-300/20 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `dust ${5 + Math.random() * 10}s linear infinite`,
              animationDelay: `${Math.random() * 5}s`
            }}
          />
        ))}
      </div>

      {/* Vignette */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.8) 100%)'
        }}
      />

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes dust {
          0% { 
            transform: translateY(0) translateX(0); 
            opacity: 0;
          }
          10% { opacity: 0.3; }
          90% { opacity: 0.3; }
          100% { 
            transform: translateY(-100vh) translateX(20px); 
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
