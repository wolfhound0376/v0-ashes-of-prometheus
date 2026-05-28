"use client"

import { useState, useEffect } from "react"
import { Settings, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface LichPersonality {
  snark: number
  crassness: number
  cruelty: number
  roast_target: string
  swearing: string
  fourth_wall: string
}

const DEFAULTS: LichPersonality = {
  snark: 5,
  crassness: 3,
  cruelty: 4,
  roast_target: "even",
  swearing: "mild",
  fourth_wall: "occasionally",
}

const SLIDER_CAPTIONS = {
  snark: {
    label: "Snark",
    description: "0 = deadpan serious, 10 = sardonic asides constantly",
  },
  crassness: {
    label: "Crassness", 
    description: "0 = elegant insults, 10 = crude and vulgar mockery",
  },
  cruelty: {
    label: "Cruelty",
    description: "0 = playful teasing, 10 = psychological warfare",
  },
}

const ROAST_TARGETS = [
  { value: "sam", label: "Sam" },
  { value: "kenta", label: "Kenta" },
  { value: "fifi", label: "Fifi" },
  { value: "scott", label: "Scott" },
  { value: "even", label: "Spread evenly" },
  { value: "off", label: "Off" },
]

export function PersonalityDials() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<LichPersonality>(DEFAULTS)

  // Fetch current settings on mount
  useEffect(() => {
    if (open) {
      fetchSettings()
    }
  }, [open])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/lich-personality")
      if (res.ok) {
        const data = await res.json()
        setSettings({
          snark: data.snark ?? DEFAULTS.snark,
          crassness: data.crassness ?? DEFAULTS.crassness,
          cruelty: data.cruelty ?? DEFAULTS.cruelty,
          roast_target: data.roast_target ?? DEFAULTS.roast_target,
          swearing: data.swearing ?? DEFAULTS.swearing,
          fourth_wall: data.fourth_wall ?? DEFAULTS.fourth_wall,
        })
      }
    } catch (err) {
      console.error("Failed to fetch personality settings:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/lich-personality", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        toast.success("Malachar's personality updated", {
          description: "The lich's voice has been adjusted for this session.",
        })
        setOpen(false)
      } else {
        const data = await res.json()
        toast.error("Failed to save", { description: data.error })
      }
    } catch (err) {
      toast.error("Failed to save", { description: "Network error" })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setSettings(DEFAULTS)
  }

  const updateSetting = <K extends keyof LichPersonality>(
    key: K,
    value: LichPersonality[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="p-1.5 rounded hover:bg-[#3d3428]/40 transition-colors"
          title="Malachar's Personality"
        >
          <Settings className="w-4 h-4 text-stone-400 hover:text-[#d4b15a] transition-colors" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="bg-[#0a0908] border-l border-[#3d3428] w-full sm:max-w-md overflow-y-auto"
      >
        <SheetHeader className="border-b border-[#3d3428]/60 pb-4">
          <SheetTitle className="font-serif text-[#d4b15a] text-lg tracking-wider">
            Malachar&apos;s Personality
          </SheetTitle>
          <SheetDescription className="text-stone-500 text-xs">
            Adjust the lich&apos;s voice mid-campaign. Changes apply to the next message.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-stone-500 text-sm">Loading settings...</div>
          </div>
        ) : (
          <div className="py-6 space-y-8">
            {/* Sliders */}
            {(Object.keys(SLIDER_CAPTIONS) as Array<keyof typeof SLIDER_CAPTIONS>).map(
              (key) => (
                <div key={key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-stone-200">
                      {SLIDER_CAPTIONS[key].label}
                    </label>
                    <span className="text-sm font-mono text-[#d4b15a] bg-[#1f1c16] px-2 py-0.5 rounded">
                      {settings[key]}
                    </span>
                  </div>
                  <Slider
                    value={[settings[key] as number]}
                    onValueChange={([val]) => updateSetting(key, val)}
                    min={0}
                    max={10}
                    step={1}
                    className="[&_[data-slot=slider-track]]:bg-[#3d3428] [&_[data-slot=slider-range]]:bg-[#e0651a] [&_[data-slot=slider-thumb]]:border-[#e0651a] [&_[data-slot=slider-thumb]]:bg-[#0a0908]"
                  />
                  <p className="text-[10px] text-stone-500 italic">
                    {SLIDER_CAPTIONS[key].description}
                  </p>
                </div>
              )
            )}

            {/* Roast Target Radio Group */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-stone-200">
                Roast target tonight
              </label>
              <RadioGroup
                value={settings.roast_target}
                onValueChange={(val) => updateSetting("roast_target", val)}
                className="grid grid-cols-2 gap-2"
              >
                {ROAST_TARGETS.map((target) => (
                  <label
                    key={target.value}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded border cursor-pointer transition-all",
                      settings.roast_target === target.value
                        ? "bg-[#e0651a]/10 border-[#e0651a] text-[#ffd97a]"
                        : "bg-[#1f1c16] border-[#3d3428]/60 text-stone-400 hover:border-[#d4b15a]/40"
                    )}
                  >
                    <RadioGroupItem
                      value={target.value}
                      className="border-[#3d3428] data-[state=checked]:border-[#e0651a] data-[state=checked]:text-[#e0651a]"
                    />
                    <span className="text-xs">{target.label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Swearing Select */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-stone-200">
                Swearing
              </label>
              <Select
                value={settings.swearing}
                onValueChange={(val) => updateSetting("swearing", val)}
              >
                <SelectTrigger className="w-full bg-[#1f1c16] border-[#3d3428]/60 text-stone-300 hover:border-[#d4b15a]/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0908] border-[#3d3428]">
                  <SelectItem value="off" className="text-stone-300">
                    Off — no swearing
                  </SelectItem>
                  <SelectItem value="mild" className="text-stone-300">
                    Mild — light swears only, no f-bombs
                  </SelectItem>
                  <SelectItem value="unrestricted" className="text-stone-300">
                    Unrestricted — all swears permitted
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Fourth Wall Select */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-stone-200">
                Fourth wall
              </label>
              <Select
                value={settings.fourth_wall}
                onValueChange={(val) => updateSetting("fourth_wall", val)}
              >
                <SelectTrigger className="w-full bg-[#1f1c16] border-[#3d3428]/60 text-stone-300 hover:border-[#d4b15a]/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0908] border-[#3d3428]">
                  <SelectItem value="off" className="text-stone-300">
                    Off — stay fully in character
                  </SelectItem>
                  <SelectItem value="occasionally" className="text-stone-300">
                    Occasionally — drop occasional asides
                  </SelectItem>
                  <SelectItem value="often" className="text-stone-300">
                    Often — frequently address viewers
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <SheetFooter className="border-t border-[#3d3428]/60 pt-4 flex-row gap-2">
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-[#3d3428]/60 rounded text-stone-400 text-xs uppercase tracking-wider hover:border-[#d4b15a]/40 hover:text-stone-200 transition-all disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-[#e0651a] rounded text-[#e0651a] text-xs uppercase tracking-wider hover:bg-[#e0651a] hover:text-[#0a0908] transition-all disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            {saving ? "Saving..." : "Save"}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
