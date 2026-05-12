"use client"

import { useState, useCallback } from 'react'
import type { TelemetryPayload, CharacterTelemetry, EnvironmentState } from '@/lib/types/telemetry'
import type { Character } from '@/lib/types/database'

interface UseTelemetryOptions {
  sessionId?: string
  campaignId?: string
  encounterId?: string
}

export function useTelemetry(options: UseTelemetryOptions = {}) {
  const [isPushing, setIsPushing] = useState(false)
  const [lastPush, setLastPush] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Build telemetry payload from current game state
  const buildPayload = useCallback((
    character: Character,
    action: {
      type: string
      intent: string
      roll?: number
      rollType?: string
      rollResult?: 'success' | 'failure' | 'critical_success' | 'critical_failure'
    },
    environment: Partial<EnvironmentState>,
    resources: {
      action: boolean
      bonusAction: boolean
      reaction: boolean
      spellSlots?: number[]
    },
    turnInfo?: {
      roundNumber: number
      initiativeOrder: string[]
      currentTurn: string
    }
  ): TelemetryPayload => {
    const telemetry: CharacterTelemetry = {
      hp: character.current_hp ?? character.max_hp ?? 10,
      max_hp: character.max_hp ?? 10,
      ac: character.armor_class ?? 10,
      position: [0, 0], // Could be extended with actual positioning
      conditions: [], // Could be extended with condition tracking
      last_roll: action.roll ?? null,
      roll_type: action.rollType ?? null,
      roll_result: action.rollResult ?? null,
      resources: {
        action: resources.action,
        bonus_action: resources.bonusAction,
        reaction: resources.reaction,
        spell_slots: resources.spellSlots ?? [],
        concentration: null,
      },
    }

    const envState: EnvironmentState = {
      name: environment.name ?? 'Unknown',
      description: environment.description ?? '',
      lighting: environment.lighting ?? 'bright',
      terrain: environment.terrain ?? [],
      hazards: environment.hazards ?? [],
      active_effects: environment.active_effects ?? [],
    }

    return {
      session_id: options.sessionId ?? `session_${Date.now()}`,
      campaign_id: options.campaignId ?? 'ashes_of_prometheus',
      encounter_id: options.encounterId ?? 'exploration',
      active_character: character.name,
      character_id: character.id,
      character_class: character.class,
      character_level: character.level ?? 1,
      telemetry,
      intent_vector: action.intent,
      action_type: action.type,
      environment: envState,
      round_number: turnInfo?.roundNumber ?? 0,
      initiative_order: turnInfo?.initiativeOrder ?? [],
      current_turn: turnInfo?.currentTurn ?? character.name,
      timestamp: new Date().toISOString(),
    }
  }, [options])

  // Push telemetry to GitHub via API
  const pushTelemetry = useCallback(async (payload: TelemetryPayload) => {
    setIsPushing(true)
    setError(null)

    try {
      const response = await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.message)
      }

      setLastPush(data.timestamp)
      return data

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to push telemetry'
      setError(message)
      throw err
    } finally {
      setIsPushing(false)
    }
  }, [])

  // Fetch current telemetry from GitHub
  const fetchTelemetry = useCallback(async (): Promise<TelemetryPayload | null> => {
    try {
      const response = await fetch('/api/telemetry')
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.message)
      }

      return data.data

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch telemetry'
      setError(message)
      return null
    }
  }, [])

  return {
    buildPayload,
    pushTelemetry,
    fetchTelemetry,
    isPushing,
    lastPush,
    error,
  }
}
