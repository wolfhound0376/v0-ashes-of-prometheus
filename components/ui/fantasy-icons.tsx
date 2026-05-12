"use client"

import { cn } from "@/lib/utils"

interface IconProps {
  className?: string
}

// Action Icons with colored backgrounds matching BG3 style
export function SpellbookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-8 h-8", className)}>
      <rect x="2" y="2" width="28" height="28" rx="2" fill="url(#purple-grad)" />
      <defs>
        <linearGradient id="purple-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5a3a7a" />
          <stop offset="100%" stopColor="#3a2050" />
        </linearGradient>
      </defs>
      {/* Book */}
      <path d="M8 6h16v20H8z" fill="#2a1a3a" stroke="#8a6aaa" strokeWidth="0.5" />
      <path d="M10 8h12v1H10zM10 11h12v1H10zM10 14h8v1H10z" fill="#c9b896" />
      <path d="M16 6v20" stroke="#8a6aaa" strokeWidth="0.5" />
      {/* Magic glow */}
      <circle cx="16" cy="20" r="3" fill="#a87ac8" opacity="0.6" />
    </svg>
  )
}

export function AbilityIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-8 h-8", className)}>
      <rect x="2" y="2" width="28" height="28" rx="2" fill="url(#orange-grad)" />
      <defs>
        <linearGradient id="orange-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8a5a3a" />
          <stop offset="100%" stopColor="#5a3520" />
        </linearGradient>
      </defs>
      {/* Hand with arcane magic flowing */}
      <path d="M12 24v-8l1.5-4 2 1.5v-6l1.5 0.5v5.5l1.5-0.5v-6l1.5 0.5v6l1.5-0.5v-4l1.5 0.5v8l-1 6h-8z" 
            fill="#ffcc99" stroke="#dd9966" strokeWidth="0.5" />
      {/* Arcane energy flowing */}
      <path d="M8 12c2-2 4-1 5 1M6 16c3-1 5 0 6 2" stroke="#ff8844" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="7" cy="14" r="1.5" fill="#ffaa44" opacity="0.8" />
      <circle cx="5" cy="17" r="1" fill="#ff8833" opacity="0.6" />
    </svg>
  )
}

export function DashIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-8 h-8", className)}>
      <rect x="2" y="2" width="28" height="28" rx="2" fill="url(#green-grad)" />
      <defs>
        <linearGradient id="green-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3a6a4a" />
          <stop offset="100%" stopColor="#204030" />
        </linearGradient>
      </defs>
      {/* Running man figure */}
      <circle cx="20" cy="8" r="3" fill="#7ab896" /> {/* Head */}
      <path d="M18 11l-2 6 4 1-1 4-3 6" stroke="#7ab896" strokeWidth="2" strokeLinecap="round" fill="none" /> {/* Body & front leg */}
      <path d="M18 17l3 2 4 5" stroke="#7ab896" strokeWidth="2" strokeLinecap="round" fill="none" /> {/* Back leg */}
      <path d="M16 17l-4-2" stroke="#7ab896" strokeWidth="2" strokeLinecap="round" fill="none" /> {/* Arm back */}
      <path d="M20 14l4-1" stroke="#7ab896" strokeWidth="2" strokeLinecap="round" fill="none" /> {/* Arm front */}
      {/* Speed lines */}
      <path d="M5 12h4M5 16h3M5 20h2" stroke="#7ab896" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

export function DisengageIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-8 h-8", className)}>
      <rect x="2" y="2" width="28" height="28" rx="2" fill="url(#darkred-grad)" />
      <defs>
        <linearGradient id="darkred-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7a3a4a" />
          <stop offset="100%" stopColor="#4a2030" />
        </linearGradient>
      </defs>
      {/* Two arrows pointing in different directions (diverging) */}
      {/* Left arrow pointing up-left */}
      <path d="M8 8l8 8" stroke="#c87a8a" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 8l5 0M8 8l0 5" stroke="#c87a8a" strokeWidth="2" strokeLinecap="round" />
      {/* Right arrow pointing down-right */}
      <path d="M16 16l8 8" stroke="#c87a8a" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 24l-5 0M24 24l0-5" stroke="#c87a8a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function HelpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-8 h-8", className)}>
      <rect x="2" y="2" width="28" height="28" rx="2" fill="url(#tan-grad)" />
      <defs>
        <linearGradient id="tan-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8a7a5a" />
          <stop offset="100%" stopColor="#5a4a3a" />
        </linearGradient>
      </defs>
      {/* Helping hand - open palm reaching */}
      <path d="M10 22v-6l1-3h2v-4h2v-2h2v2h2v4h2l1 3v6z" fill="#d4c4a4" stroke="#b4a484" strokeWidth="0.5" />
      {/* Fingers */}
      <path d="M13 9v4M15 7v6M17 7v6M19 9v4" stroke="#c4b494" strokeWidth="1.5" strokeLinecap="round" />
      {/* Palm line */}
      <path d="M12 18h8" stroke="#a49474" strokeWidth="0.5" />
    </svg>
  )
}

export function ReadyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-8 h-8", className)}>
      <rect x="2" y="2" width="28" height="28" rx="2" fill="url(#gold-grad)" />
      <defs>
        <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8a7a3a" />
          <stop offset="100%" stopColor="#5a4a20" />
        </linearGradient>
      </defs>
      {/* Hourglass */}
      <path d="M10 6h12v2l-4 6 4 6v2H10v-2l4-6-4-6z" fill="#d4b44a" stroke="#b4943a" strokeWidth="0.5" />
      <path d="M12 8h8M12 24h8" stroke="#b4943a" strokeWidth="1" />
      {/* Sand */}
      <path d="M13 10l3 4 3-4" fill="#f4d47a" />
    </svg>
  )
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-8 h-8", className)}>
      <rect x="2" y="2" width="28" height="28" rx="2" fill="url(#gray-grad)" />
      <defs>
        <linearGradient id="gray-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5a5a5a" />
          <stop offset="100%" stopColor="#3a3a3a" />
        </linearGradient>
      </defs>
      {/* Magnifying glass */}
      <circle cx="14" cy="14" r="6" fill="none" stroke="#a0a0a0" strokeWidth="2" />
      <path d="M19 19l6 6" stroke="#a0a0a0" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="14" cy="14" r="3" fill="#6a8a9a" opacity="0.3" />
    </svg>
  )
}

export function RitualIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-8 h-8", className)}>
      <rect x="2" y="2" width="28" height="28" rx="2" fill="url(#deepurple-grad)" />
      <defs>
        <linearGradient id="deepurple-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4a3a6a" />
          <stop offset="100%" stopColor="#2a1a4a" />
        </linearGradient>
      </defs>
      {/* Pentagram/magic circle */}
      <circle cx="16" cy="16" r="9" fill="none" stroke="#8a6aaa" strokeWidth="1" />
      <circle cx="16" cy="16" r="6" fill="none" stroke="#a87ac8" strokeWidth="0.5" />
      {/* Star points */}
      <path d="M16 7l2 6 6-2-4 5 4 5-6-2-2 6-2-6-6 2 4-5-4-5 6 2z" fill="#a87ac8" opacity="0.7" />
    </svg>
  )
}

// Equipment slot icons
export function HoodIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M8 28V14c0-6 3-10 8-10s8 4 8 10v14" fill="#2a3a4a" stroke="#4a6a8a" strokeWidth="1" />
      <path d="M10 16c0-4 2.5-8 6-8s6 4 6 8" fill="#1a2a35" stroke="#4a6a8a" strokeWidth="0.5" />
      <ellipse cx="16" cy="22" rx="4" ry="3" fill="#0a1520" />
    </svg>
  )
}

export function NecklaceIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M8 8c0 8 3 14 8 18 5-4 8-10 8-18" fill="none" stroke="#b8956a" strokeWidth="1.5" />
      <circle cx="16" cy="24" r="4" fill="#4a7a9a" stroke="#b8956a" strokeWidth="1" />
      <circle cx="16" cy="24" r="2" fill="#7aa8c8" />
    </svg>
  )
}

export function RobeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M10 6h12l2 22H8z" fill="#2a3a5a" stroke="#4a6a8a" strokeWidth="1" />
      <path d="M14 6v8l2 2 2-2V6" fill="#3a4a6a" stroke="#5a7a9a" strokeWidth="0.5" />
      <path d="M10 10l-2 18M22 10l2 18" stroke="#4a6a8a" strokeWidth="0.5" />
      {/* Gold trim */}
      <path d="M12 14h8M12 18h8M12 22h8" stroke="#b8956a" strokeWidth="0.5" opacity="0.6" />
    </svg>
  )
}

export function PantsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M10 4h12v6l-2 18h-4V14h-2v14H10l-2-18V4z" fill="#3a3020" stroke="#5a4a30" strokeWidth="1" />
      <path d="M10 6h12" stroke="#6a5a40" strokeWidth="1" />
    </svg>
  )
}

export function BootsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M6 28h8v-8l-2-14h-4l-2 14zM18 28h8l-2-8-2-14h-4l2 14z" fill="#4a3a2a" stroke="#6a5a4a" strokeWidth="1" />
      <path d="M6 28h8M18 28h8" stroke="#8a7a6a" strokeWidth="1.5" />
      <path d="M8 8h2M20 8h2" stroke="#6a5a4a" strokeWidth="0.5" />
    </svg>
  )
}

export function StaffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M16 10v20" stroke="#6a5a4a" strokeWidth="2" />
      <path d="M14 28h4" stroke="#6a5a4a" strokeWidth="1.5" />
      {/* Crystal */}
      <path d="M12 4l4 8 4-8z" fill="#4a7a9a" stroke="#7aa8c8" strokeWidth="0.5" />
      <path d="M14 5l2 4 2-4" fill="#7aa8c8" opacity="0.6" />
      {/* Glow */}
      <circle cx="16" cy="6" r="4" fill="#7aa8c8" opacity="0.2" />
    </svg>
  )
}

export function OrbIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <circle cx="16" cy="16" r="10" fill="url(#orb-grad)" stroke="#4a6a8a" strokeWidth="1" />
      <defs>
        <radialGradient id="orb-grad" cx="30%" cy="30%">
          <stop offset="0%" stopColor="#7aa8c8" />
          <stop offset="100%" stopColor="#2a4a6a" />
        </radialGradient>
      </defs>
      <ellipse cx="12" cy="12" rx="3" ry="2" fill="white" opacity="0.3" />
    </svg>
  )
}

export function RingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <ellipse cx="16" cy="18" rx="8" ry="10" fill="none" stroke="#b8956a" strokeWidth="2" />
      <ellipse cx="16" cy="18" rx="5" ry="7" fill="none" stroke="#d4b896" strokeWidth="1" />
      {/* Gem */}
      <circle cx="16" cy="8" r="4" fill="#4a9aaa" stroke="#b8956a" strokeWidth="1" />
      <circle cx="15" cy="7" r="1.5" fill="#7ac8d8" opacity="0.6" />
    </svg>
  )
}

// Inventory item icons
export function BackpackIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M8 12h16v16H8z" fill="#6a4a2a" stroke="#8a6a4a" strokeWidth="1" />
      <path d="M10 8h12v4H10z" fill="#5a3a1a" stroke="#8a6a4a" strokeWidth="0.5" />
      <path d="M12 14h8v6H12z" fill="#4a3a2a" stroke="#6a5a4a" strokeWidth="0.5" />
      <path d="M14 4c0-1 1-2 2-2s2 1 2 2v4h-4z" fill="#5a3a1a" stroke="#8a6a4a" strokeWidth="0.5" />
      {/* Buckle */}
      <rect x="14" y="16" width="4" height="2" fill="#b8956a" />
    </svg>
  )
}

export function MagiRobeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M8 4h16l3 26H5z" fill="#2a3a6a" stroke="#4a6a9a" strokeWidth="1" />
      <path d="M12 4v10l4 2 4-2V4" fill="#3a4a7a" stroke="#5a7aaa" strokeWidth="0.5" />
      {/* Gold embroidery */}
      <path d="M10 12h12M10 18h12M10 24h12" stroke="#b8956a" strokeWidth="0.5" />
      <circle cx="16" cy="8" r="2" fill="#b8956a" />
      {/* Magic shimmer */}
      <circle cx="20" cy="14" r="1" fill="#7aa8c8" opacity="0.6" />
      <circle cx="12" cy="20" r="1" fill="#7aa8c8" opacity="0.6" />
    </svg>
  )
}

export function PotionIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M12 4h8v4l4 18c0 2-3 4-8 4s-8-2-8-4l4-18z" fill="#aa3030" stroke="#cc5050" strokeWidth="1" />
      <path d="M12 4h8v2h-8z" fill="#6a4a3a" stroke="#8a6a5a" strokeWidth="0.5" />
      {/* Liquid shine */}
      <path d="M11 20c2-2 6-2 8 0" fill="#cc5050" opacity="0.8" />
      <ellipse cx="14" cy="16" rx="2" ry="3" fill="#ee7070" opacity="0.4" />
    </svg>
  )
}

export function ScrollIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M6 6c2-2 4-2 4 0v20c0 2-2 2-4 0" fill="#d4c4a4" stroke="#b4a484" strokeWidth="0.5" />
      <path d="M10 4h12v24H10z" fill="#e8dcc8" stroke="#c4b4a4" strokeWidth="0.5" />
      <path d="M22 6c2-2 4-2 4 0v20c0 2-2 2-4 0" fill="#d4c4a4" stroke="#b4a484" strokeWidth="0.5" />
      {/* Text lines */}
      <path d="M12 10h8M12 14h6M12 18h8M12 22h4" stroke="#8a7a6a" strokeWidth="0.5" />
      {/* Red seal */}
      <circle cx="22" cy="24" r="3" fill="#aa3030" stroke="#881010" strokeWidth="0.5" />
    </svg>
  )
}

export function PearlIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <circle cx="16" cy="16" r="10" fill="url(#pearl-grad)" stroke="#4a6a8a" strokeWidth="1" />
      <defs>
        <radialGradient id="pearl-grad" cx="30%" cy="30%">
          <stop offset="0%" stopColor="#aaccee" />
          <stop offset="50%" stopColor="#5588bb" />
          <stop offset="100%" stopColor="#2a4a6a" />
        </radialGradient>
      </defs>
      <ellipse cx="12" cy="12" rx="4" ry="3" fill="white" opacity="0.4" />
      {/* Inner glow */}
      <circle cx="16" cy="16" r="4" fill="#7aa8c8" opacity="0.3" />
    </svg>
  )
}

export function RopeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <ellipse cx="16" cy="16" rx="10" ry="8" fill="none" stroke="#b4a474" strokeWidth="3" />
      <ellipse cx="16" cy="16" rx="6" ry="4" fill="none" stroke="#c4b484" strokeWidth="2" />
      <path d="M24 20c2 4 4 6 6 6" stroke="#b4a474" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function TorchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M14 14h4v14h-4z" fill="#6a4a2a" stroke="#8a6a4a" strokeWidth="0.5" />
      {/* Flame */}
      <path d="M10 6c0-4 6-6 6-2 0-4 6 0 6 4s-3 8-6 8-6-4-6-10z" fill="#ff8830" stroke="#ff6600" strokeWidth="0.5" />
      <path d="M13 8c0-2 3-3 3-1 0-2 3 0 3 2s-1.5 4-3 4-3-2-3-5z" fill="#ffcc00" />
      {/* Glow */}
      <circle cx="16" cy="6" r="6" fill="#ff8830" opacity="0.2" />
    </svg>
  )
}

export function GoldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      {/* Stack of coins */}
      <ellipse cx="12" cy="24" rx="8" ry="3" fill="#b8956a" stroke="#d4b896" strokeWidth="0.5" />
      <ellipse cx="12" cy="22" rx="8" ry="3" fill="#c4a57a" stroke="#d4b896" strokeWidth="0.5" />
      <ellipse cx="12" cy="20" rx="8" ry="3" fill="#d4b58a" stroke="#e4c8a6" strokeWidth="0.5" />
      {/* Top coin */}
      <ellipse cx="20" cy="14" rx="7" ry="3" fill="#d4b58a" stroke="#e4c8a6" strokeWidth="0.5" />
      <ellipse cx="20" cy="12" rx="7" ry="3" fill="#e4c89a" stroke="#f4d8a6" strokeWidth="0.5" />
      {/* Coin detail */}
      <circle cx="20" cy="12" r="3" fill="#c4a57a" />
    </svg>
  )
}

// Quick ability icons
export function MageHandIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M10 26v-10l2-6 3 2v-8l2 1v7l2-1v-8l2 1v8l2-1v-6l2 1v10l-2 8h-10z" 
            fill="#7aa8c8" stroke="#4a7a9a" strokeWidth="0.5" opacity="0.7" />
      {/* Glow effect */}
      <circle cx="16" cy="16" r="12" fill="#7aa8c8" opacity="0.1" />
      <path d="M12 12l2-2M18 10l2-2M22 14l2-1" stroke="#aaccee" strokeWidth="0.5" opacity="0.5" />
    </svg>
  )
}

export function FireBoltIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M8 24L20 4l-4 12 8-4L12 32l4-12z" fill="#ff6600" stroke="#ff8830" strokeWidth="0.5" />
      <path d="M12 20L18 8l-2 8 4-2L14 28l2-8z" fill="#ffaa00" />
      {/* Glow */}
      <circle cx="16" cy="16" r="10" fill="#ff6600" opacity="0.15" />
    </svg>
  )
}

export function ShieldSpellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      <path d="M16 4L6 8v10c0 6 4 10 10 12 6-2 10-6 10-12V8z" 
            fill="#4a7a9a" stroke="#7aa8c8" strokeWidth="1" opacity="0.8" />
      <path d="M16 8l-6 3v7c0 4 2.5 6.5 6 8 3.5-1.5 6-4 6-8v-7z" 
            fill="#2a4a6a" stroke="#5a8aaa" strokeWidth="0.5" />
      {/* Magic runes */}
      <circle cx="16" cy="16" r="3" fill="none" stroke="#7aa8c8" strokeWidth="0.5" />
      <path d="M16 12v8M12 16h8" stroke="#7aa8c8" strokeWidth="0.5" />
    </svg>
  )
}

export function MagicMissileIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      {/* Three magic missiles */}
      <ellipse cx="8" cy="12" rx="4" ry="2" fill="#a87ac8" transform="rotate(-30 8 12)" />
      <ellipse cx="16" cy="8" rx="4" ry="2" fill="#8a5aaa" transform="rotate(-15 16 8)" />
      <ellipse cx="24" cy="14" rx="4" ry="2" fill="#a87ac8" transform="rotate(-45 24 14)" />
      {/* Trails */}
      <path d="M4 16l8-8M10 14l10-10M18 20l10-10" stroke="#c87ae8" strokeWidth="1" opacity="0.5" strokeLinecap="round" />
      {/* Glow */}
      <circle cx="16" cy="16" r="10" fill="#a87ac8" opacity="0.1" />
    </svg>
  )
}

export function DetectMagicIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      {/* Eye */}
      <ellipse cx="16" cy="16" rx="12" ry="8" fill="none" stroke="#a87ac8" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="5" fill="#2a1a4a" stroke="#8a5aaa" strokeWidth="1" />
      <circle cx="16" cy="16" r="2" fill="#c87ae8" />
      {/* Magic aura */}
      <circle cx="16" cy="16" r="14" fill="none" stroke="#a87ac8" strokeWidth="0.5" strokeDasharray="2 2" />
      {/* Sparkles */}
      <circle cx="6" cy="10" r="1" fill="#c87ae8" />
      <circle cx="26" cy="12" r="1" fill="#c87ae8" />
      <circle cx="10" cy="24" r="1" fill="#c87ae8" />
    </svg>
  )
}

export function LockedAbilityIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("w-full h-full", className)}>
      {/* Lock body */}
      <rect x="8" y="14" width="16" height="14" rx="2" fill="#3a3a3a" stroke="#5a5a5a" strokeWidth="1" />
      {/* Lock shackle */}
      <path d="M11 14V10c0-3 2-5 5-5s5 2 5 5v4" fill="none" stroke="#5a5a5a" strokeWidth="2" />
      {/* Keyhole */}
      <circle cx="16" cy="20" r="2" fill="#2a2a2a" />
      <path d="M16 22v4" stroke="#2a2a2a" strokeWidth="2" />
    </svg>
  )
}

// Icon wrapper with bronze frame (BG3 style)
export function IconFrame({ 
  children, 
  className,
  selected,
  disabled 
}: { 
  children: React.ReactNode
  className?: string
  selected?: boolean
  disabled?: boolean
}) {
  return (
    <div className={cn(
      "relative rounded-md overflow-hidden",
      "border-2 transition-all",
      // Hover enlarge effect - scales to 200% after 1 second delay
      "hover:scale-[2] hover:z-50 transition-transform duration-200 hover:delay-1000",
      selected 
        ? "border-[#7aa8c8] shadow-[0_0_12px_rgba(122,168,200,0.5)]" 
        : "border-[#5a4a3a] hover:border-[#8a7a6a]",
      disabled && "opacity-50 border-[#3a3a3a]",
      className
    )}>
      {/* Bronze corner decorations */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#b8956a] rounded-tl-sm" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[#b8956a] rounded-tr-sm" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-[#b8956a] rounded-bl-sm" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[#b8956a] rounded-br-sm" />
      {children}
    </div>
  )
}
