import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWebSocket } from './useWebSocket'
import type { SimulatorInfo } from '../types/dashboard'

interface SnapshotRequestOptions {
  silent?: boolean
  meterId?: number
}

interface UseDashboardRealtimeOptions {
  fallbackUrls?: string[]
  requestSnapshot: (options?: SnapshotRequestOptions) => void
  onSimulatorsUpdate?: (simulators: SimulatorInfo[]) => void
}

interface RealtimeLogEntry {
  id: number
  timestamp: number
  message: string
  tone: 'info' | 'warning' | 'error'
}

interface UseDashboardRealtimeResult {
  isConnected: boolean
  activeEndpoint: string | null
  connectionError: string | null
  logs: RealtimeLogEntry[]
  lastEvent?: RealtimeLogEntry
}

let logCounter = 0

export function useDashboardRealtime(
  url: string,
  { fallbackUrls = [], requestSnapshot, onSimulatorsUpdate }: UseDashboardRealtimeOptions
): UseDashboardRealtimeResult {
  const { isConnected, send, lastMessage, connectionError, activeUrl } = useWebSocket(url, {
    fallbackUrls
  })

  const [logs, setLogs] = useState<RealtimeLogEntry[]>([])

  const appendLog = useCallback((entry: Omit<RealtimeLogEntry, 'id'>) => {
    logCounter += 1
    setLogs((prev) => {
      const next = [...prev, { ...entry, id: logCounter }]
      return next.slice(-40)
    })
  }, [])

  useEffect(() => {
    if (!connectionError) return
    appendLog({
      timestamp: Date.now(),
      message: connectionError,
      tone: 'warning'
    })
  }, [connectionError, appendLog])

  useEffect(() => {
    if (!isConnected) {
      return
    }

    appendLog({
      timestamp: Date.now(),
      message: 'Dashboard connected to realtime service. Registering...',
      tone: 'info'
    })
    send({ type: 'dashboard:register' })
  }, [appendLog, isConnected, send])

  useEffect(() => {
    if (!lastMessage) return

    const timestamp = Date.now()

    switch (lastMessage.type) {
      case 'dashboard:initial':
        appendLog({
          timestamp,
          message: 'Initial realtime payload received. Refreshing stored data snapshot.',
          tone: 'info'
        })
        if (onSimulatorsUpdate) {
          onSimulatorsUpdate(lastMessage.simulators || [])
        }
        requestSnapshot({ meterId: lastMessage.meter?.id, silent: false })
        break
      case 'dashboard:simulators-updated':
        appendLog({
          timestamp,
          message: `Simulators online: ${(lastMessage.simulators || []).length}`,
          tone: 'info'
        })
        if (onSimulatorsUpdate) {
          onSimulatorsUpdate(lastMessage.simulators || [])
        }
        break
      case 'dashboard:update':
        appendLog({
          timestamp,
          message: `New reading stored for meter ${lastMessage.meter?.device_id || 'unknown'}`,
          tone: 'info'
        })
        requestSnapshot({ silent: true })
        break
      case 'error':
        appendLog({
          timestamp,
          message: lastMessage.message || 'Realtime service reported an error',
          tone: 'error'
        })
        break
      default:
        appendLog({
          timestamp,
          message: `Realtime message: ${lastMessage.type}`,
          tone: 'info'
        })
    }
  }, [appendLog, lastMessage, onSimulatorsUpdate, requestSnapshot])

  const lastEvent = useMemo(() => (logs.length > 0 ? logs[logs.length - 1] : undefined), [logs])

  return {
    isConnected,
    activeEndpoint: activeUrl,
    connectionError,
    logs,
    lastEvent
  }
}
