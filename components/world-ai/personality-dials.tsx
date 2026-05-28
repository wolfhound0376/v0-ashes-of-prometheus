"use client"

import { useState, useEffect } from "react"
import { Settings } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { toast } from "sonner"

// Types matching the database schema
interface PersonalitySettings {
  snark: number
  crassness: number
  cruelty: number
  roast_target: "sam" | "kenta" | "fifi" | "scott" | "even" | "off"
  swearing: "off" | "mild" | "unrestricted"
  fourth_wall: "off" | "occasionally" | "often"
}

const DEFAULTS: PersonalitySettings = {
  snark: 5,
  crassness: 3,
  cruelty: 4,
  roast_target: "even",
  swearing: "mild",
  fourth_wall: "occasionally",
}

const ROAST_TARGETS = [
  { value: "sam", label: "Sam" },
  { value: "kenta", label: "Kenta" },
  { value: "fifi", label: "Fifi" },
  { value: "scott", label: "Scott" },
  { value: "even", label: "Spread evenly" },
  { value: "off", label: "Off" },
] as const

const SWEARING_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "mild", label: "Mild" },
  { value: "unrestricted", label: "Unrestricted" },
] as const

const FOURTH_WALL_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "occasionally", label: "Occasionally" },
  { value: "often", label: "Often" },
] as const

export function PersonalityDials() {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<PersonalitySettings>(DEFAULTS)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Load settings on mount
  useEffect(() => {
    if (open) {
      setIsLoading(true)
      fetch("/api/lich-personality")
        .then((res) => res.json())
        .then((data) => {
          setSettings(data)
        })
        .catch((err) => {
          console.error("Failed to load personality settings:", err)
          toast.error("Failed to load settings")
        })
        .finally(() => setIsLoading(false))
    }
  }, [open])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch("/api/lich-personality", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error("Save failed")
      toast.success("Personality settings saved")
      setOpen(false)
    } catch (err) {
      console.error("Failed to save personality settings:", err)
      toast.error("Failed to save settings")
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setSettings(DEFAULTS)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="p-1.5 rounded hover:bg-[#1f1c16] transition-colors"
          title="Malachar's Personality"
        >
          <Settings className="w-4 h-4 text-stone-500 hover:text-[#d4b15a]" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="bg-[#0a0908] border-l border-[#3d3428] text-stone-200 w-[380px] sm:max-w-[380px] overflow-y-auto"
      >
        <SheetHeader className="border-b border-[#3d3428]/60 pb-4">
          <SheetTitle className="font-serif text-[#d4b15a] text-lg tracking-wider">
            {"Malachar's Personality"}
          </SheetTitle>
          <SheetDescription className="text-stone-500 text-xs">
            Adjust the Lich&apos;s voice for this session
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-stone-500 text-sm">Loading...</div>
          </div>
        ) : (
          <div className="space-y-6 py-6">
            {/* Snark Slider */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-stone-300">Snark</label>
                <span className="text-xs text-[#d4b15a] font-mono">{settings.snark}/10</span>
              </div>
              <Slider
                value={[settings.snark]}
                onValueChange={([v]) => setSettings((s) => ({ ...s, snark: v }))}
                min={0}
                max={10}
                step={1}
                className="[&_[data-slot=slider-track]]:bg-[#1f1c16] [&_[data-slot=slider-range]]:bg-[#d4b15a] [&_[data-slot=slider-thumb]]:border-[#d4b15a]"
              />
              <p className="text-[10px] text-stone-500 italic">
                0 = deadpan, 10 = sardonic asides constantly
              </p>
            </div>

            {/* Crassness Slider */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-stone-300">Crassness</label>
                <span className="text-xs text-[#d4b15a] font-mono">{settings.crassness}/10</span>
              </div>
              <Slider
                value={[settings.crassness]}
                onValueChange={([v]) => setSettings((s) => ({ ...s, crassness: v }))}
                min={0}
                max={10}
                step={1}
                className="[&_[data-slot=slider-track]]:bg-[#1f1c16] [&_[data-slot=slider-range]]:bg-[#d4b15a] [&_[data-slot=slider-thumb]]:border-[#d4b15a]"
              />
              <p className="text-[10px] text-stone-500 italic">
                0 = elegant insults, 10 = crude and vulgar
              </p>
            </div>

            {/* Cruelty Slider */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-stone-300">Cruelty</label>
                <span className="text-xs text-[#d4b15a] font-mono">{settings.cruelty}/10</span>
              </div>
              <Slider
                value={[settings.cruelty]}
                onValueChange={([v]) => setSettings((s) => ({ ...s, cruelty: v }))}
                min={0}
                max={10}
                step={1}
                className="[&_[data-slot=slider-track]]:bg-[#1f1c16] [&_[data-slot=slider-range]]:bg-[#d4b15a] [&_[data-slot=slider-thumb]]:border-[#d4b15a]"
              />
              <p className="text-[10px] text-stone-500 italic">
                0 = playful teasing, 10 = psychological warfare
              </p>
            </div>

            {/* Roast Target Radio Group */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-stone-300">
                Roast target tonight
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ROAST_TARGETS.map((target) => (
                  <button
                    key={target.value}
                    onClick={() =>
                      setSettings((s) => ({ ...s, roast_target: target.value }))
                    }
                    className={`px-3 py-2 text-xs rounded border transition-all ${
                      settings.roast_target === target.value
                        ? "bg-[#d4b15a]/20 border-[#d4b15a] text-[#ffd97a]"
                        : "bg-[#1f1c16] border-[#3d3428]/60 text-stone-400 hover:border-[#d4b15a]/40"
                    }`}
                  >
                    {target.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Swearing Select */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-stone-300">Swearing</label>
              <select
                value={settings.swearing}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    swearing: e.target.value as PersonalitySettings["swearing"],
                  }))
                }
                className="w-full bg-[#1f1c16] border border-[#3d3428]/60 rounded px-3 py-2 text-sm text-stone-300 focus:outline-none focus:border-[#d4b15a]/60"
              >
                {SWEARING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-stone-500 italic">
                Off = none, Mild = light swears only, Unrestricted = all permitted
              </p>
            </div>

            {/* Fourth Wall Select */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-stone-300">Fourth wall</label>
              <select
                value={settings.fourth_wall}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    fourth_wall: e.target.value as PersonalitySettings["fourth_wall"],
                  }))
                }
                className="w-full bg-[#1f1c16] border border-[#3d3428]/60 rounded px-3 py-2 text-sm text-stone-300 focus:outline-none focus:border-[#d4b15a]/60"
              >
                {FOURTH_WALL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-stone-500 italic">
                Off = stay in character, Often = address viewers directly
              </p>
            </div>
          </div>
        )}

        <SheetFooter className="border-t border-[#3d3428]/60 pt-4 flex gap-2">
          <button
            onClick={handleReset}
            className="flex-1 px-4 py-2 text-xs font-serif uppercase tracking-wider border border-[#3d3428]/60 text-stone-400 rounded hover:border-stone-500 hover:text-stone-300 transition-all"
          >
            Reset to defaults
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2 text-xs font-serif uppercase tracking-wider border border-[#e0651a] text-[#e0651a] rounded hover:bg-[#e0651a] hover:text-[#0a0908] transition-all disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
