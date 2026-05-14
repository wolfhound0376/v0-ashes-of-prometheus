"use client"

import { Heart, Shield, Zap, Eye, Scroll, Footprints } from "lucide-react"
import { cn } from "@/lib/utils"

// D&D 5E Conditions
const DND_CONDITIONS = {
  blinded: { name: "Blinded", color: "text-stone-400", bg: "bg-stone-400/10" },
  charmed: { name: "Charmed", color: "text-pink-400", bg: "bg-pink-400/10" },
  deafened: { name: "Deafened", color: "text-stone-400", bg: "bg-stone-400/10" },
  frightened: { name: "Frightened", color: "text-purple-400", bg: "bg-purple-400/10" },
  grappled: { name: "Grappled", color: "text-orange-400", bg: "bg-orange-400/10" },
  incapacitated: { name: "Incapacitated", color: "text-red-400", bg: "bg-red-400/10" },
  invisible: { name: "Invisible", color: "text-cyan-400", bg: "bg-cyan-400/10" },
  paralyzed: { name: "Paralyzed", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  petrified: { name: "Petrified", color: "text-stone-500", bg: "bg-stone-500/10" },
  poisoned: { name: "Poisoned", color: "text-green-400", bg: "bg-green-400/10" },
  prone: { name: "Prone", color: "text-amber-400", bg: "bg-amber-400/10" },
  restrained: { name: "Restrained", color: "text-orange-400", bg: "bg-orange-400/10" },
  stunned: { name: "Stunned", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  unconscious: { name: "Unconscious", color: "text-red-500", bg: "bg-red-500/10" },
  exhaustion: { name: "Exhaustion", color: "text-amber-600", bg: "bg-amber-600/10" },
} as const

type ConditionKey = keyof typeof DND_CONDITIONS

interface CharacterStatusProps {
  hp: { current: number; max: number; temp?: number }
  ac: number
  initiative: number
  speed: number
  proficiencyBonus: number
  passivePerception: number
  conditions: ConditionKey[]
  deathSaves?: { successes: number; failures: number }
}

export function CharacterStatus({
  hp,
  ac,
  initiative,
  speed,
  proficiencyBonus,
  passivePerception,
  conditions,
  deathSaves
}: CharacterStatusProps) {
  const hpPercent = (hp.current / hp.max) * 100
  const hpColor = hpPercent > 50 ? "text-emerald-400" : hpPercent > 25 ? "text-amber-400" : "text-red-400"
  const isUnconscious = hp.current <= 0

  return (
    <div className="space-y-3">
      {/* HP Bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <Heart className={cn("w-4 h-4", hpColor)} />
            <span className="text-xs uppercase tracking-wider text-stone-500">Hit Points</span>
          </div>
          <span className={cn("text-sm font-medium", hpColor)}>
            {hp.current} / {hp.max}
            {hp.temp && hp.temp > 0 && (
              <span className="text-cyan-400 ml-1">(+{hp.temp})</span>
            )}
          </span>
        </div>
        <div className="h-2 bg-[#1a1614] rounded-full overflow-hidden border border-[#3d3428]/40">
          <div
            className={cn(
              "h-full transition-all duration-300",
              hpPercent > 50 ? "bg-gradient-to-r from-emerald-600 to-emerald-400" :
              hpPercent > 25 ? "bg-gradient-to-r from-amber-600 to-amber-400" :
              "bg-gradient-to-r from-red-600 to-red-400"
            )}
            style={{ width: `${Math.max(0, hpPercent)}%` }}
          />
        </div>
      </div>

      {/* Death Saves (only show if unconscious) */}
      {isUnconscious && deathSaves && (
        <div className="flex items-center justify-between p-2 bg-red-900/20 border border-red-500/30 rounded">
          <span className="text-xs uppercase tracking-wider text-red-400">Death Saves</span>
          <div className="flex gap-3">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={`success-${i}`}
                  className={cn(
                    "w-3 h-3 rounded-full border",
                    i < deathSaves.successes
                      ? "bg-emerald-400 border-emerald-400"
                      : "border-emerald-400/40"
                  )}
                />
              ))}
            </div>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={`failure-${i}`}
                  className={cn(
                    "w-3 h-3 rounded-full border",
                    i < deathSaves.failures
                      ? "bg-red-400 border-red-400"
                      : "border-red-400/40"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Core Stats Grid */}
      <div className="grid grid-cols-5 gap-2">
        <StatBox icon={Shield} label="AC" value={ac} color="amber" />
        <StatBox icon={Zap} label="Init" value={`+${initiative}`} color="yellow" />
        <StatBox icon={Footprints} label="Speed" value={`${speed}ft`} color="blue" />
        <StatBox icon={Scroll} label="Prof" value={`+${proficiencyBonus}`} color="purple" />
        <StatBox icon={Eye} label="PP" value={passivePerception} color="cyan" />
      </div>

      {/* Conditions */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1.5">Conditions</div>
        {conditions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {conditions.map((condition) => {
              const data = DND_CONDITIONS[condition]
              return (
                <span
                  key={condition}
                  className={cn(
                    "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-current/30",
                    data.color,
                    data.bg
                  )}
                >
                  {data.name}
                </span>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400/70">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Normal</span>
          </div>
        )}
      </div>
    </div>
  )
}

function StatBox({ 
  icon: Icon, 
  label, 
  value, 
  color 
}: { 
  icon: any
  label: string
  value: string | number
  color: "amber" | "yellow" | "blue" | "purple" | "cyan"
}) {
  const colors = {
    amber: "text-amber-400 border-amber-400/30",
    yellow: "text-yellow-400 border-yellow-400/30",
    blue: "text-blue-400 border-blue-400/30",
    purple: "text-purple-400 border-purple-400/30",
    cyan: "text-cyan-400 border-cyan-400/30",
  }

  return (
    <div className={cn(
      "flex flex-col items-center p-1.5 rounded border bg-[#1a1614]/60",
      colors[color]
    )}>
      <Icon className="w-3.5 h-3.5 mb-0.5" />
      <span className="text-sm font-medium">{value}</span>
      <span className="text-[8px] uppercase tracking-wider text-stone-500">{label}</span>
    </div>
  )
}
