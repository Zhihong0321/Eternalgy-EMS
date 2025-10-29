import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDashboardSnapshot, getMeters, getHealth } from '../utils/api'
import type {
  DashboardSnapshot,
  EnergyReading,
  Meter,
  SimulatorInfo
} from '../types/dashboard'

interface RefreshOptions {
  silent?: boolean
  meterId?: number
}

interface UseDashboardDataResult {
  meters: Meter[]
  selectedMeterId: number | null
  selectMeter: (meterId: number) => void
  snapshot: DashboardSnapshot | null
  readings: EnergyReading[]
  connectedSimulators: SimulatorInfo[]
  updateConnectedSimulators: (simulators: SimulatorInfo[]) => void
  loading: boolean
  error: string | null
  refresh: (options?: RefreshOptions) => Promise<void>
  lastUpdated: Date | null
}

export function useDashboardData(initialMeterId?: number): UseDashboardDataResult {
  const [meters, setMeters] = useState<Meter[]>([])
  const [selectedMeterId, setSelectedMeterId] = useState<number | null>(
    initialMeterId !== undefined ? initialMeterId : null
  )
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [connectedSimulators, setConnectedSimulators] = useState<SimulatorInfo[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const requestIdRef = useRef(0)
  // Cooldown to avoid spamming failing endpoints
  const cooldownUntilRef = useRef<number>(0)
  const failuresRef = useRef<number>(0)

  const initializeMeters = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      // Warm up backend (e.g., serverless cold start) before fetching meters
      try {
        await getHealth()
      } catch {
        // Ignore health errors; proceed to fetch meters. The retry/timeout in fetchJson will help.
      }
      const fetchedMeters = await getMeters()
      setMeters(fetchedMeters)

      if (fetchedMeters.length === 0) {
        setSelectedMeterId(null)
        setSnapshot(null)
        setConnectedSimulators([])
        return
      }

      setSelectedMeterId((current) => {
        if (current !== null) {
          return current
        }

        if (
          initialMeterId !== undefined &&
          initialMeterId !== null &&
          fetchedMeters.some((meter) => meter.id === initialMeterId)
        ) {
          return initialMeterId
        }

        const defaultMeter = fetchedMeters.find((meter) => meter.is_simulator) || fetchedMeters[0]
        return defaultMeter?.id ?? null
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load meters'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [initialMeterId])

  useEffect(() => {
    initializeMeters()
  }, [initializeMeters])

  useEffect(() => {
    if (initialMeterId !== undefined && initialMeterId !== null) {
      setSelectedMeterId((current) => (current === initialMeterId ? current : initialMeterId))
    }
  }, [initialMeterId])

  const refresh = useCallback(async (options: RefreshOptions = {}) => {
    const targetMeterId = options.meterId ?? selectedMeterId
    if (!targetMeterId) {
      return
    }

    const requestId = ++requestIdRef.current
    if (!options.silent) {
      setLoading(true)
    }
    setError(null)

    // If we are in cooldown due to repeated failures, skip silent refreshes
    if (options.silent && cooldownUntilRef.current > Date.now()) {
      return
    }

    try {
      const snapshotResponse = await getDashboardSnapshot({ meterId: targetMeterId, limit: 120 })
      if (requestIdRef.current !== requestId) {
        return
      }

      setSnapshot(snapshotResponse)
      setConnectedSimulators(snapshotResponse.connectedSimulators || [])

      // Keep meters in sync if backend returns a fresh list
      if (snapshotResponse.allMeters?.length) {
        setMeters((existing) => {
          if (existing.length === 0) {
            return snapshotResponse.allMeters
          }

          const byId = new Map(existing.map((meter) => [meter.id, meter]))
          snapshotResponse.allMeters.forEach((meter) => byId.set(meter.id, meter))
          return Array.from(byId.values())
        })
      }

      setLastUpdated(new Date(snapshotResponse.timestamp))
      // Reset failure tracking on success
      failuresRef.current = 0
      cooldownUntilRef.current = 0
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard snapshot'
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      const isNetworkError = err instanceof TypeError
      // During silent refreshes (triggered by realtime updates), ignore abort/network errors to avoid noisy UI
      if (options.silent && (isAbort || isNetworkError)) {
        return
      }
      setError(message)
      // Increment failures and start cooldown after too many consecutive failures
      failuresRef.current += 1
      if (failuresRef.current >= 3) {
        // 15s cooldown window to prevent repeated failing requests
        cooldownUntilRef.current = Date.now() + 15000
      }
    } finally {
      if (!options.silent && requestIdRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [selectedMeterId])

  useEffect(() => {
    if (selectedMeterId) {
      refresh({ meterId: selectedMeterId })
    }
  }, [selectedMeterId, refresh])

  const selectMeter = useCallback((meterId: number) => {
    setSelectedMeterId(meterId)
    setLoading(true)
  }, [])

  const readings = useMemo(() => snapshot?.readings ?? [], [snapshot])

  const updateConnectedSimulators = useCallback((simulators: SimulatorInfo[]) => {
    setConnectedSimulators(simulators)
  }, [])

  return {
    meters,
    selectedMeterId,
    selectMeter,
    snapshot,
    readings,
    connectedSimulators,
    updateConnectedSimulators,
    loading,
    error,
    refresh,
    lastUpdated,
  }
}
