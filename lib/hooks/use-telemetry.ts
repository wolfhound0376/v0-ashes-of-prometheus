"use client"

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Character } from '@/lib/types/database'

interface TelemetryRecord {
  id?: string
  character_id: string
  campaign_id: string
  encounter_id?: string
  hp: number
  max_hp: number
  position: { x: number; y: number }
  action_type: string
  intent_vector: string
  last_roll?: number | null
  roll_type?: string | null
  environment: string
  environment_description?: string
  action_available: boolean
  bonus_action_available: boolean
  reaction_available: boolean
  session_timestamp: string
}

interface UseTelemetryOptions {
  campaignId?: string
  encounterId?: string
}

export function useTelemetry(options: UseTelemetryOptions = {}) {
  const [isPushing, setIsPushing] = useState(false)
  const [lastPush, setLastPush] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  // Build telemetry payload from current game state
  const buildPayload = useCallback((
    character: Character,
    action: {
      type: string
      intent: string
      roll?: number
      rollType?: string
    },
    environment: {
      name: string
      description?: string
    },
    resources: {
      action: boolean
      bonusAction: boolean
      reaction: boolean
    }
  ): TelemetryRecord => {
    return {
      character_id: character.id,
      campaign_id: options.campaignId ?? 'ashes_of_prometheus',
      encounter_id: options.encounterId,
      hp: character.current_hp ?? character.max_hp ?? 10,
      max_hp: character.max_hp ?? 10,
      position: { x: 0, y: 0 },
      action_type: action.type,
      intent_vector: action.intent,
      last_roll: action.roll ?? null,
      roll_type: action.rollType ?? null,
      environment: environment.name,
      environment_description: environment.description,
      action_available: resources.action,
      bonus_action_available: resources.bonusAction,
      reaction_available: resources.reaction,
      session_timestamp: new Date().toISOString(),
    }
  }, [options])

  // Push telemetry to Supabase
  const pushTelemetry = useCallback(async (payload: TelemetryRecord) => {
    setIsPushing(true)
    setError(null)

    try {
      const { data, error: insertError } = await supabase
        .from('session_telemetry')
        .insert(payload)
        .select()
        .single()

      if (insertError) {
        throw new Error(insertError.message)
      }

      const timestamp = new Date().toISOString()
      setLastPush(timestamp)
      return { success: true, data, timestamp }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to push telemetry'
      setError(message)
      throw err
    } finally {
      setIsPushing(false)
    }
  }, [supabase])

  // Fetch latest telemetry for a character from Supabase
  const fetchTelemetry = useCallback(async (characterId?: string): Promise<TelemetryRecord | null> => {
    try {
      let query = supabase
        .from('session_telemetry')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)

      if (characterId) {
        query = query.eq('character_id', characterId)
      }

      const { data, error: fetchError } = await query.single()

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // No rows returned - not an error
          return null
        }
        throw new Error(fetchError.message)
      }

      return data

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch telemetry'
      setError(message)
      return null
    }
  }, [supabase])

  // Fetch telemetry history for a character
  const fetchTelemetryHistory = useCallback(async (
    characterId: string, 
    limit: number = 10
  ): Promise<TelemetryRecord[]> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('session_telemetry')
        .select('*')
        .eq('character_id', characterId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (fetchError) {
        throw new Error(fetchError.message)
      }

      return data ?? []

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch telemetry history'
      setError(message)
      return []
    }
  }, [supabase])

  return {
    buildPayload,
    pushTelemetry,
    fetchTelemetry,
    fetchTelemetryHistory,
    isPushing,
    lastPush,
    error,
  }
}
