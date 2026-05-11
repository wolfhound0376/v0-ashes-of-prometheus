import { cn } from "@/lib/utils"
import { ReactNode } from "react"

interface FantasyPanelProps {
  children: ReactNode
  className?: string
  title?: string
  variant?: "default" | "dark" | "highlight"
}

export function FantasyPanel({ children, className, title, variant = "default" }: FantasyPanelProps) {
  return (
    <div
      className={cn(
        "relative rounded-sm overflow-hidden",
        "bg-gradient-to-b from-[#1a1614] to-[#0d0b0a]",
        "border border-[#3d3428]/60",
        "shadow-[inset_0_1px_0_0_rgba(205,175,125,0.1),0_4px_12px_rgba(0,0,0,0.5)]",
        variant === "highlight" && "border-[#4a3f2f]/80 shadow-[inset_0_0_20px_rgba(139,115,85,0.1)]",
        variant === "dark" && "bg-gradient-to-b from-[#12100e] to-[#080706]",
        className
      )}
    >
      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#8b7355]/40 rounded-tl-sm" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#8b7355]/40 rounded-tr-sm" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#8b7355]/40 rounded-bl-sm" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#8b7355]/40 rounded-br-sm" />

      {title && (
        <div className="px-4 py-2 border-b border-[#3d3428]/60 bg-gradient-to-r from-transparent via-[#1f1b17] to-transparent">
          <h3 className="text-center text-xs font-semibold tracking-[0.2em] uppercase text-[#c9b896]">
            {title}
          </h3>
        </div>
      )}
      {children}
    </div>
  )
}

export function PanelDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 py-2", className)}>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#5a4a3a]/60 to-transparent" />
      <div className="w-1.5 h-1.5 rotate-45 bg-[#8b7355]/40" />
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#5a4a3a]/60 to-transparent" />
    </div>
  )
}
