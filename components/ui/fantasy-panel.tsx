"use client"

import { cn } from "@/lib/utils"
import { ReactNode } from "react"
import { Minus, X } from "lucide-react"

// The ornate framed panel used across the whole dashboard.
// Restyled to match the v3.0 design (docs/design/Dashboard_Player_Version3.0.png):
// warm near-black field, gold-bronze rule, filigree corner brackets, and a
// centered small-caps serif title in gold. Every panel in the app renders through
// this component, so the frame stays identical everywhere.

interface FantasyPanelProps {
  children: ReactNode
  className?: string
  title?: string
  variant?: "default" | "dark" | "highlight"
  /** Show the decorative minimize/close affordances in the title bar. */
  windowControls?: boolean
  onMinimize?: () => void
  onClose?: () => void
  /** Optional node rendered at the right edge of the title bar. */
  titleRight?: ReactNode
}

export function FantasyPanel({
  children,
  className,
  title,
  variant = "default",
  windowControls = false,
  onMinimize,
  onClose,
  titleRight,
}: FantasyPanelProps) {
  return (
    <div
      className={cn(
        "relative rounded-[3px]",
        "bg-gradient-to-b from-[#15110c] via-[#100d09] to-[#0b0907]",
        "border border-[#7a5f33]/70",
        "shadow-[inset_0_0_0_1px_rgba(201,168,104,0.10),inset_0_1px_0_0_rgba(212,177,90,0.16),0_6px_20px_rgba(0,0,0,0.65)]",
        variant === "highlight" &&
          "border-[#c9a868]/70 shadow-[inset_0_0_24px_rgba(201,168,104,0.12),0_6px_24px_rgba(0,0,0,0.7)]",
        variant === "dark" && "bg-gradient-to-b from-[#0e0b08] to-[#070605]",
        className,
      )}
    >
      {/* Filigree corner brackets */}
      <CornerBracket className="top-[3px] left-[3px]" flip="" />
      <CornerBracket className="top-[3px] right-[3px]" flip="scaleX(-1)" />
      <CornerBracket className="bottom-[3px] left-[3px]" flip="scaleY(-1)" />
      <CornerBracket className="bottom-[3px] right-[3px]" flip="scale(-1,-1)" />

      {title && (
        <div className="relative border-b border-[#7a5f33]/45 bg-gradient-to-r from-transparent via-[#1d1710] to-transparent px-3 py-1.5">
          <div className="flex items-center justify-center">
            <h3 className="font-serif text-center text-[13px] font-semibold tracking-[0.14em] text-[#d9bd7e]">
              {title}
            </h3>
          </div>

          {/* Hairline flourish under the title */}
          <div className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-[#c9a868]/30 to-transparent" />

          {titleRight && <div className="absolute right-2 top-1/2 -translate-y-1/2">{titleRight}</div>}

          {windowControls && !titleRight && (
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-[#8a7a5e]">
              <button
                type="button"
                onClick={onMinimize}
                aria-label="Minimize panel"
                className="transition-colors hover:text-[#d9bd7e]"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="transition-colors hover:text-[#d9bd7e]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

// A small L-shaped gold flourish tucked into each panel corner.
function CornerBracket({ className, flip }: { className: string; flip: string }) {
  return (
    <svg
      viewBox="0 0 22 22"
      aria-hidden="true"
      className={cn("pointer-events-none absolute z-10 h-[18px] w-[18px] text-[#c9a868]/55", className)}
      style={flip ? { transform: flip } : undefined}
    >
      <path d="M1 8 V1 H8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M4 12 V4 H12"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.6"
      />
      <circle cx="1.6" cy="1.6" r="1.1" fill="currentColor" opacity="0.85" />
    </svg>
  )
}

export function PanelDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 py-2", className)}>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#7a5f33]/60 to-transparent" />
      <div className="h-1.5 w-1.5 rotate-45 bg-[#c9a868]/45" />
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#7a5f33]/60 to-transparent" />
    </div>
  )
}
