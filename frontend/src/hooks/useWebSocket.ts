import { useEffect, useRef, useState, useCallback, useMemo } from 'react'

interface UseWebSocketOptions {
  fallbackUrls?: string[]
  retryDelayMs?: number
}

interface UseWebSocketReturn {
  ws: WebSocket | null
  isConnected: boolean
  send: (data: any) => boolean
  lastMessage: any
  connectionError: string | null
  activeUrl: string | null
}

const readyStateMap: Record<number, string> = {
  0: 'CONNECTING',
  1: 'OPEN',
  2: 'CLOSING',
  3: 'CLOSED',
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<any>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [activeUrl, setActiveUrl] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number>()
  const manualCloseRef = useRef(false)
  const candidatesRef = useRef<string[]>([])
  const currentIndexRef = useRef(0)

  const retryDelayMs = options.retryDelayMs ?? 3000
  const fallbackSignature = useMemo(() => JSON.stringify(options.fallbackUrls ?? []), [options.fallbackUrls])

  const connectToIndex = useCallback((index: number) => {
    const candidates = candidatesRef.current
    const targetUrl = candidates[index]

    if (!targetUrl) {
      setConnectionError('No WebSocket URL available.')
      return
    }

    try {
      manualCloseRef.current = false
      const websocket = new WebSocket(targetUrl)

      websocket.onopen = () => {
        console.log(`✅ WebSocket connected to ${targetUrl}`)
        setIsConnected(true)
        setConnectionError(null)
        setActiveUrl(targetUrl)
        currentIndexRef.current = index
      }

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setLastMessage(data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      websocket.onerror = (error) => {
        console.error(`❌ WebSocket error (${targetUrl}):`, error)
        setConnectionError(`WebSocket encountered an error while communicating with ${targetUrl}. Check console for details.`)
      }

      websocket.onclose = (event) => {
        const reason = event.reason || readyStateMap[websocket.readyState] || 'unknown'
        const message = `WebSocket disconnected from ${targetUrl} (code: ${event.code}${event.reason ? `, reason: ${event.reason}` : ''})`
        console.log(message)
        setIsConnected(false)
        setActiveUrl(null)
        wsRef.current = null

        if (manualCloseRef.current) {
          manualCloseRef.current = false
          return
        }

        const wasAbnormal = !event.wasClean && event.code !== 1000
        const nextIndex = index + 1

        if (wasAbnormal && nextIndex < candidatesRef.current.length) {
          const fallbackUrl = candidatesRef.current[nextIndex]
          setConnectionError(`Connection closed unexpectedly (${reason}). Attempting fallback ${fallbackUrl}...`)
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connectToIndex(nextIndex)
          }, 500)
          return
        }

        currentIndexRef.current = 0
        const delaySeconds = Math.max(Math.round(retryDelayMs / 1000), 1)
        if (wasAbnormal) {
          setConnectionError(`Connection closed unexpectedly (${reason}). Retrying in ${delaySeconds}s...`)
        }

        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectToIndex(0)
        }, retryDelayMs)
      }

      wsRef.current = websocket
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      setConnectionError('Failed to create WebSocket connection.')
    }
  }, [retryDelayMs])

  useEffect(() => {
    const fallbackUrls: string[] = JSON.parse(fallbackSignature)
    const uniqueCandidates = Array.from(new Set([url, ...fallbackUrls].filter(Boolean)))
    candidatesRef.current = uniqueCandidates
    currentIndexRef.current = 0

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    if (wsRef.current) {
      manualCloseRef.current = true
      wsRef.current.close()
    }

    connectToIndex(0)

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      manualCloseRef.current = true
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [url, fallbackSignature, connectToIndex])

  const send = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
      console.debug(`📤 Sent WebSocket message: ${data.type || 'unknown-type'}`)
      setConnectionError(null)
      return true
    } else {
      const readyState = wsRef.current?.readyState ?? WebSocket.CLOSED
      const stateLabel = readyStateMap[readyState] || 'UNKNOWN'
      const message = `WebSocket is not connected (state: ${stateLabel}). Dropped message ${data.type || 'unknown-type'}`
      console.warn(message)
      setConnectionError(message)
      return false
    }
  }, [])

  return {
    ws: wsRef.current,
    isConnected,
    send,
    lastMessage,
    connectionError,
    activeUrl,
  }
}
