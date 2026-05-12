"use client"

import { cn } from "@/lib/utils"
import { Wifi, WifiOff } from "lucide-react"

interface ConnectionStatusProps {
  isConnected: boolean
}

export function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-lg backdrop-blur transition-all",
      isConnected 
        ? "bg-green-900/20 border border-green-700/30" 
        : "bg-red-900/20 border border-red-700/30"
    )}>
      <span className="relative flex h-2 w-2">
        {isConnected && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        )}
        <span className={cn(
          "relative inline-flex rounded-full h-2 w-2",
          isConnected ? "bg-green-400" : "bg-red-400"
        )} />
      </span>
      
      {isConnected ? (
        <Wifi className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <WifiOff className="w-3.5 h-3.5 text-red-400" />
      )}
      
      <span className={cn(
        "text-[10px] uppercase tracking-wider",
        isConnected ? "text-green-400" : "text-red-400"
      )}>
        {isConnected ? "Connected" : "Disconnected"}
      </span>
    </div>
  )
}
