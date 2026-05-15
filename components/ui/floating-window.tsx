"use client"

import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ReactNode } from "react"

interface FloatingWindowProps {
  title: string
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  position?: "left" | "center" | "right"
  size?: "sm" | "md" | "lg" | "xl" | "fullscreen"
}

export function FloatingWindow({ 
  title, 
  isOpen, 
  onClose, 
  children, 
  className,
  position = "center",
  size = "md"
}: FloatingWindowProps) {
  if (!isOpen) return null

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-4xl",
    fullscreen: "max-w-[90vw] h-[85vh]"
  }

  const positionClasses = {
    left: "left-4",
    center: "left-1/2 -translate-x-1/2",
    right: "right-4"
  }

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Backdrop - only catches clicks to close */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />
      
      {/* Window */}
      <div 
        className={cn(
          "absolute top-1/2 -translate-y-1/2 w-[calc(100%-2rem)] pointer-events-auto",
          "bg-[#1a1614] border border-[#3d3428] rounded-lg shadow-2xl",
          "animate-in fade-in zoom-in-95 duration-200",
          size === "fullscreen" && "flex flex-col",
          sizeClasses[size],
          positionClasses[position],
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3d3428]">
          <h2 className="text-sm font-semibold tracking-[0.15em] uppercase text-[#c9b896]">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#2a2420] text-stone-500 hover:text-stone-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Content */}
        <div className={cn(
          "overflow-y-auto",
          size === "fullscreen" ? "flex-1" : "max-h-[70vh]"
        )}>
          {children}
        </div>
      </div>
    </div>
  )
}
