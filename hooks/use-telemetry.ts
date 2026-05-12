import { useState, useCallback } from "react"

interface TelemetryData {
  hp?: { current: number; max: number }
  location?: string
  level?: number
  xp?: number
  inventory?: Array<{ id: string; name: string; quantity: number }>
  resources?: {
    action?: number
    bonusAction?: number
    reaction?: number
    spellSlots?: number
  }
  [key: string]: unknown
}

interface TelemetryResponse {
  status: string
  commit?: string
  timestamp?: string
  error?: string
}

interface FetchedTelemetry extends TelemetryData {
  character: string
  intent: string
  timestamp: string
  version: string
  sha: string
}

export function useTelemetry(characterName: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)

  const syncTelemetry = useCallback(
    async (telemetry: TelemetryData, intent: string): Promise<TelemetryResponse> => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/update-telemetry", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            character: characterName,
            telemetry,
            intent,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "Failed to sync telemetry")
        }

        setLastSync(data.timestamp)
        return data
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        setError(errorMessage)
        return { status: "error", error: errorMessage }
      } finally {
        setIsLoading(false)
      }
    },
    [characterName]
  )

  const fetchTelemetry = useCallback(async (): Promise<FetchedTelemetry | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/update-telemetry?character=${encodeURIComponent(characterName)}`
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch telemetry")
      }

      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      setError(errorMessage)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [characterName])

  return {
    syncTelemetry,
    fetchTelemetry,
    isLoading,
    error,
    lastSync,
  }
}
